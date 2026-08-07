// Central place to define "who approves whose leave" and
// "who can see whose attendance". Keeps this logic out of controllers.

const APPROVAL_CHAIN = {
  employee: 'manager',
  manager: 'hr',
  hr: 'ceo',
  ceo: null, // no one above — CEO requests could auto-approve or go to a board/admin
};

// What each role is allowed to view
const VIEW_SCOPE = {
  employee: 'own-team', // can see their team's daily attendance (read-only)
  manager: 'own-team', // team = teamMembers array
  hr: 'organization', // sees everyone, plus present/absent counts
  ceo: 'organization',
};

// Who can approve leave requests
const CAN_APPROVE = ['manager', 'hr', 'ceo'];

module.exports = { APPROVAL_CHAIN, VIEW_SCOPE, CAN_APPROVE };
