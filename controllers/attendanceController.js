const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { CAN_APPROVE } = require('../config/roles');

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

exports.todayStatus = async (req, res) => {
  try {
    const today = startOfDay();
    const record = await Attendance.findOne({ user: req.user._id, date: today });
    res.status(200).json(record || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.checkIn = async (req, res) => {
  try {
    const { workMode, dayPart } = req.body; // workMode: 'office' | 'wfh'; dayPart: 'full' | 'first-half' | 'second-half'
    const today = startOfDay();
    const validDayPart = ['full', 'first-half', 'second-half'].includes(dayPart) ? dayPart : 'full';

    const existing = await Attendance.findOne({ user: req.user._id, date: today });
    if (existing && existing.checkIn) {
      return res.status(400).json({ message: 'Already checked in today' });
    }

    const record = existing
      ? Object.assign(existing, { checkIn: new Date(), workMode: workMode || 'office', dayPart: validDayPart })
      : new Attendance({
          user: req.user._id,
          date: today,
          checkIn: new Date(),
          workMode: workMode || 'office',
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

    // If the user has no one above them (e.g. CEO), there's no one to approve it —
    // auto-approve so it doesn't sit pending forever.
    const hasApprover = !!req.user.reportingTo;
    record.eodReport = {
      submitted: true,
      content,
      submittedAt: new Date(),
      approver: hasApprover ? req.user.reportingTo : undefined,
      status: hasApprover ? 'pending' : 'approved',
      reviewedAt: hasApprover ? undefined : new Date(),
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
    const record = await Attendance.findById(req.params.id);
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

    const records = await Attendance.find({
      'eodReport.approver': req.user._id,
      'eodReport.status': { $in: ['approved', 'rejected'] },
    })
      .populate('user', 'name email role department')
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
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const records = await Attendance.find({
      user: req.user._id,
      workMode: 'wfh',
      date: { $gte: yearStart, $lte: yearEnd },
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
      const me = await User.findById(req.user._id).populate('teamMembers', '_id');
      userIds = [req.user._id, ...(me.teamMembers || []).map((m) => m._id)];
    }

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const records = await Attendance.find({ user: { $in: userIds }, date: { $gte: from, $lte: to } });

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

exports.teamToday = async (req, res) => {
  try {
    const manager = await User.findById(req.user._id).populate('teamMembers', 'name email role');
    const teamIds = manager.teamMembers.map((m) => m._id);

    const today = startOfDay();
    const records = await Attendance.find({ user: { $in: teamIds }, date: today }).populate(
      'user',
      'name email role'
    );

    res.status(200).json(records);
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
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;

    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59);

    const records = await Attendance.find({
      user: req.user._id,
      date: { $gte: from, $lte: to },
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
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;

    const employee = await User.findById(userId).select('name email role department employeeId');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59);

    const records = await Attendance.find({
      user: userId,
      date: { $gte: from, $lte: to },
    }).sort({ date: 1 });

    res.status(200).json({ employee, records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
