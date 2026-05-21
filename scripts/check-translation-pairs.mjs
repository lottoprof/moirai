#!/usr/bin/env node
/*
 * scripts/check-translation-pairs.mjs (Stage 7c — translation-pair validator)
 *
 * Проверяет invariant: для каждого base-id в коллекции должны быть
 * файлы во всех активных локалях (`<id>.en.mdx` + `<id>.ru.mdx`), либо
 * явный `monolingual: true` в frontmatter (одного локального файла достаточно).
 *
 * Запуск:
 *   node scripts/check-translation-pairs.mjs
 *
 * Должен быть pre-commit hook + CI gate — иначе можно зашипить
 * /ru/<id> → 404 в проде.
 *
 * Exit 0 = ok; exit 1 = есть missing pairs.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['en', 'ru'];
const COLLECTIONS = [
  'programmes',
  'instructors',
  'segments',
  'pages',
  'journal',
  'works',
  'legal',
  'announcements',
];

let failed = 0;
let okPairs = 0;
let monoCount = 0;

for (const coll of COLLECTIONS) {
  const dir = `src/content/${coll}`;
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => /\.mdx?$/.test(f));
  } catch (err) {
    // Дир может не существовать — это норма для незаполненных коллекций
    if (err.code === 'ENOENT') continue;
    throw err;
  }
  if (files.length === 0) continue;

  // Группируем по base-id
  const byBase = new Map(); // base → Set<locale>
  const monolingual = new Set();

  for (const f of files) {
    const m = f.match(/^(.+)\.(en|ru)\.mdx?$/);
    if (!m) {
      console.warn(`  WARN ${coll}/${f}: filename не соответствует <id>.<locale>.mdx pattern`);
      continue;
    }
    const [, base, locale] = m;
    if (!byBase.has(base)) byBase.set(base, new Set());
    byBase.get(base).add(locale);

    // Парсим frontmatter для monolingual flag
    const content = readFileSync(join(dir, f), 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      if (/^monolingual:\s*true\b/m.test(fm)) {
        monolingual.add(base);
      }
    }
  }

  for (const [base, locales] of byBase) {
    if (monolingual.has(base)) {
      monoCount++;
      continue;
    }
    const missing = LOCALES.filter((l) => !locales.has(l));
    if (missing.length > 0) {
      console.error(
        `  ✘ ${coll}/${base}: missing [${missing.join(', ')}] — add file(s) or set monolingual: true`,
      );
      failed++;
    } else {
      okPairs++;
    }
  }
}

console.log('');
console.log(`Result: ${okPairs} OK pairs, ${monoCount} monolingual, ${failed} missing pairs`);

if (failed > 0) {
  console.error('\n✘ translation-pair check FAILED');
  process.exit(1);
}
console.log('✓ translation pairs ok');
