const express = require('express');
const router = express.Router();
const {
  createRequest,
  myRequests,
  pendingApprovals,
  approveRequest,
  rejectRequest,
  approvalHistory,
} = require('../controllers/regularisationController');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect); // every route below requires login

router.post('/request', createRequest); // any logged-in user
router.get('/my-requests', myRequests);

router.get('/pending-approvals', requireRole(['manager', 'hr', 'ceo']), pendingApprovals);
router.get('/approval-history', requireRole(['manager', 'hr', 'ceo']), approvalHistory);
router.patch('/:id/approve', requireRole(['manager', 'hr', 'ceo']), approveRequest);
router.patch('/:id/reject', requireRole(['manager', 'hr', 'ceo']), rejectRequest);

module.exports = router;
