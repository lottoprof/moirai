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

const draftsDir = resolve(repoRoot, 'scripts/seed/student-book-drafts');
const files = readdirSync(draftsDir).filter((f) => f.endsWith('.md'));

if (only) {
  const target = files.find((f) => f === `${only}.md` || f.startsWith(`${only}.`));
  if (!target) {
    console.error(`[upload] --only=${only}: file not found`);
    process.exit(1);
  }
  console.log(`[upload] selecting ${target}`);
  uploadOne(target);
  process.exit(0);
}

console.log(`[upload] ${files.length} files to upload to R2 bucket 'moirai-content'`);

let success = 0;
let failed = 0;

for (const f of files) {
  const ok = uploadOne(f);
  if (ok) success++;
  else failed++;
}

console.log(`[upload] done: ${success} success, ${failed} failed`);
if (failed > 0) process.exit(1);

function uploadOne(filename) {
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
    return false;
  }
  process.stdout.write(`ok\n`);
  return true;
}
