const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Store date-only (midnight) so you can query "today" / "this month" cleanly
    date: { type: Date, required: true },

    checkIn: { type: Date },
    checkOut: { type: Date },

    workMode: {
      type: String,
      enum: ['office', 'wfh'],
      default: 'office',
    },

    // Full day / first half / second half — selectable on check-in (mainly for WFH)
    dayPart: {
      type: String,
      enum: ['full', 'first-half', 'second-half'],
      default: 'full',
    },

    // Required only when workMode === 'wfh'. Enforce in controller logic,
    // e.g. block checkout (or mark day incomplete) until this is filled.
    eodReport: {
      submitted: { type: Boolean, default: false },
      content: { type: String, trim: true },
      submittedAt: { type: Date },

      // Approval workflow — mirrors LeaveRequest's approver/status pattern
      approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
      },
      reviewedAt: { type: Date },
    },

    status: {
      type: String,
      enum: ['present', 'absent', 'half-day', 'on-leave', 'holiday'],
      default: 'present',
    },

    // auto-calculated on checkout (in hours), handy for reports
    totalHours: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One attendance record per user per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
