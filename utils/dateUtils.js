// Attendance runs on India time regardless of what timezone the server
// process itself happens to be running in — pinning the day boundary to a
// fixed IST offset (India has no DST) keeps "today" consistent whether this
// runs on a laptop already set to IST or a cloud host defaulting to UTC.
// Without this, a naive `new Date().setHours(0,0,0,0)` on a UTC server would
// roll the date over 5.5 hours early, misfiling anyone who checks in between
// 12:00 AM and 5:30 AM IST under the previous day.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Midnight IST for the given instant (default: now), returned as the
// equivalent UTC Date — e.g. 2026-08-12 00:00 IST becomes
// 2026-08-11T18:30:00.000Z. Use this (not `new Date(d).setHours(0,0,0,0)`)
// anywhere "today" or "which calendar day does this belong to" is decided.
function startOfDayIST(d = new Date()) {
  const asDate = d instanceof Date ? d : new Date(d);
  const shifted = new Date(asDate.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

// The calendar year/month this instant falls on in IST — plain
// `.getFullYear()`/`.getMonth()` read the *server's* local timezone, which
// would give the wrong value for the ~5.5 hour window around a year/month
// rollover if the server isn't running in IST.
function getISTYear(d = new Date()) {
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCFullYear();
}

function getISTMonth(d = new Date()) {
  // 1-12, not JS's native 0-11
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCMonth() + 1;
}

// [start of this IST month, start of next IST month) — an exclusive-end
// range, so callers use $gte/$lt instead of an inclusive $lte "23:59:59"
// guess that can quietly clip the last day depending on server timezone.
function monthRangeIST(year, month) {
  // month: 1-12
  const from = startOfDayIST(`${year}-${String(month).padStart(2, '0')}-01`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = startOfDayIST(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);
  return { from, to };
}

// [start of this IST year, start of next IST year) — same exclusive-end idea
// as monthRangeIST, for the CL/SL/WFH annual quota windows.
function yearRangeIST(year) {
  const from = startOfDayIST(`${year}-01-01`);
  const to = startOfDayIST(`${year + 1}-01-01`);
  return { from, to };
}

module.exports = { startOfDayIST, getISTYear, getISTMonth, monthRangeIST, yearRangeIST };
