#!/usr/bin/env node
/*
 * scripts/backfill-sessions.mjs
 *
 * Student LK v2 Stage A / M9 — backfill sessions для existing active
 * cohorts.
 *
 * Что делает:
 *   1. SELECT JOIN cohorts + cohort_slots WHERE status IN ('open','running').
 *   2. Для каждой row:
 *      - Parse modules_snapshot_json → list slugs.
 *      - Compute session UTC unix timestamps через
 *        scripts/lib/compute-session-dates.mjs (DST-aware).
 *      - INSERT OR IGNORE sessions (через UNIQUE (cohort_id, module_slug)).
 *
 * Idempotent — INSERT OR IGNORE пропускает существующие rows.
 *
 * Usage:
 *   node scripts/backfill-sessions.mjs --local --dry-run
 *   node scripts/backfill-sessions.mjs --local
 *   node scripts/backfill-sessions.mjs --remote
 *
 * Pre-requirement: M8 (backfill-cohort-modules-snapshot.mjs) выполнен —
 * cohorts.modules_snapshot_json не пустой.
 *
 * Spec: docs/student-lk-v2-spec.md § 9 M9.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { randomUUID } from 'crypto';
import { computeSessionDates } from './lib/compute-session-dates.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');
const isDryRun = args.includes('--dry-run');

if (!isLocal && !isRemote) {
  console.error('[backfill-sessions] specify --local or --remote');
  process.exit(1);
}

// ============================================================
// Step 1: query cohorts + slots
// ============================================================
console.log(`[backfill-sessions] mode: ${isLocal ? 'local' : 'remote'}${isDryRun ? ' (dry-run)' : ''}`);
console.log('[backfill-sessions] querying D1 cohorts + slots...');

const d1Result = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--json',
  '--command', `
    SELECT c.id AS cohort_id, c.start_date, c.modules_snapshot_json,
           s.days_json, s.time_et
      FROM cohorts c
      JOIN slots s ON s.id = c.slot_id
     WHERE c.status IN ('open','running')
  `,
], { cwd: repoRoot, encoding: 'utf8' });

if (d1Result.status !== 0) {
  console.error('[backfill-sessions] D1 query failed:', d1Result.stderr);
  process.exit(1);
}

let cohorts;
try {
  const out = d1Result.stdout;
  const jsonStart = out.indexOf('[');
  const parsed = JSON.parse(out.slice(jsonStart));
  cohorts = parsed[0]?.results ?? [];
} catch (err) {
  console.error('[backfill-sessions] failed to parse D1 output:', err);
  process.exit(1);
}

console.log(`[backfill-sessions] ${cohorts.length} cohort rows`);

// ============================================================
// Step 2: per cohort — compute dates + INSERT sessions
// ============================================================
let totalInserted = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const cohort of cohorts) {
  const { cohort_id, start_date, modules_snapshot_json, days_json, time_et } = cohort;

  let modules, days;
  try {
    modules = JSON.parse(modules_snapshot_json);
    days = JSON.parse(days_json);
  } catch (err) {
    console.error(`  cohort ${cohort_id}: JSON parse failed:`, err);
    totalFailed++;
    continue;
  }

  if (!Array.isArray(modules) || modules.length === 0) {
    console.log(`  cohort ${cohort_id}: SKIP (empty modules_snapshot)`);
    totalSkipped++;
    continue;
  }
  if (!Array.isArray(days) || days.length === 0) {
    console.log(`  cohort ${cohort_id}: SKIP (empty days_json)`);
    totalSkipped++;
    continue;
  }

  let sessionDates;
  try {
    sessionDates = computeSessionDates({
      startUnix: start_date,
      count: modules.length,
      days,
      timeEt: time_et,
    });
  } catch (err) {
    console.error(`  cohort ${cohort_id}: computeSessionDates failed:`, err);
    totalFailed++;
    continue;
  }

  console.log(`  cohort ${cohort_id}: ${modules.length} sessions (first: ${new Date(sessionDates[0] * 1000).toISOString()}, last: ${new Date(sessionDates[sessionDates.length - 1] * 1000).toISOString()})`);

  if (isDryRun) {
    totalInserted += modules.length;
    continue;
  }

  let cohortInserted = 0;
  for (let i = 0; i < modules.length; i++) {
    const sessionId = randomUUID();
    const moduleSlug = modules[i].replace(/'/g, "''");
    const scheduledAt = sessionDates[i];

    const ins = spawnSync('corepack', [
      'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
      isLocal ? '--local' : '--remote',
      '--command',
      `INSERT OR IGNORE INTO sessions (id, cohort_id, module_slug, order_idx, scheduled_at, status, created_at, updated_at)
       VALUES ('${sessionId}', '${cohort_id}', '${moduleSlug}', ${i}, ${scheduledAt}, 'scheduled', unixepoch(), unixepoch())`,
    ], { cwd: repoRoot, encoding: 'utf8' });

    if (ins.status !== 0) {
      console.error(`    session ${i} (${moduleSlug}): INSERT failed: ${ins.stderr}`);
      totalFailed++;
      continue;
    }
    cohortInserted++;
  }

  totalInserted += cohortInserted;
}

console.log(`[backfill-sessions] done: ${totalInserted} inserted (or pre-existing), ${totalSkipped} skipped cohorts, ${totalFailed} failed`);
if (totalFailed > 0) process.exit(1);
