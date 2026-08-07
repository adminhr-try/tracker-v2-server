const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },

    // Core role — drives permissions & dashboard views
    role: {
      type: String,
      enum: ['employee', 'manager', 'hr', 'ceo'],
      required: true,
      default: 'employee',
    },

    department: { type: String, trim: true },
    designation: { type: String, trim: true },

    // Profile photo — stored as a base64 data URI (small avatar images only)
    photoUrl: { type: String },

    // Who approves this user's leave requests
    // employee -> their manager
    // manager  -> hr
    // hr       -> ceo (or a designated senior approver)
    reportingTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Only meaningful if role === 'manager', lists employees under them
    teamMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
