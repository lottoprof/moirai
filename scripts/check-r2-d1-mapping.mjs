#!/usr/bin/env node
/*
 * scripts/check-r2-d1-mapping.mjs
 *
 * Validator для R2 ↔ D1 consistency (Stage 22+).
 *
 * Алгоритм:
 *   1. Query D1: все `modules` rows с has_text=1 → ожидаемые `body_r2_key`
 *   2. Для каждого ключа — HEAD/GET в R2 через wrangler
 *   3. Report:
 *      - ✓ exists in both (D1 → R2 OK)
 *      - ✘ in D1 but missing in R2 (broken link — runtime получит null)
 *      - (orphan R2 без D1 — detect requires R2 object list API,
 *         которого нет в wrangler CLI. Sprint 2: через S3-compat API.)
 *
 * Exit 0 если все D1 keys существуют в R2; 1 — если есть missing.
 *
 * Usage:
 *   node scripts/check-r2-d1-mapping.mjs
 *   node scripts/check-r2-d1-mapping.mjs --local         # local D1 vs R2 prod
 *   node scripts/check-r2-d1-mapping.mjs --skip-r2       # только D1 audit (быстро)
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const skipR2 = args.includes('--skip-r2');

console.log(`[check] D1: ${isLocal ? 'local' : 'remote'}, R2: ${skipR2 ? 'SKIPPED' : 'remote'}`);

// ============================================================
// 1. Query D1
// ============================================================

const d1Result = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--json',
  '--command', `SELECT slug, locale, body_r2_key, has_text FROM modules`,
], { cwd: repoRoot, encoding: 'utf8' });

if (d1Result.status !== 0) {
  console.error('[check] D1 query failed:', d1Result.stderr);
  process.exit(1);
}

let rows;
try {
  const out = d1Result.stdout;
  const jsonStart = out.indexOf('[');
  const parsed = JSON.parse(out.slice(jsonStart));
  rows = parsed[0]?.results ?? [];
} catch (err) {
  console.error('[check] failed to parse D1 output:', err);
  process.exit(1);
}

const expected = rows.filter((r) => r.has_text === 1);
console.log(`[check] D1: ${rows.length} modules total, ${expected.length} с has_text=1`);

// ============================================================
// 2. D1 sanity checks
// ============================================================

const issues = [];

// 2a. body_r2_key должен быть NOT NULL для has_text=1
for (const r of expected) {
  if (!r.body_r2_key) {
    issues.push(`D1: ${r.slug}.${r.locale} имеет has_text=1 но body_r2_key=NULL`);
  }
}

// 2b. body_r2_key должен следовать конвенции modules/{slug}.{locale}.md
for (const r of expected) {
  if (!r.body_r2_key) continue;
  const expected = `modules/${r.slug}.${r.locale}.md`;
  if (r.body_r2_key !== expected) {
    issues.push(`D1: ${r.slug}.${r.locale} body_r2_key='${r.body_r2_key}' ≠ expected '${expected}'`);
  }
}

// 2c. Duplicate body_r2_key
const keyCounts = new Map();
for (const r of expected) {
  if (!r.body_r2_key) continue;
  keyCounts.set(r.body_r2_key, (keyCounts.get(r.body_r2_key) ?? 0) + 1);
}
for (const [key, n] of keyCounts) {
  if (n > 1) issues.push(`D1: ${n} модулей с одинаковым body_r2_key='${key}'`);
}

if (issues.length > 0) {
  console.log('\n--- D1 issues ---');
  for (const i of issues) console.log(`  ✘ ${i}`);
}

// ============================================================
// 3. R2 existence check
// ============================================================

let r2Missing = 0;
let r2Ok = 0;

if (!skipR2) {
  console.log(`\n[check] verifying R2 objects (${expected.length} HEAD checks)...`);
  for (const r of expected) {
    if (!r.body_r2_key) continue;
    const tmpFile = `${tmpdir()}/r2-check-${process.pid}-${r.slug}-${r.locale}.md`;
    const get = spawnSync('corepack', [
      'pnpm', 'exec', 'wrangler', 'r2', 'object', 'get',
      `moirai-content/${r.body_r2_key}`,
      '--file', tmpFile,
      '--remote',
    ], { cwd: repoRoot, encoding: 'utf8' });

    if (get.status !== 0) {
      console.log(`  ✘ MISSING ${r.body_r2_key} (slug=${r.slug}, locale=${r.locale})`);
      r2Missing++;
    } else {
      r2Ok++;
    }
  }
}

// ============================================================
// 4. Summary
// ============================================================

console.log('');
console.log('=== Summary ===');
console.log(`D1 modules:          ${rows.length}`);
console.log(`D1 has_text=1:       ${expected.length}`);
console.log(`D1 issues:           ${issues.length}`);
if (!skipR2) {
  console.log(`R2 objects exist:    ${r2Ok}`);
  console.log(`R2 objects missing:  ${r2Missing}`);
}
console.log('');

if (issues.length > 0 || r2Missing > 0) {
  console.error('✘ check FAILED');
  process.exit(1);
}
console.log('✓ R2 ↔ D1 mapping ok');
