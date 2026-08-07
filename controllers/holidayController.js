const Holiday = require('../models/Holiday');

// Any logged-in user can view the holiday list
exports.listHolidays = async (req, res) => {
  try {
    const { year } = req.query;
    const filter = {};
    if (year) {
      const y = parseInt(year);
      filter.date = { $gte: new Date(y, 0, 1), $lte: new Date(y, 11, 31, 23, 59, 59) };
    }
    const holidays = await Holiday.find(filter).sort({ date: 1 });
    res.status(200).json(holidays);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only
exports.createHoliday = async (req, res) => {
  try {
    const { name, date, type } = req.body;
    if (!name || !date) {
      return res.status(400).json({ message: 'Name and date are required' });
    }
    const holiday = await Holiday.create({ name, date, type, createdBy: req.user._id });
    res.status(201).json(holiday);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only
exports.deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.status(200).json({ message: 'Holiday deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
