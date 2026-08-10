const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const Todo = require('../models/Todo');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Only HR/CEO should be allowed to hit this in your routes (see routes/auth.js)
exports.register = async (req, res) => {
  try {
    const {
      name, email, password, role, department, designation,
      employeeId, dob, doj, reportingTo, reportingToEmail,
    } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    // Check both collections up front — Employee ID is unique across each,
    // and Directory gets synced from this same request below, so a
    // collision there must block before anything is written.
    if (employeeId) {
      const [dupUser, dupEmployee] = await Promise.all([
        User.findOne({ employeeId }),
        Employee.findOne({ employeeId }),
      ]);
      if (dupUser || dupEmployee) {
        return res.status(400).json({ message: `Employee ID ${employeeId} is already in use` });
      }
    }

    let resolvedReportingTo = reportingTo || null;
    if (!resolvedReportingTo && reportingToEmail) {
      const approver = await User.findOne({ email: reportingToEmail });
      if (!approver) return res.status(400).json({ message: `No user found with email ${reportingToEmail}` });
      resolvedReportingTo = approver._id;
    }

    // Save the department for reuse on future users, whether it was picked
    // from the existing list or typed in fresh via "Other".
    if (department) await Department.ensureExists(department);

    const user = await User.create({
      name, email, password, role, department, designation,
      employeeId: employeeId || undefined,
      reportingTo: resolvedReportingTo,
    });

    // If this new user reports to a manager, add them to that manager's team
    if (reportingTo) {
      await User.findByIdAndUpdate(reportingTo, { $addToSet: { teamMembers: user._id } });
    }

    // Keep Internal Directory in sync — the new person shows up there
    // immediately with the same Employee ID, and their DOB/joining date
    // (used for birthdays / work anniversaries) if provided.
    await Employee.findOneAndUpdate(
      { email },
      {
        employeeId: employeeId || undefined,
        name,
        designation,
        email,
        dob: dob || undefined,
        doj: doj || undefined,
        createdBy: req.user._id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId || null,
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
      employeeId: user.employeeId || null,
      photoUrl: user.photoUrl || null,
      token: signToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only. Two uses:
//  - default: powers the "reports to" picker on Create User — only
//    managers/HR/CEO are valid approvers (see CAN_APPROVE in config/roles.js),
//    so employees are excluded unless scope=all is passed.
//  - ?scope=all: powers the employee search on Administration > Attendance
//    View, which needs to find anyone, not just approvers.
exports.listUsers = async (req, res) => {
  try {
    const filter = req.query.scope === 'all'
      ? { isActive: true }
      : { isActive: true, role: { $in: ['manager', 'hr', 'ceo'] } };
    const users = await User.find(filter)
      .select('name email role department employeeId')
      .sort({ name: 1 });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only — permanently removes a user: their account, Directory
// listing, attendance history, leave requests they filed, and personal
// to-dos. Cannot be undone.
//
// What this deliberately does NOT touch: leave/EOD requests where this
// person was the APPROVER (not the requester) for someone else — those stay
// as-is so the other person's history isn't corrupted, and company
// announcements they posted (content is the org's, not tied to the account).
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: "You can't delete your own account" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Promise.all([
      Attendance.deleteMany({ user: id }),
      LeaveRequest.deleteMany({ user: id }),
      Todo.deleteMany({ user: id }),
      Employee.deleteOne({ email: user.email }),
      // Anyone reporting to this person loses that approver — their next
      // request has nowhere to route until HR assigns them a new one.
      User.updateMany({ reportingTo: id }, { $set: { reportingTo: null } }),
      // Drop them out of whichever manager's team list included them.
      User.updateMany({ teamMembers: id }, { $pull: { teamMembers: id } }),
    ]);

    await User.findByIdAndDelete(id);

    res.status(200).json({ message: `${user.name} has been deleted.` });
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
