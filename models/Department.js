const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

// Case-insensitive "add if new" — used both by the dedicated departments
// endpoint and by user registration, so a custom department typed in on the
// Create User screen is saved here too and shows up for the next person.
departmentSchema.statics.ensureExists = async function (name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;

  const existing = await this.findOne({ name: trimmed }).collation({ locale: 'en', strength: 2 });
  if (existing) return existing;

  try {
    return await this.create({ name: trimmed });
  } catch (err) {
    // Two requests racing to add the same new department — the loser just
    // reads back what the winner created instead of erroring out.
    if (err.code === 11000) {
      return this.findOne({ name: trimmed }).collation({ locale: 'en', strength: 2 });
    }
    throw err;
  }
};

module.exports = mongoose.model('Department', departmentSchema);
