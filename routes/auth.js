const express = require('express');
const router = express.Router();
const {
  register, login, updatePhoto, changePassword, listUsers, getUserProfile, updateUser, deleteUser,
} = require('../controllers/authController');
const { protect, requireRole } = require('../middleware/auth');

// Only HR/CEO can create new accounts (keeps role/reportingTo assignment controlled)
router.post('/register', protect, requireRole(['hr', 'ceo']), register);
router.post('/login', login);
router.patch('/photo', protect, updatePhoto);
router.patch('/change-password', protect, changePassword);
// Populates the "reports to" picker when creating a user — same access as register
router.get('/users', protect, requireRole(['hr', 'ceo']), listUsers);
router.get('/users/:id', protect, requireRole(['hr', 'ceo']), getUserProfile);
router.patch('/users/:id', protect, requireRole(['hr', 'ceo']), updateUser);
router.delete('/users/:id', protect, requireRole(['hr', 'ceo']), deleteUser);

module.exports = router;
