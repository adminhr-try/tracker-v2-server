const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    employeeId: { type: String, trim: true, unique: true, sparse: true },
    // Required when added by hand via Directory's "Add Employee" form (see
    // directoryController.createEmployee), but NOT enforced at the schema
    // level — entries auto-synced from Create User must never fail here just
    // because designation was left blank.
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    dob: { type: Date }, // date of birth — month/day used for "upcoming birthdays"
    doj: { type: Date }, // date of joining — used for "work anniversaries"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Employee', employeeSchema);
