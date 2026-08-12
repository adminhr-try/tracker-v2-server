const mongoose = require('mongoose');

// A request to correct a day's attendance when someone forgot to check in
// and/or check out. On approval, the corrected time(s) are written into the
// Attendance record for that day (creating it if it doesn't exist yet).
const regularisationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Who needs to approve this — set automatically from user.reportingTo,
    // same pattern as LeaveRequest.
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    date: { type: Date, required: true }, // the day being corrected

    // At least one of these two must be set (enforced in the controller,
    // not the schema, so a check-in-only or checkout-only fix is valid).
    requestedCheckIn: { type: Date },
    requestedCheckOut: { type: Date },

    // Only used if there's no existing Attendance record for `date` yet
    // (e.g. they forgot to check in at all) — becomes that record's workMode.
    workMode: { type: String, enum: ['office', 'wfh'], default: 'office' },

    // Required when workMode is 'wfh' — same proof-of-work requirement as a
    // live WFH day (which can't be checked out of without one). Written into
    // the created Attendance record's eodReport once the manager approves.
    eodContent: { type: String, trim: true },

    reason: { type: String, trim: true, required: true },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Regularisation', regularisationSchema);
