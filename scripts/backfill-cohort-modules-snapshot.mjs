#!/usr/bin/env node
/*
 * scripts/backfill-cohort-modules-snapshot.mjs
 *
 * Student LK v2 Stage A / M8 — backfill cohorts.modules_snapshot_json.
 *
 * Что делает:
 *   1. Парсит src/content/programmes/<slug>.en.mdx frontmatter — читает
 *      `modules:` YAML list.
 *   2. SELECT id, programme_slug (либо programme_id) FROM cohorts.
 *   3. Для каждой row: UPDATE modules_snapshot_json = JSON-stringified array.
 *
 * Idempotent — повторный run перезаписывает (что ок до first cohort start —
 * после этого snapshot должен быть immutable, но это в Stage B/C enforce'им).
 *
 * Usage:
 *   node scripts/backfill-cohort-modules-snapshot.mjs --local --dry-run
 *   node scripts/backfill-cohort-modules-snapshot.mjs --local
 *   node scripts/backfill-cohort-modules-snapshot.mjs --remote
 *
 * Spec: docs/student-lk-v2-spec.md § 9 M8.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');
const isDryRun = args.includes('--dry-run');

if (!isLocal && !isRemote) {
  console.error('[backfill-snapshot] specify --local or --remote');
  process.exit(1);
}

// ============================================================
// Step 1: parse programme MDX files → modules arrays
// ============================================================
function parseProgrammeModules(slug) {
  const path = resolve(repoRoot, `src/content/programmes/${slug}.en.mdx`);
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`[backfill-snapshot] cannot read ${path}:`, err.message);
    return null;
  }

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    console.error(`[backfill-snapshot] no frontmatter in ${path}`);
    return null;
  }
  const frontmatter = fmMatch[1];

  // YAML list pattern:
  //   modules:
  //     - beg-01-lumiere-frame
  //     - beg-02-melies-frame
  // Также возможно пустой:
  //   modules: []
  const emptyMatch = frontmatter.match(/^modules:\s*\[\s*\]\s*$/m);
  if (emptyMatch) return [];

  const listMatch = frontmatter.match(/^modules:\s*\n((?:[ \t]+- .+\n)+)/m);
  if (!listMatch) {
    console.error(`[backfill-snapshot] cannot find modules: in ${path}`);
    return null;
  }

  const lines = listMatch[1].split('\n').filter((l) => l.trim());
  const modules = lines.map((l) => l.replace(/^[ \t]+- /, '').trim());
  return modules;
}

const programmeSlugs = ['beginner', 'intermediate', 'bundle', 'individual'];
const programmesMap = {};

for (const slug of programmeSlugs) {
  const modules = parseProgrammeModules(slug);
  if (modules === null) {
    console.error(`[backfill-snapshot] failed to parse programme ${slug}`);
    process.exit(1);
  }
  programmesMap[slug] = modules;
  console.log(`[backfill-snapshot] programme ${slug}: ${modules.length} modules`);
}

// ============================================================
// Step 2: query D1 cohorts
// ============================================================
console.log(`[backfill-snapshot] mode: ${isLocal ? 'local' : 'remote'}${isDryRun ? ' (dry-run)' : ''}`);
console.log('[backfill-snapshot] querying D1 cohorts...');

const d1Result = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--json',
  '--command',
  `SELECT id, programme_id FROM cohorts`,
], { cwd: repoRoot, encoding: 'utf8' });

if (d1Result.status !== 0) {
  console.error('[backfill-snapshot] D1 query failed:', d1Result.stderr);
  process.exit(1);
}

let cohorts;
try {
  const out = d1Result.stdout;
  const jsonStart = out.indexOf('[');
  const parsed = JSON.parse(out.slice(jsonStart));
  cohorts = parsed[0]?.results ?? [];
} catch (err) {
  console.error('[backfill-snapshot] failed to parse D1 output:', err);
  process.exit(1);
}

console.log(`[backfill-snapshot] ${cohorts.length} cohort rows`);

// ============================================================
// Step 3: per cohort — UPDATE modules_snapshot_json
// ============================================================
let success = 0;
let skipped = 0;
let failed = 0;

for (const cohort of cohorts) {
  const { id, programme_id } = cohort;
  const modules = programmesMap[programme_id];
  if (modules === undefined) {
    console.log(`  cohort ${id} (programme=${programme_id}): SKIP (unknown programme)`);
    skipped++;
    continue;
  }

  const json = JSON.stringify(modules);

  if (isDryRun) {
    console.log(`  cohort ${id} (programme=${programme_id}): [dry-run] set modules_snapshot_json (${modules.length} modules)`);
    success++;
    continue;
  }

  // SQL-escape single quotes в JSON
  const sqlSafe = json.replace(/'/g, "''");
  const update = spawnSync('corepack', [
    'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
    isLocal ? '--local' : '--remote',
    '--command',
    `UPDATE cohorts SET modules_snapshot_json = '${sqlSafe}' WHERE id = '${id}'`,
  ], { cwd: repoRoot, encoding: 'utf8' });

  if (update.status !== 0) {
    console.error(`  cohort ${id}: D1 UPDATE failed: ${update.stderr}`);
    failed++;
    continue;
  }

  console.log(`  cohort ${id} (programme=${programme_id}): ok (${modules.length} modules)`);
  success++;
}

console.log(`[backfill-snapshot] done: ${success} success, ${skipped} skipped, ${failed} failed`);
if (failed > 0) process.exit(1);
