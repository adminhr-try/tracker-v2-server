const express = require('express');
const router = express.Router();
const {
  listEmployees,
  upcomingBirthdays,
  upcomingAnniversaries,
  createEmployee,
  deleteEmployee,
} = require('../controllers/directoryController');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect); // every route below requires login

router.get('/', listEmployees); // visible to all roles
router.get('/upcoming-birthdays', upcomingBirthdays); // visible to all roles
router.get('/upcoming-anniversaries', upcomingAnniversaries); // visible to all roles
router.post('/', requireRole(['hr', 'ceo']), createEmployee);
router.delete('/:id', requireRole(['hr', 'ceo']), deleteEmployee);

module.exports = router;
