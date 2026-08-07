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

// Next N birthdays, sorted by how soon they occur (wraps around the year end)
exports.upcomingBirthdays = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const employees = await Employee.find({ dob: { $exists: true, $ne: null } });

    const today = new Date();
    const todayMD = today.getMonth() * 100 + today.getDate();

    const withNextDate = employees.map((e) => {
      const dob = new Date(e.dob);
      const md = dob.getMonth() * 100 + dob.getDate();
      let daysUntil = md - todayMD;
      if (daysUntil < 0) daysUntil += 1200; // push to next year, rough month*100 scale is fine for sorting
      return { employee: e, md, daysUntil };
    });

    withNextDate.sort((a, b) => a.daysUntil - b.daysUntil);

    const upcoming = withNextDate.slice(0, limit).map((x) => ({
      _id: x.employee._id,
      name: x.employee.name,
      designation: x.employee.designation,
      dob: x.employee.dob,
    }));

    res.status(200).json(upcoming);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Next N work anniversaries, sorted by how soon they occur, with years-completed count
exports.upcomingAnniversaries = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const employees = await Employee.find({ doj: { $exists: true, $ne: null } });

    const today = new Date();
    const todayMD = today.getMonth() * 100 + today.getDate();

    const withNextDate = employees.map((e) => {
      const doj = new Date(e.doj);
      const md = doj.getMonth() * 100 + doj.getDate();
      let daysUntil = md - todayMD;
      if (daysUntil < 0) daysUntil += 1200;
      const nextAnniversaryYear = today.getFullYear() + (md < todayMD ? 1 : 0);
      const years = nextAnniversaryYear - doj.getFullYear();
      return { employee: e, md, daysUntil, years };
    });

    withNextDate.sort((a, b) => a.daysUntil - b.daysUntil);

    const upcoming = withNextDate.slice(0, limit).map((x) => ({
      _id: x.employee._id,
      name: x.employee.name,
      designation: x.employee.designation,
      doj: x.employee.doj,
      years: x.years,
    }));

    res.status(200).json(upcoming);
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
