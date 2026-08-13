const User = require('../models/User');

// Who approves this person's leave/regularisation/EOD request. Normally
// their own manager (reportingTo) — but that can be missing for reasons
// beyond just "this is the CEO": deleting a manager/HR user orphans
// everyone who reported to them (reportingTo is set to null, see
// authController.deleteUser), and nothing stops an admin leaving it blank
// when creating a user in the first place. Either way, falls back to HR
// (the org-wide overseer) so the person isn't permanently locked out of
// submitting requests — or to the CEO if the person themselves IS HR.
// If more than one HR/CEO user exists, picks the longest-tenured one for a
// stable, predictable choice.
async function resolveApprover(user) {
  if (user.reportingTo) return user.reportingTo;

  if (user.role !== 'hr') {
    const hr = await User.findOne({ role: 'hr', isActive: true, _id: { $ne: user._id } }).sort({
      createdAt: 1,
    });
    if (hr) return hr._id;
  }

  const ceo = await User.findOne({ role: 'ceo', isActive: true, _id: { $ne: user._id } }).sort({
    createdAt: 1,
  });
  return ceo ? ceo._id : null;
}

module.exports = { resolveApprover };
