const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Who needs to approve this — set automatically from user.reportingTo
    // (employee -> manager, manager -> hr, hr -> ceo)
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    leaveType: {
      type: String,
      enum: ['CL', 'SL'], // Casual Leave, Sick Leave — extend later if needed
      required: true,
    },

    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, trim: true, required: true },

    // Only meaningful when fromDate === toDate (single day request)
    dayPart: {
      type: String,
      enum: ['full', 'first-half', 'second-half'],
      default: 'full',
    },

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

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
