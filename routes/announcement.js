const express = require('express');
const router = express.Router();
const { listAnnouncements, createAnnouncement, deleteAnnouncement } = require('../controllers/announcementController');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect); // every route below requires login

router.get('/', listAnnouncements); // visible to all roles
router.post('/', requireRole(['hr', 'ceo']), createAnnouncement);
router.delete('/:id', requireRole(['hr', 'ceo']), deleteAnnouncement);

module.exports = router;
