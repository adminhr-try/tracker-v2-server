// One-time repair script for a bug in authController.register(): the check
// that adds a new hire to their manager's teamMembers array checked the raw
// `reportingTo` request field instead of the resolved approver id — but the
// Create User form always sends `reportingToEmail`, so that check was
// effectively always false. Every user ever created through the real UI
// ended up with a correct reportingTo on their own record, but was never
// actually added to their manager's teamMembers array. That breaks:
//   - Team Presence (teamToday queries by manager.teamMembers)
//   - anything else keyed off teamMembers
//
// It also re-points any still-PENDING leave request / EOD report's stored
// `approver` to match the requester's CURRENT reportingTo, in case that drifted
// from what it was at submission time. Safe to re-run — every step is
// idempotent and only touches records that are actually out of sync.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Attendance = require('./models/Attendance');
const LeaveRequest = require('./models/LeaveRequest');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to database:', mongoose.connection.name);

  // --- 1. Rebuild every manager's teamMembers from the authoritative reportingTo field ---
  const allUsers = await User.find().select('_id name reportingTo teamMembers');
  const byId = new Map(allUsers.map((u) => [u._id.toString(), u]));

  const correctTeams = new Map(); // managerId -> Set<memberId>
  const noManager = [];
  for (const u of allUsers) {
    if (!u.reportingTo) {
      noManager.push(u.name);
      continue;
    }
    const managerId = u.reportingTo.toString();
    if (!byId.has(managerId)) continue; // dangling reference (deleted manager) — leave alone
    if (!correctTeams.has(managerId)) correctTeams.set(managerId, new Set());
    correctTeams.get(managerId).add(u._id.toString());
  }

  let teamsFixed = 0;
  for (const u of allUsers) {
    const correctSet = correctTeams.get(u._id.toString()) || new Set();
    const currentSet = new Set((u.teamMembers || []).map((id) => id.toString()));
    const same = correctSet.size === currentSet.size && [...correctSet].every((id) => currentSet.has(id));
    if (!same) {
      await User.findByIdAndUpdate(u._id, { teamMembers: [...correctSet] });
      console.log(`  fixed teamMembers for "${u.name}": ${currentSet.size} -> ${correctSet.size} member(s)`);
      teamsFixed++;
    }
  }
  console.log(`\nStep 1 done — teamMembers rebuilt for ${teamsFixed} manager(s).`);
  if (noManager.length) {
    console.log(`Note: these users have no reportingTo set at all (not an error, just informational): ${noManager.join(', ')}`);
  }

  // --- 2. Re-point pending leave requests to the requester's current reportingTo ---
  const pendingLeave = await LeaveRequest.find({ status: 'pending' }).populate('user', 'name reportingTo');
  let leaveFixed = 0;
  const leaveSkipped = [];
  for (const request of pendingLeave) {
    const currentReportingTo = request.user?.reportingTo;
    if (!currentReportingTo) {
      leaveSkipped.push(request.user?.name || request.user);
      continue;
    }
    if (String(request.approver) !== String(currentReportingTo)) {
      console.log(`  re-pointing pending leave request from "${request.user.name}"`);
      request.approver = currentReportingTo;
      await request.save();
      leaveFixed++;
    }
  }
  console.log(`\nStep 2 done — ${leaveFixed} pending leave request(s) re-pointed to the correct approver.`);
  if (leaveSkipped.length) {
    console.log(`Could NOT fix (no reportingTo set for these requesters, needs manual attention): ${leaveSkipped.join(', ')}`);
  }

  // --- 3. Same for pending EOD reports ---
  const pendingEod = await Attendance.find({ 'eodReport.status': 'pending', 'eodReport.submitted': true }).populate(
    'user',
    'name reportingTo'
  );
  let eodFixed = 0;
  const eodSkipped = [];
  for (const record of pendingEod) {
    const currentReportingTo = record.user?.reportingTo;
    if (!currentReportingTo) {
      eodSkipped.push(record.user?.name || record.user);
      continue;
    }
    if (String(record.eodReport.approver) !== String(currentReportingTo)) {
      console.log(`  re-pointing pending EOD report from "${record.user.name}"`);
      record.eodReport.approver = currentReportingTo;
      await record.save();
      eodFixed++;
    }
  }
  console.log(`\nStep 3 done — ${eodFixed} pending EOD report(s) re-pointed to the correct approver.`);
  if (eodSkipped.length) {
    console.log(`Could NOT fix (no reportingTo set for these requesters, needs manual attention): ${eodSkipped.join(', ')}`);
  }

  console.log('\nAll done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});
