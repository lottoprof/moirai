#!/usr/bin/env node
/*
 * scripts/publish-cohorts.mjs
 *
 * Stage 14f — auto-publish cohorts на 12 месяцев вперёд из active slots.
 *
 * Алгоритм (для каждого active slot):
 *   1. Resolve programme.lessons_total_hint из Content Collection
 *      (src/content/programmes/<slug>.en.mdx frontmatter)
 *   2. durationWeeks = ceil(lessons / 2)  — FLOW-8
 *   3. earliestStart = max(now, latest_cohort.end_date)
 *   4. Pick first weekday из slot.days_json как cohort start day
 *   5. Generate consecutive start_dates до horizon (12 мес)
 *   6. INSERT cohort если (slot_id, start_date) не существует
 *
 * Idempotent: повторный запуск не плодит дубли.
 *
 * Usage:
 *   node scripts/publish-cohorts.mjs --local
 *   node scripts/publish-cohorts.mjs              # remote prod
 *   node scripts/publish-cohorts.mjs --dry-run    # покажет что бы создалось
 *   node scripts/publish-cohorts.mjs --horizon-months 6   # override horizon
 *
 * Sprint 2: cron-daily через GH Actions / CF Cron Triggers.
 */

import { readFileSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isDryRun = args.includes('--dry-run');

const horizonIdx = args.indexOf('--horizon-months');
const horizonMonths = horizonIdx >= 0 ? parseInt(args[horizonIdx + 1], 10) : 12;

if (!Number.isFinite(horizonMonths) || horizonMonths < 1 || horizonMonths > 24) {
  console.error(`[publish] invalid --horizon-months value: ${horizonMonths}. Must be 1..24.`);
  process.exit(1);
}

console.log(`[publish] target: ${isLocal ? 'LOCAL D1' : 'PROD D1 (remote)'}${isDryRun ? ' (DRY RUN)' : ''}, horizon ${horizonMonths} months`);

// ============================================================
// Constants
// ============================================================

const DAY_SEC = 24 * 3600;
const WEEKDAY_TO_INT = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const SESSIONS_PER_WEEK = 2; // FLOW-4

// ============================================================
// Programme metadata reader (parse mdx frontmatter)
// ============================================================

function readProgrammeLessons() {
  const dir = resolve(repoRoot, 'src/content/programmes');
  const files = readdirSync(dir).filter((f) => f.endsWith('.en.mdx'));
  const map = {};
  for (const f of files) {
    const slug = f.replace('.en.mdx', '');
    const text = readFileSync(join(dir, f), 'utf8');
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    const lessonsMatch = fm.match(/^lessons_total_hint:\s*(\d+)/m);
    const publishedMatch = fm.match(/^published:\s*(true|false)/m);
    if (!lessonsMatch) {
      console.warn(`[publish] WARN ${slug}: no lessons_total_hint в frontmatter; skip`);
      continue;
    }
    const lessons = parseInt(lessonsMatch[1], 10);
    const published = publishedMatch ? publishedMatch[1] === 'true' : true;
    if (lessons <= 0) {
      console.log(`[publish] ${slug}: lessons=0 — skip (likely individual)`);
      continue;
    }
    if (!published) {
      console.log(`[publish] ${slug}: published=false — skip`);
      continue;
    }
    map[slug] = lessons;
  }
  return map;
}

const programmeLessons = readProgrammeLessons();
console.log('[publish] programme lessons:', programmeLessons);

// ============================================================
// Read active slots from D1
// ============================================================

function queryD1(sql) {
  const args = [
    'wrangler', 'd1', 'execute', 'moirai-prod',
    isLocal ? '--local' : '--remote',
    '--json',
    '--command', sql,
  ];
  const result = spawnSync('corepack', ['pnpm', 'exec', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`[publish] wrangler failed: ${result.stderr}`);
    process.exit(result.status ?? 1);
  }
  const out = result.stdout;
  const jsonStart = out.indexOf('[');
  if (jsonStart < 0) {
    console.error(`[publish] no JSON in wrangler output:\n${out}`);
    process.exit(1);
  }
  const parsed = JSON.parse(out.slice(jsonStart));
  return parsed[0]?.results ?? [];
}

const activeSlots = queryD1(
  `SELECT id, programme_id, days_json, time_et FROM slots WHERE active = 1`,
);
console.log(`[publish] active slots: ${activeSlots.length}`);

// ============================================================
// Compute next start dates
// ============================================================

function nextWeekdayAtOrAfter(sec, targetWeekday) {
  const startOfDay = Math.floor(sec / DAY_SEC) * DAY_SEC;
  const currentWeekday = new Date(startOfDay * 1000).getUTCDay();
  const delta = (targetWeekday - currentWeekday + 7) % 7;
  return startOfDay + delta * DAY_SEC;
}

function computeStartDates(daysJson, earliestStartSec, durationWeeks, horizonSec) {
  let days;
  try { days = JSON.parse(daysJson); } catch { return []; }
  if (!Array.isArray(days) || days.length === 0) return [];
  const intDays = days.map((d) => WEEKDAY_TO_INT[d] ?? -1).filter((i) => i >= 0).sort((a, b) => a - b);
  if (intDays.length === 0) return [];
  const firstWeekday = intDays[0];
  const intervalSec = durationWeeks * 7 * DAY_SEC;
  const dates = [];
  let current = nextWeekdayAtOrAfter(earliestStartSec, firstWeekday);
  while (current <= horizonSec) {
    dates.push(current);
    current = nextWeekdayAtOrAfter(current + intervalSec, firstWeekday);
  }
  return dates;
}

// ============================================================
// For each slot — compute + collect INSERTs
// ============================================================

const now = Math.floor(Date.now() / 1000);
const horizonSec = now + horizonMonths * 30 * DAY_SEC;

// Existing cohorts по slot+start_date (для idempotency)
const existing = queryD1(`SELECT slot_id, start_date FROM cohorts`);
const existingKey = new Set(existing.map((r) => `${r.slot_id}:${r.start_date}`));
console.log(`[publish] existing cohorts in D1: ${existing.length}`);

const newCohorts = [];

for (const slot of activeSlots) {
  const lessons = programmeLessons[slot.programme_id];
  if (!lessons) {
    console.log(`[publish] WARN slot ${slot.id} (${slot.programme_id}): no programme metadata; skip`);
    continue;
  }
  const durationWeeks = Math.ceil(lessons / SESSIONS_PER_WEEK);
  const intervalSec = durationWeeks * 7 * DAY_SEC;

  // Latest cohort для этого slot'а
  const latest = queryD1(
    `SELECT end_date FROM cohorts WHERE slot_id = '${slot.id}' ORDER BY start_date DESC LIMIT 1`,
  );
  const earliestStart = latest.length > 0 ? latest[0].end_date : now;

  const starts = computeStartDates(slot.days_json, earliestStart, durationWeeks, horizonSec);

  for (const startDate of starts) {
    const key = `${slot.id}:${startDate}`;
    if (existingKey.has(key)) continue;
    const endDate = startDate + intervalSec;
    newCohorts.push({
      slot_id: slot.id,
      programme_id: slot.programme_id,
      start_date: startDate,
      end_date: endDate,
    });
  }
}

console.log(`[publish] cohorts to insert: ${newCohorts.length}`);

if (newCohorts.length === 0) {
  console.log('[publish] nothing to do — all cohorts already published on horizon');
  process.exit(0);
}

// Show summary by programme
const summary = {};
for (const c of newCohorts) {
  summary[c.programme_id] = (summary[c.programme_id] || 0) + 1;
}
console.log('[publish] summary by programme:', summary);

// ============================================================
// Build INSERT SQL
// ============================================================

function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

const uuidExpr = `lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))`;

const statements = newCohorts.map((c) =>
  `INSERT INTO cohorts (id, programme_id, slot_id, start_date, end_date, status, apply_count, paid_count, created_at, updated_at)
   VALUES (${uuidExpr}, ${sqlStr(c.programme_id)}, ${sqlStr(c.slot_id)}, ${c.start_date}, ${c.end_date}, 'open', 0, 0, unixepoch(), unixepoch());`
);

if (isDryRun) {
  console.log('\n--- DRY RUN: 3 первых INSERT ---\n');
  for (const s of statements.slice(0, 3)) console.log(s);
  console.log(`\n... (${statements.length - 3} more)`);
  process.exit(0);
}

// Batch INSERTs — wrangler принимает несколько statements через ;
const batchSql = statements.join('\n');

console.log(`[publish] applying ${statements.length} INSERTs...`);
const applyResult = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--command', batchSql,
], { cwd: repoRoot, stdio: 'inherit' });

if (applyResult.status !== 0) {
  console.error(`[publish] FAILED`);
  process.exit(applyResult.status ?? 1);
}

console.log('[publish] done');
console.log('[publish] verify: SELECT programme_id, COUNT(*) FROM cohorts GROUP BY programme_id;');
