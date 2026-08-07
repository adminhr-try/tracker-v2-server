const Announcement = require('../models/Announcement');

// Any logged-in user can view announcements
exports.listAnnouncements = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const announcements = await Announcement.find()
      .populate('postedBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.status(200).json(announcements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only
exports.createAnnouncement = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Announcement text is required' });
    }
    const announcement = await Announcement.create({ message: message.trim(), postedBy: req.user._id });
    const populated = await announcement.populate('postedBy', 'name role');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/CEO only
exports.deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    res.status(200).json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
