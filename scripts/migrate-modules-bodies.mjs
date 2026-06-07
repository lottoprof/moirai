#!/usr/bin/env node
/*
 * scripts/migrate-modules-bodies.mjs
 *
 * Student LK v2 Stage A / M3 — data migration для modules body split.
 *
 * Что делает:
 *   1. SELECT slug, locale, body_r2_key, homework_md FROM modules.
 *   2. Для каждой row:
 *      a. R2 GET old body_r2_key content (через wrangler r2 object get).
 *      b. Compose new workbook content:
 *           old body
 *           + concat `\n\n## ${homeworkTitle}\n\n${homework_md}\n` если homework_md not empty.
 *         homeworkTitle: "Домашнее задание" (ru) | "Homework" (en).
 *      c. R2 PUT `modules/${slug}/workbook.${locale}.md`.
 *      d. UPDATE modules SET workbook_r2_key + presentation_r2_key (pointer).
 *
 * Idempotent — re-run safe (R2 PUT overwrites, UPDATE заменяет).
 *
 * Usage:
 *   node scripts/migrate-modules-bodies.mjs --local --dry-run     # пред-показ
 *   node scripts/migrate-modules-bodies.mjs --local                # local D1+R2
 *   node scripts/migrate-modules-bodies.mjs --remote               # production
 *   node scripts/migrate-modules-bodies.mjs --local --only=beg-01-lumiere-frame.en
 *
 * Безопасность: НЕ удаляет old body_r2_key / homework_md в этой миграции.
 * Это делает migrations/0013_modules_cleanup.sql ПОСЛЕ verify success.
 *
 * Spec: docs/student-lk-v2-spec.md § 9 M3.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');
const isDryRun = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : null;

if (!isLocal && !isRemote) {
  console.error('[migrate-bodies] specify --local or --remote');
  process.exit(1);
}
if (isLocal && isRemote) {
  console.error('[migrate-bodies] cannot use both --local and --remote');
  process.exit(1);
}

const HOMEWORK_TITLE = { en: 'Homework', ru: 'Домашнее задание' };

// ============================================================
// Step 1: query D1 for all modules
// ============================================================
console.log(`[migrate-bodies] mode: ${isLocal ? 'local' : 'remote'}${isDryRun ? ' (dry-run)' : ''}`);
console.log('[migrate-bodies] querying D1 modules...');

const d1Result = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--json',
  '--command', `SELECT slug, locale, body_r2_key, homework_md FROM modules`,
], { cwd: repoRoot, encoding: 'utf8' });

if (d1Result.status !== 0) {
  console.error('[migrate-bodies] D1 query failed:', d1Result.stderr);
  process.exit(1);
}

let rows;
try {
  const out = d1Result.stdout;
  const jsonStart = out.indexOf('[');
  const parsed = JSON.parse(out.slice(jsonStart));
  rows = parsed[0]?.results ?? [];
} catch (err) {
  console.error('[migrate-bodies] failed to parse D1 output:', err);
  process.exit(1);
}

console.log(`[migrate-bodies] ${rows.length} modules rows`);

if (only) {
  const beforeCount = rows.length;
  rows = rows.filter((r) => `${r.slug}.${r.locale}` === only);
  console.log(`[migrate-bodies] --only=${only} → ${rows.length} of ${beforeCount}`);
  if (rows.length === 0) {
    console.error('[migrate-bodies] no rows match --only filter');
    process.exit(1);
  }
}

// ============================================================
// Step 2: per row — fetch body, compose workbook, upload, update D1
// ============================================================
const tmpDir = mkdtempSync(join(tmpdir(), 'migrate-bodies-'));
let success = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const { slug, locale, body_r2_key, homework_md } = row;
  const tag = `${slug}.${locale}`;

  if (!body_r2_key) {
    console.log(`  ${tag}: SKIP (no body_r2_key)`);
    skipped++;
    continue;
  }
  if (locale !== 'en' && locale !== 'ru') {
    console.log(`  ${tag}: SKIP (unknown locale)`);
    skipped++;
    continue;
  }

  const newWorkbookKey = `modules/${slug}/workbook.${locale}.md`;
  const newPresentationKey = `modules/${slug}/presentation.${locale}.md`;

  if (isDryRun) {
    const hwLen = homework_md ? homework_md.length : 0;
    console.log(`  ${tag}: [dry-run] ${body_r2_key} → ${newWorkbookKey} (concat ${hwLen} chars homework_md)`);
    console.log(`  ${tag}: [dry-run]   + set presentation_r2_key=${newPresentationKey}`);
    success++;
    continue;
  }

  // Step 2a: R2 GET old body
  const tmpFile = join(tmpDir, `body-${slug}-${locale}.md`);
  const r2Get = spawnSync('corepack', [
    'pnpm', 'exec', 'wrangler', 'r2', 'object', 'get',
    `moirai-content/${body_r2_key}`,
    '--file', tmpFile,
    isLocal ? '--local' : '--remote',
  ], { cwd: repoRoot, encoding: 'utf8' });

  if (r2Get.status !== 0) {
    console.error(`  ${tag}: R2 GET failed: ${r2Get.stderr}`);
    failed++;
    continue;
  }

  let oldBody;
  try {
    oldBody = readFileSync(tmpFile, 'utf8');
  } catch (err) {
    console.error(`  ${tag}: read tmp file failed:`, err);
    failed++;
    continue;
  }

  // Step 2b: compose new workbook
  let newContent = oldBody.trimEnd();
  if (homework_md && homework_md.trim()) {
    const title = HOMEWORK_TITLE[locale];
    newContent += `\n\n## ${title}\n\n${homework_md.trim()}\n`;
  } else {
    newContent += '\n';
  }

  // Step 2c: R2 PUT new workbook key
  const newTmpFile = join(tmpDir, `workbook-${slug}-${locale}.md`);
  writeFileSync(newTmpFile, newContent, 'utf8');

  const r2Put = spawnSync('corepack', [
    'pnpm', 'exec', 'wrangler', 'r2', 'object', 'put',
    `moirai-content/${newWorkbookKey}`,
    '--file', newTmpFile,
    '--content-type', 'text/markdown',
    isLocal ? '--local' : '--remote',
  ], { cwd: repoRoot, encoding: 'utf8' });

  if (r2Put.status !== 0) {
    console.error(`  ${tag}: R2 PUT failed: ${r2Put.stderr}`);
    failed++;
    continue;
  }

  // Step 2d: UPDATE D1
  const d1Update = spawnSync('corepack', [
    'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
    isLocal ? '--local' : '--remote',
    '--command',
    `UPDATE modules SET workbook_r2_key='${newWorkbookKey}', presentation_r2_key='${newPresentationKey}' WHERE slug='${slug}' AND locale='${locale}'`,
  ], { cwd: repoRoot, encoding: 'utf8' });

  if (d1Update.status !== 0) {
    console.error(`  ${tag}: D1 UPDATE failed: ${d1Update.stderr}`);
    failed++;
    continue;
  }

  console.log(`  ${tag}: ok → workbook ${newContent.length} chars, presentation pointer set`);
  success++;

  // Cleanup tmp files
  try {
    unlinkSync(tmpFile);
    unlinkSync(newTmpFile);
  } catch {
    // ignore
  }
}

console.log(`[migrate-bodies] done: ${success} success, ${skipped} skipped, ${failed} failed`);
if (failed > 0) process.exit(1);
