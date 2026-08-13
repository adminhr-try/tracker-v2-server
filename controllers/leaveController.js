const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const { CAN_APPROVE } = require('../config/roles');
const { startOfDayIST, getISTYear, yearRangeIST } = require('../utils/dateUtils');

const ANNUAL_QUOTA = { CL: 12, SL: 12, WFH: 12 };

// Days consumed by an approved leave request (0.5 for a half-day single-day request)
function daysUsed(request) {
  if (request.dayPart !== 'full' && request.fromDate.getTime() === request.toDate.getTime()) {
    return 0.5;
  }
  const diffMs = new Date(request.toDate) - new Date(request.fromDate);
  return Math.round(diffMs / 86400000) + 1;
}

// Current-year leave/WFH balance for the logged-in user, shown in the sidebar
exports.leaveBalance = async (req, res) => {
  try {
    const { from: yearStart, to: yearEnd } = yearRangeIST(getISTYear());

    const approvedLeaves = await LeaveRequest.find({
      user: req.user._id,
      status: 'approved',
      fromDate: { $gte: yearStart, $lt: yearEnd },
    });

    const used = { CL: 0, SL: 0 };
    approvedLeaves.forEach((r) => {
      if (used[r.leaveType] !== undefined) used[r.leaveType] += daysUsed(r);
    });

    const wfhRecords = await Attendance.find({
      user: req.user._id,
      workMode: 'wfh',
      date: { $gte: yearStart, $lt: yearEnd },
    });
    const wfhUsed = wfhRecords.reduce((sum, r) => sum + (r.dayPart !== 'full' ? 0.5 : 1), 0);

    res.status(200).json({
      CL: { used: used.CL, total: ANNUAL_QUOTA.CL },
      SL: { used: used.SL, total: ANNUAL_QUOTA.SL },
      WFH: { used: wfhUsed, total: ANNUAL_QUOTA.WFH },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createRequest = async (req, res) => {
  try {
    const { leaveType, fromDate, toDate, reason, dayPart } = req.body;

    if (!req.user.reportingTo) {
      return res.status(400).json({ message: 'No approver configured for your account. Contact admin.' });
    }
    if (!['CL', 'SL'].includes(leaveType)) {
      return res.status(400).json({ message: 'Invalid leave type' });
    }

    // first-half/second-half only make sense for a single-day request
    const validDayPart = ['full', 'first-half', 'second-half'].includes(dayPart) ? dayPart : 'full';
    const resolvedDayPart = fromDate === toDate ? validDayPart : 'full';

    const requestedDays = daysUsed({
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      dayPart: resolvedDayPart,
    });

    // Enforce the annual quota against approved + still-pending requests —
    // pending has to count too, or someone could stack far more than 12
    // days of pending requests and have them all approved after the fact.
    // (The balance shown on Leave & WFH only counts approved, per spec —
    // this check is just the submission-time safety net, slightly stricter.)
    const { from: yearStart, to: yearEnd } = yearRangeIST(getISTYear());
    const existingRequests = await LeaveRequest.find({
      user: req.user._id,
      leaveType,
      status: { $in: ['approved', 'pending'] },
      fromDate: { $gte: yearStart, $lt: yearEnd },
    });
    const alreadyCommitted = existingRequests.reduce((sum, r) => sum + daysUsed(r), 0);

    if (alreadyCommitted + requestedDays > ANNUAL_QUOTA[leaveType]) {
      const remaining = Math.max(0, ANNUAL_QUOTA[leaveType] - alreadyCommitted);
      return res.status(400).json({
        message: `This would exceed your annual ${leaveType} limit of ${ANNUAL_QUOTA[leaveType]} days (${remaining} remaining).`,
      });
    }

    const request = await LeaveRequest.create({
      user: req.user._id,
      approver: req.user.reportingTo, // never trust client-supplied approver
      leaveType,
      fromDate,
      toDate,
      reason,
      dayPart: resolvedDayPart,
    });

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.myRequests = async (req, res) => {
  try {
    const requests = await LeaveRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.pendingApprovals = async (req, res) => {
  try {
    if (!CAN_APPROVE.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not approve requests' });
    }

    const requests = await LeaveRequest.find({
      approver: req.user._id,
      status: 'pending',
    })
      .populate('user', 'name email role department')
      .sort({ createdAt: 1 });

    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const reviewRequest = (newStatus) => async (req, res) => {
  try {
    const request = await LeaveRequest.findById(req.params.id).populate('user', 'name');
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.approver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not the approver for this request' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request already ${request.status}` });
    }

    request.status = newStatus;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.reviewNote || '';
    await request.save();

    // Notify the employee, and cascade one level up — e.g. when a manager
    // approves, whoever the manager themselves reports to (typically HR)
    // is notified too, so oversight isn't limited to only who clicked approve.
    const verb = newStatus === 'approved' ? 'approved' : 'rejected';
    await Notification.notify({
      user: request.user._id,
      type: `leave-${newStatus}`,
      message: `Your ${request.leaveType} request was ${verb} by ${req.user.name}.`,
      link: '/approval-history',
    });
    if (req.user.reportingTo) {
      await Notification.notify({
        user: req.user.reportingTo,
        type: `leave-${newStatus}`,
        message: `${req.user.name} ${verb} ${request.user.name}'s ${request.leaveType} request.`,
        link: '/approval-history',
      });
    }

    // Mark attendance as on-leave for each day in range, if approved
    if (newStatus === 'approved') {
      const days = [];
      let d = new Date(request.fromDate);
      const end = new Date(request.toDate);
      while (d <= end) {
        days.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }

      await Promise.all(
        days.map((day) => {
          const dayKey = startOfDayIST(day);
          const dayStatus = request.dayPart !== 'full' ? 'half-day' : 'on-leave';
          return Attendance.findOneAndUpdate(
            { user: request.user._id, date: dayKey },
            { user: request.user._id, date: dayKey, status: dayStatus, dayPart: request.dayPart },
            { upsert: true, new: true }
          );
        })
      );
    }

    res.status(200).json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveRequest = reviewRequest('approved');
exports.rejectRequest = reviewRequest('rejected');

// All approved leave requests of a given type (CL or SL) this year — for the
// clickable "SL 01/12" / "CL 03/12" sidebar link, listing the actual dates taken
exports.leaveDatesByType = async (req, res) => {
  try {
    const type = (req.params.type || '').toUpperCase();
    if (!['CL', 'SL'].includes(type)) {
      return res.status(400).json({ message: 'Invalid leave type' });
    }

    const { from: yearStart, to: yearEnd } = yearRangeIST(getISTYear());

    const requests = await LeaveRequest.find({
      user: req.user._id,
      leaveType: type,
      status: 'approved',
      fromDate: { $gte: yearStart, $lt: yearEnd },
    }).sort({ fromDate: -1 });

    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// History of leave requests this user has approved/rejected — "X leave request
// approved by Y on <date>" style log, newest first.
exports.approvalHistory = async (req, res) => {
  try {
    if (!CAN_APPROVE.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not approve requests' });
    }

    const requests = await LeaveRequest.find({
      approver: req.user._id,
      status: { $in: ['approved', 'rejected'] },
    })
      .populate('user', 'name email role department')
      .sort({ reviewedAt: -1 });

    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
