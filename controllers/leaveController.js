const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { CAN_APPROVE } = require('../config/roles');

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
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const approvedLeaves = await LeaveRequest.find({
      user: req.user._id,
      status: 'approved',
      fromDate: { $gte: yearStart, $lte: yearEnd },
    });

    const used = { CL: 0, SL: 0 };
    approvedLeaves.forEach((r) => {
      if (used[r.leaveType] !== undefined) used[r.leaveType] += daysUsed(r);
    });

    const wfhRecords = await Attendance.find({
      user: req.user._id,
      workMode: 'wfh',
      date: { $gte: yearStart, $lte: yearEnd },
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

    // first-half/second-half only make sense for a single-day request
    const validDayPart = ['full', 'first-half', 'second-half'].includes(dayPart) ? dayPart : 'full';

    const request = await LeaveRequest.create({
      user: req.user._id,
      approver: req.user.reportingTo, // never trust client-supplied approver
      leaveType,
      fromDate,
      toDate,
      reason,
      dayPart: fromDate === toDate ? validDayPart : 'full',
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
    const request = await LeaveRequest.findById(req.params.id);
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
          day.setHours(0, 0, 0, 0);
          const dayStatus = request.dayPart !== 'full' ? 'half-day' : 'on-leave';
          return Attendance.findOneAndUpdate(
            { user: request.user, date: day },
            { user: request.user, date: day, status: dayStatus, dayPart: request.dayPart },
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

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const requests = await LeaveRequest.find({
      user: req.user._id,
      leaveType: type,
      status: 'approved',
      fromDate: { $gte: yearStart, $lte: yearEnd },
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
