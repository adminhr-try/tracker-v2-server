const Employee = require('../models/Employee');

// Any logged-in user can view the directory
exports.listEmployees = async (req, res) => {
  try {
    const employees = await Employee.find().sort({ name: 1 });
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// This month's birthdays only, sorted by day of month. Does NOT backfill
// from other months to reach `limit` — if only 1 person has a birthday this
// month, that's all that comes back.
exports.upcomingBirthdays = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const employees = await Employee.find({ dob: { $exists: true, $ne: null } });

    const currentMonth = new Date().getMonth();

    const thisMonth = employees
      .filter((e) => new Date(e.dob).getMonth() === currentMonth)
      .map((e) => ({ employee: e, day: new Date(e.dob).getDate() }))
      .sort((a, b) => a.day - b.day)
      .slice(0, limit)
      .map((x) => ({
        _id: x.employee._id,
        name: x.employee.name,
        designation: x.employee.designation,
        dob: x.employee.dob,
      }));

    res.status(200).json(thisMonth);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// This month's work anniversaries only, sorted by day of month, with
// years-completed count. Same "no backfill from other months" rule as
// upcomingBirthdays above.
exports.upcomingAnniversaries = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const employees = await Employee.find({ doj: { $exists: true, $ne: null } });

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const thisMonth = employees
      .filter((e) => new Date(e.doj).getMonth() === currentMonth)
      .map((e) => {
        const doj = new Date(e.doj);
        return { employee: e, day: doj.getDate(), years: currentYear - doj.getFullYear() };
      })
      .sort((a, b) => a.day - b.day)
      .slice(0, limit)
      .map((x) => ({
        _id: x.employee._id,
        name: x.employee.name,
        designation: x.employee.designation,
        doj: x.employee.doj,
        years: x.years,
      }));

    res.status(200).json(thisMonth);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only
exports.createEmployee = async (req, res) => {
  try {
    const { employeeId, name, designation, email, phone, dob, doj } = req.body;
    if (!name || !designation) {
      return res.status(400).json({ message: 'Name and designation are required' });
    }
    const employee = await Employee.create({ employeeId, name, designation, email, phone, dob, doj, createdBy: req.user._id });
    res.status(201).json(employee);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only
exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.status(200).json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
