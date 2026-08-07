const express = require('express');
const router = express.Router();
const {
  createRequest,
  myRequests,
  pendingApprovals,
  approveRequest,
  rejectRequest,
  approvalHistory,
  leaveBalance,
  leaveDatesByType,
} = require('../controllers/leaveController');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect);

router.post('/request', createRequest);
router.get('/my-requests', myRequests);
router.get('/balance', leaveBalance);
router.get('/dates/:type', leaveDatesByType);

router.get('/pending-approvals', requireRole(['manager', 'hr', 'ceo']), pendingApprovals);
router.get('/approval-history', requireRole(['manager', 'hr', 'ceo']), approvalHistory);
router.patch('/:id/approve', requireRole(['manager', 'hr', 'ceo']), approveRequest);
router.patch('/:id/reject', requireRole(['manager', 'hr', 'ceo']), rejectRequest);

module.exports = router;
