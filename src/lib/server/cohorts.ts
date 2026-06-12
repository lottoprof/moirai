/*
 * Cohorts + slots — query helpers + pure compute (Stage 14d).
 *
 * Используется в:
 *   - /[locale]/apply (listActiveCohorts с фильтрами для grid)
 *   - /[locale]/dashboard (getCohortById для application summary)
 *   - /[locale]/instructor/ (listCohortsByInstructor для "My cohorts")
 *   - /admin/applications (listCohortsByProgramme для фильтра)
 *   - scripts/publish-cohorts.mjs (publishUpcomingCohortsForSlot, idempotent)
 *
 * Pure helpers (без D1) — `computeDurationWeeks`, `computeNextStartDates` —
 * можно использовать в build-time scripts тоже.
 *
 * Weekday encoding: short codes 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
 * хранятся в slots.days_json как JSON array. Map в JS Date.getUTCDay()
 * через WEEKDAY_TO_INT ниже.
 */

import type { CohortRow, CohortStatus, SlotRow } from "../../../db/types";

const COHORT_COLUMNS = `
  id, programme_id, slot_id, start_date, end_date, status,
  apply_count, paid_count, public_priority, public_label,
  created_at, updated_at
`;

const SLOT_COLUMNS = `
  id, programme_id, days_json, time_et, instructor_id, max_students,
  active, created_at, updated_at
`;

/** Weekday code ↔ JS getUTCDay() index (Sun=0..Sat=6). */
export const WEEKDAY_TO_INT: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
} as const;

export const INT_TO_WEEKDAY: readonly string[] = [
  "sun", "mon", "tue", "wed", "thu", "fri", "sat",
] as const;

const DAY_SEC = 24 * 3600;

// ============================================================
// JOIN-result types (cohort + slot data, что нужно UI)
// ============================================================

/** Cohort с inline slot-данными — то что UI использует для рендера. */
export interface CohortWithSlot extends CohortRow {
  slot: SlotRow;
}

interface JoinedRow extends CohortRow {
  public_priority: number | null;
  public_label: string | null;
  s_id: string;
  s_programme_id: string;
  s_days_json: string;
  s_time_et: string;
  s_instructor_id: string | null;
  s_max_students: number;
  s_active: number;
  s_created_at: number;
  s_updated_at: number;
}

function pickSlot(row: JoinedRow): SlotRow {
  return {
    id: row.s_id,
    programme_id: row.s_programme_id,
    days_json: row.s_days_json,
    time_et: row.s_time_et,
    instructor_id: row.s_instructor_id,
    max_students: row.s_max_students,
    active: row.s_active,
    created_at: row.s_created_at,
    updated_at: row.s_updated_at,
  };
}

