#!/usr/bin/env node
/*
 * scripts/apply-modules-cleanup.mjs
 *
 * Student LK v2 Stage A / M4 — drop replaced columns в modules table.
 *
 * Бывшая миграция 0013_modules_cleanup.sql — переделана в script
 * чтобы admin мог запустить ПОСЛЕ verify M3 success. Wrangler
 * `migrations apply` запускает все pending одной командой, что
 * приводит к dropping columns ДО M3 data migration.
 *
 * Что делает:
 *   ALTER TABLE modules DROP COLUMN body_r2_key;
 *   ALTER TABLE modules DROP COLUMN homework_md;
 *
 * Pre-requirement (CRITICAL):
 *   1. Migrations 0011_sessions.sql + 0012_modules_split.sql applied
 *      (presentation_r2_key + workbook_r2_key columns added).
 *   2. scripts/migrate-modules-bodies.mjs запущен и success на target
 *      environment — все modules имеют workbook_r2_key NOT NULL.
 *   3. Stage B/C код обновлён — больше не reads body_r2_key / homework_md.
 *   4. Verify: pnpm check:r2-d1 зелёный.
 *
 * Usage:
 *   node scripts/apply-modules-cleanup.mjs --local
 *   node scripts/apply-modules-cleanup.mjs --remote
 *
 * Spec: docs/student-lk-v2-spec.md § 9 M4 (revised).
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');

if (!isLocal && !isRemote) {
  console.error('[modules-cleanup] specify --local or --remote');
  process.exit(1);
}

// ============================================================
// Pre-check 1: presentation_r2_key + workbook_r2_key columns exist?
// ============================================================
const colCheck = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--json',
  '--command',
  `SELECT name FROM pragma_table_info('modules')
    WHERE name IN ('presentation_r2_key','workbook_r2_key','body_r2_key','homework_md')`,
], { cwd: repoRoot, encoding: 'utf8' });

if (colCheck.status !== 0) {
  console.error('[modules-cleanup] column check failed:', colCheck.stderr);
  process.exit(1);
}

let colNames;
try {
  const out = colCheck.stdout;
  const jsonStart = out.indexOf('[');
  const parsed = JSON.parse(out.slice(jsonStart));
  colNames = new Set((parsed[0]?.results ?? []).map((r) => r.name));
} catch (err) {
  console.error('[modules-cleanup] parse failed:', err);
  process.exit(1);
}

const hasNew = colNames.has('presentation_r2_key') && colNames.has('workbook_r2_key');
const hasOld = colNames.has('body_r2_key') || colNames.has('homework_md');

if (!hasNew) {
  console.error('[modules-cleanup] presentation_r2_key или workbook_r2_key отсутствуют — apply 0012 первым');
  process.exit(1);
}

if (!hasOld) {
  console.log('[modules-cleanup] body_r2_key и homework_md уже dropped — nothing to do');
  process.exit(0);
}

// ============================================================
// Pre-check 2: M3 data migration уже выполнен? (workbook_r2_key NOT NULL)
// ============================================================
const dataCheck = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--json',
  '--command',
  `SELECT COUNT(*) AS n FROM modules WHERE workbook_r2_key IS NULL`,
], { cwd: repoRoot, encoding: 'utf8' });

if (dataCheck.status !== 0) {
  console.error('[modules-cleanup] data check failed:', dataCheck.stderr);
  process.exit(1);
}

let nullCount = 0;
try {
  const out = dataCheck.stdout;
  const jsonStart = out.indexOf('[');
  const parsed = JSON.parse(out.slice(jsonStart));
  nullCount = parsed[0]?.results?.[0]?.n ?? 0;
} catch (err) {
  console.error('[modules-cleanup] parse failed:', err);
  process.exit(1);
}

if (nullCount > 0) {
  console.error(`[modules-cleanup] ${nullCount} modules имеют workbook_r2_key=NULL — запустите migrate-modules-bodies.mjs первым`);
  process.exit(1);
}

// ============================================================
// Apply cleanup
// ============================================================
console.log(`[modules-cleanup] mode: ${isLocal ? 'local' : 'remote'}`);
console.log('[modules-cleanup] dropping body_r2_key + homework_md...');

const drops = [
  `ALTER TABLE modules DROP COLUMN body_r2_key`,
  `ALTER TABLE modules DROP COLUMN homework_md`,
];

let dropFailed = false;
for (const sql of drops) {
  console.log(`  ${sql}`);
  const r = spawnSync('corepack', [
    'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
    isLocal ? '--local' : '--remote',
    '--command', sql,
  ], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`    failed: ${r.stderr}`);
    dropFailed = true;
  }
}

if (dropFailed) {
  process.exit(1);
}

console.log('[modules-cleanup] done');
