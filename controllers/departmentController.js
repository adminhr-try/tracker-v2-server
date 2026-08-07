const Department = require('../models/Department');

// Any logged-in user can view the department list (needed for the Create
// User dropdown, which only HR/CEO reach, but harmless to expose more widely)
exports.listDepartments = async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 });
    res.status(200).json(departments.map((d) => d.name));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only — lets a department be added up front, without waiting for a
// user to be created with it first. Uses the same de-dupe logic that runs
// automatically when a new department is typed into the Create User screen.
exports.createDepartment = async (req, res) => {
  try {
    const department = await Department.ensureExists(req.body.name);
    if (!department) return res.status(400).json({ message: 'Department name is required' });
    res.status(201).json(department);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
