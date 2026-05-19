#!/usr/bin/env node
/*
 * scripts/seed-modules.mjs
 *
 * One-time seed для каталога модулей. Читает scripts/seed/modules-*.json
 * и применяет к D1 modules table через wrangler d1 execute.
 *
 * Каждый модуль создаёт 2 row (ru + en). 24 модуля × 2 = 48 rows.
 *
 * Idempotent: сначала DELETE WHERE slug LIKE 'beg-%' OR slug LIKE 'int-%',
 * потом INSERT. Можно перезапускать после правок JSON без accumulation.
 *
 * R2: пока R2 не включён в CF account, body НЕ загружается. body_r2_key
 * ставится как planned path `modules/{slug}.{locale}.md`. Stub markdown
 * генерится в /tmp/stubs/ для будущей загрузки в R2.
 *
 * Usage:
 *   pnpm seed:modules                 # prod
 *   pnpm seed:modules -- --local      # local D1
 *   pnpm seed:modules -- --dry-run    # покажет SQL, не применит
 *
 * Source: docs/methodist-modules-guide.md, decisions_archive.md 2026-05-19
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isDryRun = args.includes('--dry-run');

const seedFile = resolve(repoRoot, 'scripts/seed/modules-2026-05-19.json');
const stubsDir = '/tmp/moirai-module-stubs';

const data = JSON.parse(readFileSync(seedFile, 'utf8'));
console.log(`[seed] ${data.modules.length} модулей из ${seedFile}`);
console.log(`[seed] target: ${isLocal ? 'LOCAL D1' : 'PROD D1 (remote)'}${isDryRun ? ' (DRY RUN)' : ''}`);

// Escape SQL string literal
function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Generate stub markdown body
function stubMarkdown(mod, locale) {
  const m = mod[locale];
  const objLines = m.objectives.map(o => `- ${o}`).join('\n');
  const conceptsLine = m.concepts.join(' · ');
  const hwBlock = mod.has_homework
    ? `\n\n## ${locale === 'ru' ? 'Домашняя работа' : 'Homework'}\n\n${m.homework}`
    : '';

  return `# ${m.title}

> ${locale === 'ru'
    ? '⚠️ Полный материал модуля в разработке. Здесь будет student book от методиста.'
    : '⚠️ Full module material is in preparation. The methodist will provide the student book here.'}

## ${locale === 'ru' ? 'О модуле' : 'About'}

${m.summary}

## ${locale === 'ru' ? 'Цели модуля' : 'Objectives'}

${objLines}

## ${locale === 'ru' ? 'Ключевые понятия' : 'Key concepts'}

${conceptsLine}${hwBlock}

---

_${locale === 'ru'
    ? 'Полный материал появится после загрузки методистом через external repo (Sprint 2).'
    : 'Full material will appear after methodist upload via external repo (Sprint 2).'}_
`;
}

// Build statements: DELETE old, INSERT new
const now = Math.floor(Date.now() / 1000);
const statements = [];

// 1. Cleanup existing seeded rows (idempotent)
statements.push(`DELETE FROM modules WHERE slug LIKE 'beg-%' OR slug LIKE 'int-%';`);

// 2. Prepare stubs dir
if (!isDryRun) {
  mkdirSync(stubsDir, { recursive: true });
}

let stubCount = 0;

for (const mod of data.modules) {
  for (const locale of ['ru', 'en']) {
    const m = mod[locale];
    const bodyKey = `modules/${mod.slug}.${locale}.md`;
    const objJson = JSON.stringify(m.objectives);
    const conceptsJson = JSON.stringify(m.concepts);
    const reqJson = JSON.stringify(mod.requires_modules);

    statements.push(`INSERT INTO modules (
  slug, locale, title, track, status,
  has_video, has_external_video, has_homework, has_text,
  default_lessons, requires_modules_json,
  suggested_programme, suggested_order,
  summary, objectives_json, concepts_json, homework_md,
  body_r2_key, video_r2_key, source_commit,
  created_at, published_at, archived_at, synced_at
) VALUES (
  ${sqlStr(mod.slug)}, ${sqlStr(locale)}, ${sqlStr(m.title)}, ${sqlStr(mod.track)}, 'published',
  ${mod.has_video}, ${mod.has_external_video}, ${mod.has_homework}, ${mod.has_text},
  ${mod.lessons}, ${sqlStr(reqJson)},
  ${sqlStr(mod.suggested_programme)}, ${mod.suggested_order},
  ${sqlStr(m.summary)}, ${sqlStr(objJson)}, ${sqlStr(conceptsJson)}, ${sqlStr(m.homework || null)},
  ${sqlStr(bodyKey)}, NULL, NULL,
  ${now}, ${now}, NULL, ${now}
);`);

    // Stub markdown
    if (!isDryRun) {
      const stubPath = `${stubsDir}/${mod.slug}.${locale}.md`;
      writeFileSync(stubPath, stubMarkdown(mod, locale));
      stubCount++;
    }
  }
}

const sql = statements.join('\n');
const sqlFile = '/tmp/moirai-seed-modules.sql';
writeFileSync(sqlFile, sql);

console.log(`[seed] SQL: ${statements.length} statements (${sql.length} bytes) → ${sqlFile}`);
console.log(`[seed] stubs: ${stubCount} markdown files → ${stubsDir}/`);

if (isDryRun) {
  console.log('[seed] DRY RUN — exiting without apply');
  console.log('\nfirst statement preview:');
  console.log(statements[1].slice(0, 500) + '...');
  process.exit(0);
}

// Apply via wrangler
const wranglerArgs = [
  'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--file', sqlFile,
];

console.log(`[seed] applying: corepack pnpm ${wranglerArgs.join(' ')}`);
const result = spawnSync('corepack', ['pnpm', ...wranglerArgs], {
  stdio: 'inherit',
  cwd: repoRoot,
});

if (result.status !== 0) {
  console.error(`[seed] FAILED with exit code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('\n[seed] ✓ done');
console.log(`[seed] verify: corepack pnpm exec wrangler d1 execute moirai-prod ${isLocal ? '--local' : '--remote'} --command "SELECT COUNT(*), locale FROM modules GROUP BY locale;"`);
