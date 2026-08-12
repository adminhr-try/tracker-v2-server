const express = require('express');
const router = express.Router();
const { listMine, markRead, markAllRead } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect); // every route below requires login — everyone has their own notifications

router.get('/', listMine);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
