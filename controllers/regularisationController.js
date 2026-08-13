const Regularisation = require('../models/Regularisation');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const { CAN_APPROVE } = require('../config/roles');
const { startOfDayIST: startOfDay, getISTYear, yearRangeIST } = require('../utils/dateUtils');

// Same annual cap as CL/SL leave and the WFH check-in — see leaveController.js's
// ANNUAL_QUOTA. Only relevant here when approval would *create* a fresh WFH
// day (see the quota check inside reviewRequest below) — a correction to an
// existing record's check-in/out time doesn't touch workMode.
const ANNUAL_WFH_QUOTA = 12;

// Any logged-in user — submit a correction for a day they forgot to check
// in/out. Approver is resolved server-side from reportingTo, same as leave.
exports.createRequest = async (req, res) => {
  try {
    const { date, requestedCheckIn, requestedCheckOut, workMode, reason, eodContent } = req.body;
    const resolvedWorkMode = workMode === 'wfh' ? 'wfh' : 'office';

    if (!date) return res.status(400).json({ message: 'Date is required' });
    if (!requestedCheckIn && !requestedCheckOut) {
      return res.status(400).json({ message: 'Provide a corrected check-in time, check-out time, or both' });
    }
    if (!reason) return res.status(400).json({ message: 'Reason is required' });
    if (resolvedWorkMode === 'wfh' && !eodContent?.trim()) {
      return res.status(400).json({ message: 'An EOD report is required for a Work From Home day.' });
    }
    if (!req.user.reportingTo) {
      return res.status(400).json({ message: 'No approver configured for your account. Contact admin.' });
    }

    const request = await Regularisation.create({
      user: req.user._id,
      approver: req.user.reportingTo,
      date: startOfDay(date),
      requestedCheckIn: requestedCheckIn || undefined,
      requestedCheckOut: requestedCheckOut || undefined,
      workMode: resolvedWorkMode,
      eodContent: resolvedWorkMode === 'wfh' ? eodContent.trim() : undefined,
      reason,
    });

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.myRequests = async (req, res) => {
  try {
    const requests = await Regularisation.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Approver: regularisation requests awaiting their review
exports.pendingApprovals = async (req, res) => {
  try {
    if (!CAN_APPROVE.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not approve requests' });
    }
    const requests = await Regularisation.find({ approver: req.user._id, status: 'pending' })
      .populate('user', 'name email role department')
      .sort({ createdAt: 1 });
    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const reviewRequest = (newStatus) => async (req, res) => {
  try {
    const request = await Regularisation.findById(req.params.id).populate('user', 'name');
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.approver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not the approver for this request' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request already ${request.status}` });
    }

    // A WFH regularisation can only be approved once the employee has
    // pushed an EOD report for it — same proof-of-work bar as a live WFH
    // day, which can't be checked out of without one either.
    if (newStatus === 'approved' && request.workMode === 'wfh' && !request.eodContent) {
      return res.status(400).json({
        message: `Cannot approve — ${request.user.name} has not submitted an EOD report for this WFH day.`,
      });
    }

    // A regularisation can create a brand-new WFH attendance record (for a
    // day the employee never checked in on) — that's still a new WFH day,
    // so it has to respect the same annual cap as checking in WFH directly,
    // or someone could bypass the limit via a correction instead.
    if (newStatus === 'approved' && request.workMode === 'wfh') {
      const alreadyExists = await Attendance.findOne({ user: request.user._id, date: request.date });
      if (!alreadyExists) {
        const { from: yearStart, to: yearEnd } = yearRangeIST(getISTYear(request.date));
        const wfhRecords = await Attendance.find({
          user: request.user._id,
          workMode: 'wfh',
          date: { $gte: yearStart, $lt: yearEnd },
        });
        const wfhUsed = wfhRecords.reduce((sum, r) => sum + (r.dayPart !== 'full' ? 0.5 : 1), 0);
        if (wfhUsed + 1 > ANNUAL_WFH_QUOTA) {
          return res.status(400).json({
            message: `Approving this would exceed ${request.user.name}'s annual WFH limit of ${ANNUAL_WFH_QUOTA} days (${Math.max(0, ANNUAL_WFH_QUOTA - wfhUsed)} remaining).`,
          });
        }
      }
    }

    request.status = newStatus;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.reviewNote || '';
    await request.save();

    // Notify the employee, and cascade one level up — same pattern as
    // leave/EOD approvals.
    const verb = newStatus === 'approved' ? 'approved' : 'rejected';
    await Notification.notify({
      user: request.user._id,
      type: `regularisation-${newStatus}`,
      message: `Your attendance regularisation request was ${verb} by ${req.user.name}.`,
      link: '/approval-history',
    });
    if (req.user.reportingTo) {
      await Notification.notify({
        user: req.user.reportingTo,
        type: `regularisation-${newStatus}`,
        message: `${req.user.name} ${verb} ${request.user.name}'s regularisation request.`,
        link: '/approval-history',
      });
    }

    // Approval writes the corrected time(s) into that day's Attendance
    // record — updating it if it exists, creating it if the person never
    // checked in at all that day.
    if (newStatus === 'approved') {
      const existing = await Attendance.findOne({ user: request.user._id, date: request.date });

      if (existing) {
        if (request.requestedCheckIn) existing.checkIn = request.requestedCheckIn;
        if (request.requestedCheckOut) existing.checkOut = request.requestedCheckOut;
        if (existing.checkIn && existing.checkOut) {
          existing.totalHours = +((existing.checkOut - existing.checkIn) / 36e5).toFixed(2);
        }
        await existing.save();
      } else {
        const checkIn = request.requestedCheckIn || undefined;
        const checkOut = request.requestedCheckOut || undefined;
        const totalHours =
          checkIn && checkOut ? +((new Date(checkOut) - new Date(checkIn)) / 36e5).toFixed(2) : 0;
        await Attendance.create({
          user: request.user._id,
          date: request.date,
          workMode: request.workMode,
          status: 'present',
          checkIn,
          checkOut,
          totalHours,
          eodReport:
            request.workMode === 'wfh'
              ? {
                  submitted: true,
                  content: request.eodContent,
                  submittedAt: request.createdAt,
                  approver: req.user._id,
                  status: 'approved',
                  reviewedAt: new Date(),
                }
              : undefined,
        });
      }
    }

    res.status(200).json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveRequest = reviewRequest('approved');
exports.rejectRequest = reviewRequest('rejected');

// History of regularisation requests this user has approved/rejected
exports.approvalHistory = async (req, res) => {
  try {
    if (!CAN_APPROVE.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not approve requests' });
    }
    const requests = await Regularisation.find({
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
