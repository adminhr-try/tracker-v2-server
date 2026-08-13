const User = require('../models/User');

// Who approves this person's leave/regularisation request. Normally their
// own manager (reportingTo) — but the CEO has no one above them in the
// reporting chain, so a CEO's own requests route to HR instead of being
// blocked with "no approver configured". If more than one HR user exists,
// picks the longest-tenured one for a stable, predictable choice.
async function resolveApprover(user) {
  if (user.reportingTo) return user.reportingTo;
  if (user.role === 'ceo') {
    const hr = await User.findOne({ role: 'hr', isActive: true }).sort({ createdAt: 1 });
    return hr ? hr._id : null;
  }
  return null;
}

module.exports = { resolveApprover };
