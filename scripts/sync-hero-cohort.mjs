#!/usr/bin/env node
/*
 * scripts/sync-hero-cohort.mjs
 *
 * SSG-sync ближайшей когорты для hero fine-print на home. Читает D1
 * `moirai-prod`, находит самую раннюю open cohort с start_date > now,
 * пишет `src/generated/hero-cohort.json` который импортится в Hero.astro.
 *
 * Idempotent + safe: если нет upcoming cohorts, файл записывается
 * с `null` — Hero.astro не рендерит fine-print.
 *
 * Usage:
 *   node scripts/sync-hero-cohort.mjs           # remote prod D1
 *   node scripts/sync-hero-cohort.mjs --local   # local D1
 *
 * Автозапуск: `prerelease` npm hook (перед каждым `pnpm release`).
 *
 * Спека: заменяет manual edit в home.{en,ru}.mdx sections.hero.cohort_urgency.
 * ROADMAP Sprint 2 — DONE 2026-07-03.
 */

import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const outFile = resolve(repoRoot, 'src/generated/hero-cohort.json');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');

console.log(`[sync-hero-cohort] target: ${isLocal ? 'LOCAL D1' : 'PROD D1 (remote)'}`);

// Ищем самую раннюю open cohort со стартом в будущем.
// slot.max_students даёт capacity ("10 spots"). Берём min(cohorts.start_date).
const SQL = `
  SELECT c.start_date, s.max_students, c.programme_id
  FROM cohorts c
  JOIN slots s ON s.id = c.slot_id
  WHERE c.status = 'open'
    AND c.start_date > strftime('%s', 'now')
  ORDER BY c.start_date ASC
  LIMIT 1
`;

const res = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--json',
  '--command', SQL,
], { cwd: repoRoot, encoding: 'utf8' });

if (res.status !== 0) {
  console.error('[sync-hero-cohort] D1 query failed:', res.stderr);
  process.exit(1);
}

let rows;
try {
  const jsonStart = res.stdout.indexOf('[');
  const parsed = JSON.parse(res.stdout.slice(jsonStart));
  rows = parsed[0]?.results ?? [];
} catch (err) {
  console.error('[sync-hero-cohort] parse failed:', err);
  process.exit(1);
}

let payload;

if (rows.length === 0) {
  console.log('[sync-hero-cohort] no upcoming cohorts — fine-print будет скрыт');
  payload = {
    generated_at: new Date().toISOString(),
    upcoming: null,
  };
} else {
  const row = rows[0];
  const dateMs = row.start_date * 1000;
  const dateEn = new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(dateMs));
  const dateRu = new Intl.DateTimeFormat('ru-RU', {
    month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(dateMs));

  const spots = row.max_students;

  payload = {
    generated_at: new Date().toISOString(),
    upcoming: {
      start_date_unix: row.start_date,
      programme_id: row.programme_id,
      en: `Next cohort: ${dateEn} · ${spots} spots`,
      ru: `Ближайшая когорта: ${dateRu} · ${spots} мест`,
    },
  };
  console.log(`[sync-hero-cohort] next cohort: ${row.programme_id} @ ${dateEn} (${dateRu})`);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`[sync-hero-cohort] wrote ${outFile}`);