function pickCohort(row: JoinedRow): CohortRow {
  return {
    id: row.id,
    programme_id: row.programme_id,
    slot_id: row.slot_id,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    apply_count: row.apply_count,
    paid_count: row.paid_count,
    public_priority: row.public_priority,
    public_label: row.public_label,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================
// SELECT
// ============================================================

/** Get cohort by id (без slot — для admin actions / status updates). */
export async function getCohortById(
  env: Cloudflare.Env,
  id: string,
): Promise<CohortRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${COHORT_COLUMNS} FROM cohorts WHERE id = ?`,
  )
    .bind(id)
    .first<CohortRow>();
  return row ?? null;
}

/** Get cohort + joined slot (для UI рендера). */
export async function getCohortWithSlot(
  env: Cloudflare.Env,
  id: string,
): Promise<CohortWithSlot | null> {
  const row = await env.DB.prepare(
    `SELECT c.id, c.programme_id, c.slot_id, c.start_date, c.end_date,
            c.status, c.apply_count, c.paid_count,
            c.public_priority, c.public_label,
            c.created_at, c.updated_at,
            s.id AS s_id, s.programme_id AS s_programme_id,
            s.days_json AS s_days_json, s.time_et AS s_time_et,
            s.instructor_id AS s_instructor_id,
            s.max_students AS s_max_students, s.active AS s_active,
            s.created_at AS s_created_at, s.updated_at AS s_updated_at
       FROM cohorts c JOIN slots s ON s.id = c.slot_id
       WHERE c.id = ?`,
  )
    .bind(id)
    .first<JoinedRow>();
  if (!row) return null;
  return { ...pickCohort(row), slot: pickSlot(row) };
}

export interface ListCohortsFilters {
  /** Фильтр programmes (например ["beginner", "intermediate"]). null = все. */
  programmeIds?: string[];
  /** Фильтр day_pair: массив пар weekday-кодов (например [["mon","thu"]]). */
  dayPairs?: string[][];
  /** "morning" (time_et < 12:00) / "evening" (>= 12:00) / undefined = любое */
  timeOfDay?: "morning" | "evening";
  /** Период от сегодня в днях. Default 90 (3 мес, см. FLOW-14). */
  withinDays?: number;
  /** Только cohorts со status='open' (по default). */
  status?: CohortStatus | "any";
}

/**
 * Список cohorts для public /apply grid'a (FLOW-12, FLOW-14).
 *
 * Дефолтно — status='open' + start_date в течение N дней (default 90).
 * Possibly joined with slot data. Сортировка: programme_id ASC, start_date ASC.
 *
 * day_pair и time_of_day фильтрация делается в JS (SQLite не умеет
 * парсить JSON arrays производительно).
 */
export async function listActiveCohorts(
  env: Cloudflare.Env,
  filters: ListCohortsFilters = {},
): Promise<CohortWithSlot[]> {
  const status = filters.status ?? "open";
  const withinDays = filters.withinDays ?? 90;
  const now = Math.floor(Date.now() / 1000);
  const horizonEnd = now + withinDays * DAY_SEC;

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (status !== "any") {
    conditions.push(`c.status = ?`);
    binds.push(status);
  }
  conditions.push(`c.start_date >= ? AND c.start_date <= ?`);
  binds.push(now, horizonEnd);

  if (filters.programmeIds && filters.programmeIds.length > 0) {
    const placeholders = filters.programmeIds.map(() => "?").join(",");
    conditions.push(`c.programme_id IN (${placeholders})`);
    binds.push(...filters.programmeIds);
  }

  conditions.push(`s.active = 1`);

  const where = conditions.join(" AND ");
  const result = await env.DB.prepare(
    `SELECT c.id, c.programme_id, c.slot_id, c.start_date, c.end_date,
            c.status, c.apply_count, c.paid_count,
            c.public_priority, c.public_label,
            c.created_at, c.updated_at,
            s.id AS s_id, s.programme_id AS s_programme_id,
            s.days_json AS s_days_json, s.time_et AS s_time_et,
            s.instructor_id AS s_instructor_id,
            s.max_students AS s_max_students, s.active AS s_active,
            s.created_at AS s_created_at, s.updated_at AS s_updated_at
       FROM cohorts c JOIN slots s ON s.id = c.slot_id
       WHERE ${where}
       ORDER BY c.programme_id ASC, c.start_date ASC,
                c.public_priority ASC NULLS LAST, c.paid_count ASC, c.id ASC`,
  )
    .bind(...binds)
    .all<JoinedRow>();

  let cohorts: CohortWithSlot[] = result.results.map((r: JoinedRow) => ({
    ...pickCohort(r),
    slot: pickSlot(r),
  }));

  // App-side фильтры по day_pair и time_of_day
  if (filters.dayPairs && filters.dayPairs.length > 0) {
    const wanted = filters.dayPairs.map((pair) => normalizeDayPair(pair).join("+"));
    cohorts = cohorts.filter((c) => {
      const days = parseDaysJson(c.slot.days_json);
      return wanted.includes(normalizeDayPair(days).join("+"));
    });
  }
  if (filters.timeOfDay) {
    cohorts = cohorts.filter((c) => deriveTimeOfDay(c.slot.time_et) === filters.timeOfDay);
  }

  return cohorts;
}

/** Cohorts инструктора (через slots.instructor_id). FLOW-21. */
export async function listCohortsByInstructor(
  env: Cloudflare.Env,
  instructorId: string,
  statuses: CohortStatus[] = ["open", "running"],
): Promise<CohortWithSlot[]> {
  const placeholders = statuses.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT c.id, c.programme_id, c.slot_id, c.start_date, c.end_date,
            c.status, c.apply_count, c.paid_count,
            c.public_priority, c.public_label,
            c.created_at, c.updated_at,
            s.id AS s_id, s.programme_id AS s_programme_id,
            s.days_json AS s_days_json, s.time_et AS s_time_et,
            s.instructor_id AS s_instructor_id,
            s.max_students AS s_max_students, s.active AS s_active,
            s.created_at AS s_created_at, s.updated_at AS s_updated_at
       FROM cohorts c JOIN slots s ON s.id = c.slot_id
       WHERE s.instructor_id = ? AND c.status IN (${placeholders})
       ORDER BY c.start_date ASC`,
  )
    .bind(instructorId, ...statuses)
    .all<JoinedRow>();
  return result.results.map((r: JoinedRow) => ({ ...pickCohort(r), slot: pickSlot(r) }));
}

