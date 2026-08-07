require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('../models/Department');

const DEFAULT_DEPARTMENTS = ['Finance', 'HR', 'Marketing', 'Product', 'Tech', 'Operations'];

// Guarantees the Create User department dropdown always has something to
// show, even on a fresh database — same list `npm run seed:departments`
// inserts, just applied automatically so nobody has to remember to run it.
const seedDefaultDepartments = async () => {
  const count = await Department.countDocuments();
  if (count > 0) return;
  await Department.insertMany(DEFAULT_DEPARTMENTS.map((name) => ({ name })));
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }

  // Connection succeeded — a hiccup here shouldn't take the whole server down.
  try {
    await seedDefaultDepartments();
  } catch (err) {
    console.error('Default department seed failed (non-fatal):', err.message);
  }
};

module.exports = connectDB;
