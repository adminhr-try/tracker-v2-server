const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { CAN_APPROVE } = require('../config/roles');
const {
  startOfDayIST: startOfDay,
  getISTYear,
  getISTMonth,
  monthRangeIST,
  yearRangeIST,
} = require('../utils/dateUtils');
const { resolveApprover } = require('../utils/approverUtils');

exports.todayStatus = async (req, res) => {
  try {
    const today = startOfDay();
    const record = await Attendance.findOne({ user: req.user._id, date: today });
    res.status(200).json(record || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Same annual cap as CL/SL leave — see leaveController.js's ANNUAL_QUOTA.
const ANNUAL_WFH_QUOTA = 12;

exports.checkIn = async (req, res) => {
  try {
    const { workMode, dayPart } = req.body; // workMode: 'office' | 'wfh'; dayPart: 'full' | 'first-half' | 'second-half'
    const today = startOfDay();
    const validDayPart = ['full', 'first-half', 'second-half'].includes(dayPart) ? dayPart : 'full';
    const resolvedWorkMode = workMode === 'wfh' ? 'wfh' : 'office';

    const existing = await Attendance.findOne({ user: req.user._id, date: today });
    if (existing && existing.checkIn) {
      return res.status(400).json({ message: 'Already checked in today' });
    }

    if (resolvedWorkMode === 'wfh') {
      const { from: yearStart, to: yearEnd } = yearRangeIST(getISTYear(today));
      const wfhRecords = await Attendance.find({
        user: req.user._id,
        workMode: 'wfh',
        date: { $gte: yearStart, $lt: yearEnd, $ne: today }, // today counted separately below
      });
      const wfhUsed = wfhRecords.reduce((sum, r) => sum + (r.dayPart !== 'full' ? 0.5 : 1), 0);
      const thisDayAmount = validDayPart !== 'full' ? 0.5 : 1;

      if (wfhUsed + thisDayAmount > ANNUAL_WFH_QUOTA) {
        return res.status(400).json({
          message: `This would exceed your annual WFH limit of ${ANNUAL_WFH_QUOTA} days (${Math.max(0, ANNUAL_WFH_QUOTA - wfhUsed)} remaining).`,
        });
      }
    }

    const record = existing
      ? Object.assign(existing, { checkIn: new Date(), workMode: resolvedWorkMode, dayPart: validDayPart })
      : new Attendance({
          user: req.user._id,
          date: today,
          checkIn: new Date(),
          workMode: resolvedWorkMode,
          dayPart: validDayPart,
        });

    await record.save();
    res.status(200).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.checkOut = async (req, res) => {
  try {
    const today = startOfDay();
    const record = await Attendance.findOne({ user: req.user._id, date: today });

    if (!record || !record.checkIn) {
      return res.status(400).json({ message: 'You need to check in first' });
    }
    if (record.checkOut) {
      return res.status(400).json({ message: 'Already checked out today' });
    }
    if (record.workMode === 'wfh' && !record.eodReport.submitted) {
      return res.status(400).json({ message: 'Submit your EOD report before checking out' });
    }

    record.checkOut = new Date();
    record.totalHours = +((record.checkOut - record.checkIn) / 36e5).toFixed(2);
    await record.save();

    res.status(200).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.submitEodReport = async (req, res) => {
  try {
    const { content } = req.body;
    const today = startOfDay();

    const record = await Attendance.findOne({ user: req.user._id, date: today });
    if (!record) return res.status(400).json({ message: 'No attendance record for today yet' });

    // Same approver resolution as leave/regularisation — falls back to HR
    // (or CEO, if this user IS HR) when there's no reportingTo. Only truly
    // auto-approves if not even that fallback finds anyone, so it doesn't
    // sit pending forever with nobody able to review it.
    const approverId = await resolveApprover(req.user);
    record.eodReport = {
      submitted: true,
      content,
      submittedAt: new Date(),
      approver: approverId || undefined,
      status: approverId ? 'pending' : 'approved',
      reviewedAt: approverId ? undefined : new Date(),
    };
    await record.save();

    res.status(200).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Approver: EOD reports awaiting their review
exports.pendingEodApprovals = async (req, res) => {
  try {
    if (!CAN_APPROVE.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not approve requests' });
    }

    const records = await Attendance.find({
      'eodReport.approver': req.user._id,
      'eodReport.status': 'pending',
      'eodReport.submitted': true,
    })
      .populate('user', 'name email role department')
      .sort({ 'eodReport.submittedAt': 1 });

    res.status(200).json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const reviewEod = (newStatus) => async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id).populate('user', 'name');
    if (!record || !record.eodReport?.submitted) {
      return res.status(404).json({ message: 'EOD report not found' });
    }
    if (!record.eodReport.approver || record.eodReport.approver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not the approver for this report' });
    }
    if (record.eodReport.status !== 'pending') {
      return res.status(400).json({ message: `EOD report already ${record.eodReport.status}` });
    }

    record.eodReport.status = newStatus;
    record.eodReport.reviewedAt = new Date();
    await record.save();

    // Notify the employee, and cascade one level up — e.g. when a manager
    // approves, whoever the manager themselves reports to (typically HR)
    // is notified too, so oversight isn't limited to only who clicked approve.
    const verb = newStatus === 'approved' ? 'approved' : 'rejected';
    const dateLabel = record.date.toISOString().slice(0, 10);
    await Notification.notify({
      user: record.user._id,
      type: `eod-${newStatus}`,
      message: `Your EOD report for ${dateLabel} was ${verb} by ${req.user.name}.`,
      link: '/approval-history',
    });
    if (req.user.reportingTo) {
      await Notification.notify({
        user: req.user.reportingTo,
        type: `eod-${newStatus}`,
        message: `${req.user.name} ${verb} ${record.user.name}'s EOD report.`,
        link: '/approval-history',
      });
    }

    res.status(200).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveEod = reviewEod('approved');
exports.rejectEod = reviewEod('rejected');

// History of EOD reports this user has approved/rejected — "X eod approved by
// Y on <date>" style log, newest first.
exports.eodApprovalHistory = async (req, res) => {
  try {
    if (!CAN_APPROVE.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not approve requests' });
    }

    // HR/CEO get the full org-wide history — everyone else only sees
    // decisions they personally made.
    const isOrgWide = ['hr', 'ceo'].includes(req.user.role);
    const filter = { 'eodReport.status': { $in: ['approved', 'rejected'] } };
    if (!isOrgWide) filter['eodReport.approver'] = req.user._id;

    const records = await Attendance.find(filter)
      .populate('user', 'name email role department')
      .populate('eodReport.approver', 'name')
      .sort({ 'eodReport.reviewedAt': -1 });

    res.status(200).json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employee/Manager: attendance of their immediate team, today
// Dashboard widget: current-month attendance counts, scoped to the
// viewer's team (employee/manager) or the whole org (hr/ceo)
// All WFH check-ins this year — for the clickable "WFH 05/12" sidebar link
exports.myWfhDates = async (req, res) => {
  try {
    const { from: yearStart, to: yearEnd } = yearRangeIST(getISTYear());

    const records = await Attendance.find({
      user: req.user._id,
      workMode: 'wfh',
      date: { $gte: yearStart, $lt: yearEnd },
    }).sort({ date: -1 });

    res.status(200).json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.dashboardSummary = async (req, res) => {
  try {
    const isOrgWide = ['hr', 'ceo'].includes(req.user.role);
    let userIds;
    if (isOrgWide) {
      userIds = (await User.find({ isActive: true }).select('_id')).map((u) => u._id);
    } else {
      // Computed directly from reportingTo (authoritative) rather than the
      // teamMembers array, which can drift out of sync — see
      // fixReportingRelationships.js for why. For a plain employee this is
      // just themselves, since nobody reports to them.
      const reports = await User.find({ reportingTo: req.user._id, isActive: true }).select('_id');
      userIds = [req.user._id, ...reports.map((u) => u._id)];
    }

    const { from, to } = monthRangeIST(getISTYear(), getISTMonth());

    const records = await Attendance.find({ user: { $in: userIds }, date: { $gte: from, $lt: to } });

    const summary = { present: 0, absent: 0, leave: 0, wfh: 0 };
    records.forEach((r) => {
      if (r.workMode === 'wfh') summary.wfh++;
      else if (r.status === 'present') summary.present++;
      if (r.status === 'on-leave' || r.status === 'half-day') summary.leave++;
      if (r.status === 'absent') summary.absent++;
    });

    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// "Today's Team" — scope and detail depend on role (HR/CEO don't hit this
// endpoint at all; they get the full org via orgToday, with times):
//  - employee: peers who share the same manager, status only, no punch-in/out
//    time
//  - manager: their direct reports, with full punch-in/out time
exports.teamToday = async (req, res) => {
  try {
    const today = startOfDay();
    const me = req.user;
    const isEmployee = me.role === 'employee';

    let teamIds;
    if (isEmployee) {
      if (!me.reportingTo) return res.status(200).json([]);
      const peers = await User.find({
        reportingTo: me.reportingTo,
        isActive: true,
        _id: { $ne: me._id },
      }).select('_id');
      teamIds = peers.map((u) => u._id);
    } else {
      // Manager — computed directly from reportingTo (authoritative) rather
      // than the teamMembers array, which can drift out of sync — see
      // fixReportingRelationships.js for why.
      const reports = await User.find({ reportingTo: me._id, isActive: true }).select('_id');
      teamIds = reports.map((u) => u._id);
    }

    const records = await Attendance.find({ user: { $in: teamIds }, date: today }).populate(
      'user',
      'name email role department'
    );

    if (!isEmployee) {
      return res.status(200).json(records);
    }

    // Employee view — strip punch-in/out time per the role-based visibility
    // rules; only managers and HR/CEO see timing detail.
    const stripped = records.map((r) => ({
      _id: r._id,
      user: r.user,
      workMode: r.workMode,
      dayPart: r.dayPart,
      status: r.status,
    }));
    res.status(200).json(stripped);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO: org-wide attendance today + summary counts. Also returns the
// actual employee list behind each of the Present/Absent/WFH counts, so the
// dashboard cards can pop open "who's in this bucket" without a second call.
exports.orgToday = async (req, res) => {
  try {
    const today = startOfDay();
    const allUsers = await User.find({ isActive: true }).select('name email role department');
    const records = await Attendance.find({ date: today }).populate('user', 'name email role department');

    const summary = { present: 0, absent: 0, onLeave: 0, wfh: 0, halfDay: 0 };
    const recordedUserIds = new Set(records.map((r) => r.user._id.toString()));

    const presentUsers = [];
    const wfhUsers = [];
    records.forEach((r) => {
      // WFH and in-office present are mutually exclusive buckets — a WFH
      // check-in still carries status "present" on the record, so this must
      // check workMode first or someone would be double-counted in both.
      if (r.workMode === 'wfh') {
        wfhUsers.push(r.user);
        summary.wfh++;
      } else if (r.status === 'present') {
        presentUsers.push(r.user);
        summary.present++;
      }
      if (r.status === 'on-leave') summary.onLeave++;
      if (r.status === 'half-day') summary.halfDay++;
    });

    const absentUsers = allUsers.filter((u) => !recordedUserIds.has(u._id.toString()));
    summary.absent = absentUsers.length;

    res.status(200).json({ summary, records, presentUsers, absentUsers, wfhUsers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Any logged-in user: their own monthly attendance
exports.myMonthly = async (req, res) => {
  try {
    const { month, year } = req.query; // month: 1-12
    const y = parseInt(year) || getISTYear();
    const m = parseInt(month) || getISTMonth();

    const { from, to } = monthRangeIST(y, m);

    const records = await Attendance.find({
      user: req.user._id,
      date: { $gte: from, $lt: to },
    }).sort({ date: 1 });

    res.status(200).json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only — Administration > Attendance View. Same shape as myMonthly,
// scoped to whichever employee they picked instead of themselves.
exports.employeeMonthly = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;
    const y = parseInt(year) || getISTYear();
    const m = parseInt(month) || getISTMonth();

    const employee = await User.findById(userId).select('name email role department employeeId');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { from, to } = monthRangeIST(y, m);

    const records = await Attendance.find({
      user: userId,
      date: { $gte: from, $lt: to },
    }).sort({ date: 1 });

    res.status(200).json({ employee, records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