/** Все active slots (для seed / publish scripts). */
export async function listActiveSlots(
  env: Cloudflare.Env,
): Promise<SlotRow[]> {
  const result = await env.DB.prepare(
    `SELECT ${SLOT_COLUMNS} FROM slots WHERE active = 1`,
  ).all<SlotRow>();
  return result.results;
}

/** Latest cohort для slot'a — для вычисления следующей start_date. */
export async function getLatestCohortForSlot(
  env: Cloudflare.Env,
  slotId: string,
): Promise<CohortRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${COHORT_COLUMNS}
       FROM cohorts
       WHERE slot_id = ?
       ORDER BY start_date DESC
       LIMIT 1`,
  )
    .bind(slotId)
    .first<CohortRow>();
  return row ?? null;
}

// ============================================================
// UPDATE
// ============================================================

/** Сменить status cohort'ы (admin action / cron). */
export async function updateCohortStatus(
  env: Cloudflare.Env,
  cohortId: string,
  newStatus: CohortStatus,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE cohorts SET status = ? WHERE id = ?`,
  )
    .bind(newStatus, cohortId)
    .run();
}

// ============================================================
// INSERT
// ============================================================

export interface InsertCohortInput {
  programmeId: string;
  slotId: string;
  startDate: number;
  endDate: number;
}

/** INSERT нового cohort (используется publish-cohorts script + admin). */
export async function insertCohort(
  env: Cloudflare.Env,
  input: InsertCohortInput,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO cohorts
       (id, programme_id, slot_id, start_date, end_date, status,
        apply_count, paid_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', 0, 0, ?, ?)`,
  )
    .bind(id, input.programmeId, input.slotId, input.startDate, input.endDate, now, now)
    .run();
  return id;
}

/**
 * Idempotent insert: пропускает если (slot_id, start_date) уже существует.
 * Возвращает true если row inserted, false если уже был.
 */
export async function insertCohortIfMissing(
  env: Cloudflare.Env,
  input: InsertCohortInput,
): Promise<boolean> {
  const existing = await env.DB.prepare(
    `SELECT id FROM cohorts WHERE slot_id = ? AND start_date = ? LIMIT 1`,
  )
    .bind(input.slotId, input.startDate)
    .first<{ id: string }>();
  if (existing) return false;
  await insertCohort(env, input);
  return true;
}

// ============================================================
// Pure compute helpers (не требуют D1)
// ============================================================

/**
 * FLOW-8: длительность курса в неделях = lessons / sessions_per_week.
 * Округляется вверх до ближайшего целого занятия (полу-неделя становится
 * полной неделей — последняя сессия не висит в воздухе).
 */
export function computeDurationWeeks(
  lessonsTotal: number,
  sessionsPerWeek: number = 2,
): number {
  if (sessionsPerWeek <= 0) throw new Error("sessionsPerWeek must be > 0");
  return Math.ceil(lessonsTotal / sessionsPerWeek);
}

/** Производное "утро/вечер" из time_et (HH:MM). < 12:00 → morning. */
export function deriveTimeOfDay(timeEt: string): "morning" | "evening" {
  const hour = parseInt(timeEt.split(":")[0] ?? "0", 10);
  return hour < 12 ? "morning" : "evening";
}

