#!/usr/bin/env node
/*
 * scripts/upload-module-content.mjs
 *
 * Заливает scripts/seed/module-content/{slug}/(workbook|presentation).{locale}.md
 * в R2 bucket `moirai-content` по путям:
 *   modules/{slug}/workbook.{locale}.md
 *   modules/{slug}/presentation.{locale}.md
 *
 * После заливки — UPDATE modules table в D1:
 *   workbook_r2_key     = 'modules/{slug}/workbook.{locale}.md'
 *   presentation_r2_key = 'modules/{slug}/presentation.{locale}.md'
 *
 * Idempotent: R2 PUT overwrites, D1 UPDATE заменяет.
 *
 * Usage:
 *   node scripts/upload-module-content.mjs --remote                  # production
 *   node scripts/upload-module-content.mjs --remote --dry-run        # show plan
 *   node scripts/upload-module-content.mjs --remote --only=int-04-actor-direction
 */

import { readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const contentRoot = resolve(repoRoot, 'scripts/seed/module-content');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');
const isDryRun = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : null;

if (!isLocal && !isRemote) {
  console.error('[upload-content] specify --local or --remote');
  process.exit(1);
}

console.log(`[upload-content] mode: ${isLocal ? 'local' : 'remote'}${isDryRun ? ' (dry-run)' : ''}${only ? ` only=${only}` : ''}`);

// ============================================================
// 1. Discover files
// ============================================================
const slugDirs = readdirSync(contentRoot)
  .filter((name) => {
    if (only && name !== only) return false;
    const p = join(contentRoot, name);
    return statSync(p).isDirectory();
  });

console.log(`[upload-content] discovered ${slugDirs.length} slug(s)`);

// File list with (slug, kind, locale, localPath, r2Key)
const files = [];
for (const slug of slugDirs) {
  const dir = join(contentRoot, slug);
  for (const file of readdirSync(dir)) {
    const m = /^(workbook|presentation)\.(en|ru)\.md$/.exec(file);
    if (!m) continue;
    const [, kind, locale] = m;
    files.push({
      slug,
      kind,
      locale,
      localPath: join(dir, file),
      r2Key: `modules/${slug}/${kind}.${locale}.md`,
    });
  }
}

console.log(`[upload-content] ${files.length} files to upload`);

// ============================================================
// 2. R2 PUT each file
// ============================================================
for (const f of files) {
  const cmd = [
    'pnpm', 'exec', 'wrangler', 'r2', 'object', 'put',
    `moirai-content/${f.r2Key}`,
    `--file=${f.localPath}`,
    isLocal ? '--local' : '--remote',
    '--content-type', 'text/markdown; charset=utf-8',
  ];
  if (isDryRun) {
    console.log(`  [dry] PUT ${f.r2Key}`);
    continue;
  }
  process.stdout.write(`  PUT ${f.r2Key} ... `);
  const res = spawnSync('corepack', cmd, { cwd: repoRoot, encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`FAIL\n${res.stderr}`);
    process.exit(1);
  }
  process.stdout.write('ok\n');
}

// ============================================================
// 3. D1 UPDATE workbook_r2_key + presentation_r2_key
// ============================================================
// Group by (slug, locale) — one UPDATE per row covering both keys
const rows = new Map(); // key: `${slug}.${locale}` → { workbook?: r2Key, presentation?: r2Key }
for (const f of files) {
  const k = `${f.slug}.${f.locale}`;
  if (!rows.has(k)) rows.set(k, { slug: f.slug, locale: f.locale });
  rows.get(k)[f.kind] = f.r2Key;
}

const now = Math.floor(Date.now() / 1000);
const updates = [];
for (const r of rows.values()) {
  const sets = [];
  if (r.workbook)     sets.push(`workbook_r2_key = '${r.workbook}'`);
  if (r.presentation) sets.push(`presentation_r2_key = '${r.presentation}'`);
  sets.push(`synced_at = ${now}`);
  updates.push(
    `UPDATE modules SET ${sets.join(', ')} WHERE slug = '${r.slug}' AND locale = '${r.locale}';`,
  );
}

console.log(`[upload-content] D1 UPDATEs to apply: ${updates.length}`);
if (isDryRun) {
  for (const sql of updates) console.log(`  [dry] ${sql}`);
  process.exit(0);
}

const sqlBatch = updates.join('\n');
const sqlRes = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--command', sqlBatch,
], { cwd: repoRoot, encoding: 'utf8' });

if (sqlRes.status !== 0) {
  console.error(`[upload-content] D1 UPDATE failed:\n${sqlRes.stderr}`);
  process.exit(1);
}
console.log('[upload-content] D1 UPDATE: ok');
console.log('[upload-content] done');
