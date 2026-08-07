const express = require('express');
const router = express.Router();
const { register, login, updatePhoto, listUsers } = require('../controllers/authController');
const { protect, requireRole } = require('../middleware/auth');

// Only HR/CEO can create new accounts (keeps role/reportingTo assignment controlled)
router.post('/register', protect, requireRole(['hr', 'ceo']), register);
router.post('/login', login);
router.patch('/photo', protect, updatePhoto);
// Populates the "reports to" picker when creating a user — same access as register
router.get('/users', protect, requireRole(['hr', 'ceo']), listUsers);

module.exports = router;
