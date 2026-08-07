const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Department = require('../models/Department');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Only HR/CEO should be allowed to hit this in your routes (see routes/auth.js)
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, department, designation, reportingTo, reportingToEmail } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    let resolvedReportingTo = reportingTo || null;
    if (!resolvedReportingTo && reportingToEmail) {
      const approver = await User.findOne({ email: reportingToEmail });
      if (!approver) return res.status(400).json({ message: `No user found with email ${reportingToEmail}` });
      resolvedReportingTo = approver._id;
    }

    // Save the department for reuse on future users, whether it was picked
    // from the existing list or typed in fresh via "Other".
    if (department) await Department.ensureExists(department);

    const user = await User.create({ name, email, password, role, department, designation, reportingTo: resolvedReportingTo });

    // If this new user reports to a manager, add them to that manager's team
    if (reportingTo) {
      await User.findByIdAndUpdate(reportingTo, { $addToSet: { teamMembers: user._id } });
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: signToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      photoUrl: user.photoUrl || null,
      token: signToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only — powers the "reports to" picker on the Create User screen.
// Only managers/HR/CEO are valid approvers (see CAN_APPROVE in config/roles.js),
// so employees are excluded here rather than filtered client-side.
exports.listUsers = async (req, res) => {
  try {
    const users = await User.find({ isActive: true, role: { $in: ['manager', 'hr', 'ceo'] } })
      .select('name email role department')
      .sort({ name: 1 });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update the logged-in user's profile photo (base64 data URI)
exports.updatePhoto = async (req, res) => {
  try {
    const { photoUrl } = req.body;
    if (!photoUrl) return res.status(400).json({ message: 'photoUrl is required' });

    // Basic sanity check — keep documents small, avatars don't need to be huge
    if (photoUrl.length > 2_000_000) {
      return res.status(400).json({ message: 'Image is too large. Please use a smaller photo (under ~1.5MB).' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, { photoUrl }, { new: true });
    res.status(200).json({ photoUrl: user.photoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
