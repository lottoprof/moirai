#!/usr/bin/env node
/*
 * scripts/seed-slots.mjs
 *
 * Stage 14e — initial slot configuration для apply flow.
 *
 * Создаёт базовую сетку slots для published programmes:
 *   - Beginner:     4 slots (2 day_pairs × 2 times) — широкий охват
 *   - Intermediate: 4 slots (то же)
 *   - Bundle:       2 slots (Mon+Thu evening + Tue+Fri morning — half coverage)
 *
 * instructor_id = NULL — admin назначит вручную через admin LK позже.
 *
 * Idempotent: проверяет существование по (programme_id, days_json, time_et)
 * перед INSERT. Перезапуск безопасен.
 *
 * Usage:
 *   node scripts/seed-slots.mjs --local            # local D1
 *   node scripts/seed-slots.mjs                     # remote prod
 *   node scripts/seed-slots.mjs --dry-run           # покажет SQL, не применит
 *
 * После seed запускать scripts/publish-cohorts.mjs для генерации
 * cohorts на 12 мес вперёд.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isDryRun = args.includes('--dry-run');

console.log(`[seed-slots] target: ${isLocal ? 'LOCAL D1' : 'PROD D1 (remote)'}${isDryRun ? ' (DRY RUN)' : ''}`);

// ============================================================
// Slot definitions
// ============================================================
// Каждый slot: { programme_id, days, time_et, max_students }
// days — массив weekday-кодов: ['mon','thu'] = пара Mon+Thu
// time_et — 'HH:MM' в фикс ET (FLOW-26)

const slots = [
  // Beginner — 4 slots
  { programme_id: 'beginner',     days: ['mon','thu'], time_et: '09:00', max_students: 10 },
  { programme_id: 'beginner',     days: ['mon','thu'], time_et: '19:00', max_students: 10 },
  { programme_id: 'beginner',     days: ['tue','fri'], time_et: '09:00', max_students: 10 },
  { programme_id: 'beginner',     days: ['tue','fri'], time_et: '19:00', max_students: 10 },

  // Intermediate — 4 slots
  { programme_id: 'intermediate', days: ['mon','thu'], time_et: '09:00', max_students: 10 },
  { programme_id: 'intermediate', days: ['mon','thu'], time_et: '19:00', max_students: 10 },
  { programme_id: 'intermediate', days: ['tue','fri'], time_et: '09:00', max_students: 10 },
  { programme_id: 'intermediate', days: ['tue','fri'], time_et: '19:00', max_students: 10 },

  // Bundle — 2 slots (less popular, narrower coverage)
  { programme_id: 'bundle',       days: ['mon','thu'], time_et: '19:00', max_students: 10 },
  { programme_id: 'bundle',       days: ['tue','fri'], time_et: '09:00', max_students: 10 },
];

console.log(`[seed-slots] определено ${slots.length} slot'ов`);

// ============================================================
// SQL генерация
// ============================================================

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Idempotent: для каждого slot'a — проверка EXISTS + INSERT если нет.
// SQLite не имеет INSERT ... ON CONFLICT для не-PK constraints; делаем
// явно через подзапрос NOT EXISTS.
function buildInsertSql(slot) {
  const daysJson = JSON.stringify(slot.days);
  return `INSERT INTO slots
    (id, programme_id, days_json, time_et, instructor_id, max_students, active, created_at, updated_at)
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    ${sqlStr(slot.programme_id)},
    ${sqlStr(daysJson)},
    ${sqlStr(slot.time_et)},
    NULL,
    ${slot.max_students},
    1,
    unixepoch(),
    unixepoch()
  WHERE NOT EXISTS (
    SELECT 1 FROM slots
    WHERE programme_id = ${sqlStr(slot.programme_id)}
      AND days_json = ${sqlStr(daysJson)}
      AND time_et = ${sqlStr(slot.time_et)}
  );`;
}

const statements = slots.map(buildInsertSql);
const fullSql = statements.join('\n');

if (isDryRun) {
  console.log('\n--- SQL (dry run) ---\n');
  console.log(fullSql);
  console.log('\n--- END SQL ---');
  process.exit(0);
}

// ============================================================
// Apply через wrangler d1 execute
// ============================================================

const wranglerArgs = [
  'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--command', fullSql,
];

console.log(`[seed-slots] applying ${statements.length} INSERT statements...`);

const result = spawnSync('corepack', ['pnpm', 'exec', ...wranglerArgs], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error(`[seed-slots] FAILED — wrangler exit code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('[seed-slots] done');
console.log('[seed-slots] verify: wrangler d1 execute moirai-prod ' +
  `${isLocal ? '--local' : '--remote'} ` +
  `--command "SELECT programme_id, days_json, time_et, instructor_id IS NULL AS unassigned FROM slots ORDER BY programme_id, time_et;"`);
console.log('[seed-slots] next: node scripts/publish-cohorts.mjs' + (isLocal ? ' --local' : ''));
