const express = require('express');
const router = express.Router();
const { listHolidays, createHoliday, deleteHoliday } = require('../controllers/holidayController');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect); // every route below requires login

router.get('/', listHolidays); // visible to all roles
router.post('/', requireRole(['hr', 'ceo']), createHoliday);
router.delete('/:id', requireRole(['hr', 'ceo']), deleteHoliday);

module.exports = router;