/** Parse slots.days_json в массив weekday-кодов. Гарантированно валидно. */
export function parseDaysJson(daysJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(daysJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

/** Стабильная сортировка weekday кодов (mon→sun) для сравнения пар. */
export function normalizeDayPair(days: string[]): string[] {
  return [...days].sort((a, b) => (WEEKDAY_TO_INT[a] ?? 99) - (WEEKDAY_TO_INT[b] ?? 99));
}

/**
 * Вычислить даты будущих cohort'ов для slot'a.
 *
 * Стратегия: cohort стартует в первый weekday из slot.days_json после
 * `earliestStartSec`. Следующая cohort — через `durationWeeks` после
 * предыдущей start_date (последовательная замена, без overlap).
 *
 * Возвращает массив unix-seconds (UTC midnight каждой start_date)
 * до `horizonSec`. Используется publishUpcomingCohortsForSlot.
 */
export function computeNextStartDates(
  daysJson: string,
  earliestStartSec: number,
  durationWeeks: number,
  horizonSec: number,
): number[] {
  const days = parseDaysJson(daysJson);
  if (days.length === 0) return [];
  const weekdayInts = days
    .map((d) => WEEKDAY_TO_INT[d] ?? -1)
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (weekdayInts.length === 0) return [];

  const firstWeekday = weekdayInts[0]; // cohort стартует в первый день из пары
  const result: number[] = [];

  let current = nextWeekdayAtOrAfter(earliestStartSec, firstWeekday);
  const intervalSec = durationWeeks * 7 * DAY_SEC;

  while (current <= horizonSec) {
    result.push(current);
    current = nextWeekdayAtOrAfter(current + intervalSec, firstWeekday);
  }

  return result;
}

/** Ближайший UTC-midnight weekday >= sec. */
function nextWeekdayAtOrAfter(sec: number, targetWeekday: number): number {
  const startOfDay = Math.floor(sec / DAY_SEC) * DAY_SEC; // truncate to UTC midnight
  const currentWeekday = new Date(startOfDay * 1000).getUTCDay();
  const delta = (targetWeekday - currentWeekday + 7) % 7;
  return startOfDay + delta * DAY_SEC;
}

// ============================================================
// Compute sessions для cohort'ы (ET wall-clock aware)
// ============================================================
// Port из scripts/lib/compute-session-dates.mjs — Stage F note сбылась.

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** ET wall-clock дата (YYYY-MM-DD) из unix UTC seconds. */
function unixToEtDateStr(unixSec: number): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return dtf.format(new Date(unixSec * 1000));
}

/** YYYY-MM-DD + ET HH:MM → unix UTC seconds. DST-aware. */
function etToUtcUnix(dateStr: string, timeStr: string): number {
  const naiveMs = new Date(`${dateStr}T${timeStr}:00Z`).getTime();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", hour12: false,
    timeZoneName: "shortOffset",
  });
  const parts = dtf.formatToParts(new Date(naiveMs));
  const offsetPart = parts.find((p) => p.type === "timeZoneName");
  if (!offsetPart) throw new Error("Cannot get timezone offset");
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offsetPart.value);
  if (!m) throw new Error(`Cannot parse timezone offset: ${offsetPart.value}`);
  const sign = m[1] === "+" ? 1 : -1;
  const hours = Number.parseInt(m[2], 10);
  const minutes = m[3] ? Number.parseInt(m[3], 10) : 0;
  const offsetMs = sign * (hours * 3600 + minutes * 60) * 1000;
  return Math.floor((naiveMs - offsetMs) / 1000);
}

function addDaysIso(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear().toString();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoDateWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Compute session UTC timestamps для cohort'ы.
 *
 * cohort.start_date — это ET wall-clock дата (cohort starts in ET).
 * Если start day не в days[] — найти первый matching день после start.
 */
export function computeSessionDates(params: {
  startUnix: number;
  count: number;
  days: string[];
  timeEt: string;
}): number[] {
  const { startUnix, count, days, timeEt } = params;
  if (!Array.isArray(days) || days.length === 0) throw new Error("days required");
  for (const d of days) {
    if (!(d in WEEKDAY_INDEX)) throw new Error(`Unknown weekday: ${d}`);
  }
  const wantedSet = new Set(days.map((d) => WEEKDAY_INDEX[d]));

  let currentDateStr = unixToEtDateStr(startUnix);
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

  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(etToUtcUnix(currentDateStr, timeEt));
    if (i < count - 1) {
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

// ============================================================
// Helpers для UI (spot display, FLOW-13)
// ============================================================

export type SpotDisplay =
  | { kind: "available"; spotsLeft: number }
  | { kind: "spots_left"; spotsLeft: number }
  | { kind: "individual_bonus"; spotsLeft: number };

/**
 * FLOW-13 hybrid spot display:
 *   > 5 spots → "available"
 *   ≤ 5 → "N spots left" (urgency)
 *   ≤ 2 → "1:1 at group price" (individual bonus reframe, FLOW-11)
 */
export function computeSpotDisplay(
  maxStudents: number,
  applyCount: number,
): SpotDisplay {
  const spotsLeft = Math.max(0, maxStudents - applyCount);
  if (applyCount <= 2) return { kind: "individual_bonus", spotsLeft };
  if (spotsLeft <= 5) return { kind: "spots_left", spotsLeft };
  return { kind: "available", spotsLeft };
}
