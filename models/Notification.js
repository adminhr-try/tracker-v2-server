const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // recipient

    type: {
      type: String,
      enum: [
        'eod-approved', 'eod-rejected',
        'leave-approved', 'leave-rejected',
        'regularisation-approved', 'regularisation-rejected',
      ],
      required: true,
    },

    message: { type: String, trim: true, required: true },

    // Where clicking the notification should take you — a route path, not
    // a full URL, so the frontend can just plug it into its own router.
    link: { type: String, trim: true },

    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

// Fire-and-forget helper used by other controllers right after an
// approve/reject action. Never throws into the caller — a notification
// failing to save should not fail the approval itself.
notificationSchema.statics.notify = async function ({ user, type, message, link }) {
  if (!user) return null;
  try {
    return await this.create({ user, type, message, link });
  } catch (err) {
    console.error('Notification.notify failed:', err.message);
    return null;
  }
};

module.exports = mongoose.model('Notification', notificationSchema);
