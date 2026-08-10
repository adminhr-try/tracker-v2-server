const express = require('express');
const router = express.Router();
const {
  checkIn,
  checkOut,
  submitEodReport,
  teamToday,
  orgToday,
  myMonthly,
  employeeMonthly,
  todayStatus,
  dashboardSummary,
  myWfhDates,
  pendingEodApprovals,
  approveEod,
  rejectEod,
  eodApprovalHistory,
} = require('../controllers/attendanceController');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect); // every route below requires login

router.get('/today', todayStatus);
router.post('/checkin', checkIn);
router.post('/checkout', checkOut);
router.post('/eod-report', submitEodReport);
router.get('/my-monthly', myMonthly);
router.get('/dashboard-summary', dashboardSummary);
router.get('/wfh-dates', myWfhDates);

router.get('/team-today', requireRole(['employee', 'manager']), teamToday);
router.get('/org-today', requireRole(['hr', 'ceo']), orgToday);
router.get('/employee-monthly/:userId', requireRole(['hr', 'ceo']), employeeMonthly);

router.get('/eod-pending-approvals', requireRole(['manager', 'hr', 'ceo']), pendingEodApprovals);
router.get('/eod-approval-history', requireRole(['manager', 'hr', 'ceo']), eodApprovalHistory);
router.patch('/eod/:id/approve', requireRole(['manager', 'hr', 'ceo']), approveEod);
router.patch('/eod/:id/reject', requireRole(['manager', 'hr', 'ceo']), rejectEod);

module.exports = router;
