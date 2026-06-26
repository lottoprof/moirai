#!/usr/bin/env node
/*
 * scripts/backfill-sessions-batch.mjs
 *
 * Batch-версия backfill-sessions.mjs — генерит один SQL файл с всеми
 * INSERT'ами, один wrangler d1 execute call (vs 856 individual calls).
 *
 * Idempotent через INSERT OR IGNORE + UNIQUE (cohort_id, module_slug).
 * После INSERT sessions для каждой cohort'ы добавляется
 * UPDATE cohorts SET end_date = lastSession + 86400 — синк с
 * convention из admin API (src/pages/api/admin/cohorts/index.ts).
 * publish-cohorts.mjs ставит rough estimate, backfill корректирует
 * до реальной last_session + 1 day буфера.
 *
 * Usage:
 *   node scripts/backfill-sessions-batch.mjs --local | --remote [--dry-run]
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { computeSessionDates } from './lib/compute-session-dates.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');
const isDryRun = args.includes('--dry-run');

if (!isLocal && !isRemote) {
  console.error('[backfill-sessions-batch] specify --local or --remote');
  process.exit(1);
}

console.log(`[backfill-sessions-batch] mode: ${isLocal ? 'local' : 'remote'}${isDryRun ? ' (dry-run)' : ''}`);
console.log('[backfill-sessions-batch] querying D1 cohorts + slots...');

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
  console.error('[backfill-sessions-batch] D1 query failed:', d1Result.stderr);
  process.exit(1);
}

let cohorts;
try {
  const out = d1Result.stdout;
  const jsonStart = out.indexOf('[');
  const parsed = JSON.parse(out.slice(jsonStart));
  cohorts = parsed[0]?.results ?? [];
} catch (err) {
  console.error('[backfill-sessions-batch] failed to parse D1 output:', err);
  process.exit(1);
}

console.log(`[backfill-sessions-batch] ${cohorts.length} cohorts`);

const sqlStatements = [];
let totalSessions = 0;
let skippedCohorts = 0;

for (const cohort of cohorts) {
  const { cohort_id, start_date, modules_snapshot_json, days_json, time_et } = cohort;

  let modules, days;
  try {
    modules = JSON.parse(modules_snapshot_json);
    days = JSON.parse(days_json);
  } catch {
    skippedCohorts++;
    continue;
  }

  if (!Array.isArray(modules) || modules.length === 0) {
    skippedCohorts++;
    continue;
  }
  if (!Array.isArray(days) || days.length === 0) {
    skippedCohorts++;
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
    console.error(`  cohort ${cohort_id}: compute failed:`, err);
    skippedCohorts++;
    continue;
  }

  for (let i = 0; i < modules.length; i++) {
    const sessionId = randomUUID();
    const moduleSlug = modules[i].replace(/'/g, "''");
    const scheduledAt = sessionDates[i];
    sqlStatements.push(
      `INSERT OR IGNORE INTO sessions (id, cohort_id, module_slug, order_idx, scheduled_at, status, created_at, updated_at) VALUES ('${sessionId}', '${cohort_id}', '${moduleSlug}', ${i}, ${scheduledAt}, 'scheduled', unixepoch(), unixepoch());`
    );
    totalSessions++;
  }

  // Sync cohort.end_date = lastSession + 86400 (1 day buffer).
  // Convention из admin API (src/pages/api/admin/cohorts/index.ts:99-100).
  // Idempotent: WHERE end_date != target — no-op если уже синхронно.
  const lastSession = sessionDates[sessionDates.length - 1];
  const cohortEnd = lastSession + 86400;
  sqlStatements.push(
    `UPDATE cohorts SET end_date = ${cohortEnd}, updated_at = unixepoch() WHERE id = '${cohort_id}' AND end_date != ${cohortEnd};`
  );
}

console.log(`[backfill-sessions-batch] ${totalSessions} INSERT statements ready (${skippedCohorts} cohorts skipped)`);

if (isDryRun) {
  console.log('[backfill-sessions-batch] dry-run done (no execution)');
  process.exit(0);
}

// Write single SQL file
const tmpFile = join(tmpdir(), `backfill-sessions-${Date.now()}.sql`);
writeFileSync(tmpFile, sqlStatements.join('\n') + '\n', 'utf8');
console.log(`[backfill-sessions-batch] SQL written to ${tmpFile}`);

// Single wrangler execute --file call
console.log('[backfill-sessions-batch] executing batch...');
const exec = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--file', tmpFile,
], { cwd: repoRoot, encoding: 'utf8', stdio: 'inherit' });

if (exec.status !== 0) {
  console.error('[backfill-sessions-batch] batch exec failed');
  console.error('SQL file kept at:', tmpFile);
  process.exit(1);
}

// Cleanup
try { unlinkSync(tmpFile); } catch { /* ignore */ }
console.log(`[backfill-sessions-batch] done: ${totalSessions} sessions processed`);
