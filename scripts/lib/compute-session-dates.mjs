/*
 * scripts/lib/compute-session-dates.mjs
 *
 * Helper для auto-generation sessions.scheduled_at для cohort'ы.
 *
 * Без external deps — Intl.DateTimeFormat для DST-aware ET ↔ UTC.
 *
 * Spec: docs/student-lk-v2-spec.md § 9 M9 helper.
 *
 * Used by:
 *   - scripts/backfill-sessions.mjs (M9)
 *   - В Stage F будет дублирован в src/lib/server/sessions.ts для
 *     production cohort creation. Тогда — переместим в shared (TBD).
 */

const WEEKDAY_INDEX = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * Convert wall-clock time in America/New_York to UTC unix timestamp.
 * Handles DST automatically.
 *
 * @param {string} dateStr  - 'YYYY-MM-DD' in ET (wall clock)
 * @param {string} timeStr  - 'HH:MM' (24h, ET wall clock)
 * @returns {number}        - unix seconds UTC
 */
export function etToUtcUnix(dateStr, timeStr) {
  const naiveMs = new Date(`${dateStr}T${timeStr}:00Z`).getTime();

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });
  const parts = dtf.formatToParts(new Date(naiveMs));
  const offsetPart = parts.find((p) => p.type === 'timeZoneName');
  if (!offsetPart) {
    throw new Error('Cannot get timezone offset — Node version too old?');
  }

  // 'GMT-4' / 'GMT-5' / 'GMT-4:30' (some zones, NY only -4 / -5)
  const m = offsetPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) {
    throw new Error(`Cannot parse timezone offset: ${offsetPart.value}`);
  }
  const sign = m[1] === '+' ? 1 : -1;
  const hours = parseInt(m[2], 10);
  const minutes = m[3] ? parseInt(m[3], 10) : 0;
  const offsetMs = sign * (hours * 3600 + minutes * 60) * 1000;

  return Math.floor((naiveMs - offsetMs) / 1000);
}

/**
 * Get YYYY-MM-DD string from unix UTC seconds, but interpreted as the
 * wall-clock DATE in America/New_York (so day boundary is ET midnight).
 *
 * @param {number} unixSec
 * @returns {string} 'YYYY-MM-DD'
 */
export function unixToEtDateStr(unixSec) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(new Date(unixSec * 1000));  // en-CA → 'YYYY-MM-DD'
}

/**
 * Get weekday index (0=sun..6=sat) for a unix UTC seconds, interpreted
 * in America/New_York timezone.
 */
function unixToEtWeekday(unixSec) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });
  const part = dtf.format(new Date(unixSec * 1000));
  // Returns 'Sun', 'Mon', etc. Map to index.
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[part];
}

/**
 * Add N days to a YYYY-MM-DD string (Gregorian, no TZ).
 */
function addDaysIso(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Get weekday index for a YYYY-MM-DD (treating as UTC date).
 * Since дата без TZ context — это same on Earth, Gregorian arithmetic.
 */
function isoDateWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Compute session UTC timestamps for a cohort.
 *
 * @param {object} params
 * @param {number} params.startUnix    - cohort.start_date (unix UTC)
 * @param {number} params.count        - number of sessions to generate
 * @param {string[]} params.days       - ['mon','thu'] or similar
 * @param {string} params.timeEt       - 'HH:MM' ET wall clock
 * @returns {number[]}                 - array of unix UTC seconds, sorted asc
 */
export function computeSessionDates({ startUnix, count, days, timeEt }) {
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error('days array required');
  }
  for (const d of days) {
    if (!(d in WEEKDAY_INDEX)) throw new Error(`Unknown weekday: ${d}`);
  }
  const wantedSet = new Set(days.map((d) => WEEKDAY_INDEX[d]));

  // cohort.start_date — это ET wall-clock date (cohort starts on this day in ET).
  let currentDateStr = unixToEtDateStr(startUnix);

  // If startUnix's ET weekday не входит в days[] — найти первый matching день
  // от start_date включительно (i.e. start_date может быть Monday раньше первой
  // Tuesday session).
  const startWeekday = isoDateWeekday(currentDateStr);
  if (!wantedSet.has(startWeekday)) {
    let cursor = currentDateStr;
    for (let i = 0; i < 14; i++) {
      cursor = addDaysIso(cursor, 1);
      if (wantedSet.has(isoDateWeekday(cursor))) {
        currentDateStr = cursor;
        break;
      }
    }
  }

  // Generate count sessions
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(etToUtcUnix(currentDateStr, timeEt));

    if (i < count - 1) {
      // Find next matching weekday
      let cursor = currentDateStr;
      for (let j = 0; j < 14; j++) {
        cursor = addDaysIso(cursor, 1);
        if (wantedSet.has(isoDateWeekday(cursor))) {
          currentDateStr = cursor;
          break;
        }
      }
    }
  }

  return result;
}
