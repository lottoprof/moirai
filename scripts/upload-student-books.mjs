#!/usr/bin/env node
/*
 * scripts/upload-student-books.mjs
 *
 * Stage 22e — загружает scripts/seed/student-book-drafts/*.md в R2
 * bucket `moirai-content` по путям `modules/{slug}.{locale}.md`.
 *
 * Использует `wrangler r2 object put --file=<path>`. Idempotent
 * (override existing object — R2 PUT semantics).
 *
 * Usage:
 *   node scripts/upload-student-books.mjs              # все 48 файлов
 *   node scripts/upload-student-books.mjs --only=beg-01-lumiere-frame.en
 *
 * После: D1 modules.body_r2_key уже содержит planned path (seed-modules
 * выставил `modules/{slug}.{locale}.md`) — fetch через
 * env.MODULE_CONTENT.get() возвращает body.
 */

import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : null;
const isLocal = args.includes('--local');

const draftsDir = resolve(repoRoot, 'scripts/seed/student-book-drafts');
const files = readdirSync(draftsDir).filter((f) => f.endsWith('.md'));

// ============================================================
// Pre-check: D1 metadata должна существовать для каждого файла
// ============================================================
// FAIL-SAFE: если у файла нет соответствующей row в `modules` table,
// upload в R2 пропускается. Это предотвращает orphan objects в R2
// (контент без metadata в D1 = невидим для runtime).
console.log('[upload] querying D1 modules metadata...');
const d1Result = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--json',
  '--command', `SELECT slug, locale FROM modules WHERE has_text=1`,
], { cwd: repoRoot, encoding: 'utf8' });

if (d1Result.status !== 0) {
  console.error('[upload] D1 query failed:', d1Result.stderr);
  process.exit(1);
}

let knownKeys;
try {
  const out = d1Result.stdout;
  const jsonStart = out.indexOf('[');
  const parsed = JSON.parse(out.slice(jsonStart));
  const rows = parsed[0]?.results ?? [];
  knownKeys = new Set(rows.map((r) => `${r.slug}.${r.locale}`));
} catch (err) {
  console.error('[upload] failed to parse D1 output:', err);
  process.exit(1);
}
console.log(`[upload] D1: ${knownKeys.size} (slug, locale) keys with has_text=1`);

if (only) {
  const target = files.find((f) => f === `${only}.md` || f.startsWith(`${only}.`));
  if (!target) {
    console.error(`[upload] --only=${only}: file not found`);
    process.exit(1);
  }
  console.log(`[upload] selecting ${target}`);
  const result = uploadOne(target);
  process.exit(result === 'ok' ? 0 : 1);
}

console.log(`[upload] ${files.length} files in drafts dir`);

let success = 0;
let failed = 0;
let skipped = 0;

for (const f of files) {
  const result = uploadOne(f);
  if (result === 'ok') success++;
  else if (result === 'skipped') skipped++;
  else failed++;
}

console.log(`[upload] done: ${success} success, ${skipped} skipped (no D1 row), ${failed} failed`);
if (failed > 0) process.exit(1);

function uploadOne(filename) {
  // Pre-check: existing D1 row для этого (slug, locale)?
  const m = filename.match(/^(.+)\.(en|ru)\.md$/);
  if (!m) {
    process.stdout.write(`  ${filename}: SKIP (invalid filename, expected <slug>.<locale>.md)\n`);
    return 'skipped';
  }
  const [, slug, locale] = m;
  const key = `${slug}.${locale}`;
  if (!knownKeys.has(key)) {
    process.stdout.write(`  ${filename}: SKIP (нет D1 row с slug=${slug}, locale=${locale}, has_text=1)\n`);
    return 'skipped';
  }

  // filename = 'beg-01-lumiere-frame.en.md'
  // R2 key = 'modules/beg-01-lumiere-frame.en.md'
  const r2Key = `modules/${filename}`;
  const filePath = join(draftsDir, filename);
  process.stdout.write(`  ${r2Key} ... `);
  const result = spawnSync('corepack', [
    'pnpm', 'exec', 'wrangler', 'r2', 'object', 'put',
    `moirai-content/${r2Key}`,
    '--file', filePath,
    '--content-type', 'text/markdown',
    '--remote',
  ], { cwd: repoRoot, encoding: 'utf8' });

  if (result.status !== 0) {
    process.stdout.write(`FAILED\n`);
    if (result.stderr) console.error(result.stderr);
    return 'failed';
  }
  process.stdout.write(`ok\n`);
  return 'ok';
}
