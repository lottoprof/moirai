#!/usr/bin/env node
/*
 * scripts/generate-student-book-drafts.mjs
 *
 * Stage 22d — генератор stub student_book markdown'ов для всех 48
 * (slug, locale) из scripts/seed/modules-2026-05-19.json.
 *
 * Каждый файл — placeholder с frontmatter (slug, locale, title, status,
 * generated_at) + секции для методиста: Цели · Понятия · Опорный материал ·
 * Видео · Домашнее задание. Текстовые блоки методист заполняет в git и
 * commit'ит, потом `pnpm drafts:upload` синхронит в R2.
 *
 * Idempotent: по умолчанию пропускает existing files; с `--force`
 * перезаписывает (полезно когда модули обновились в seed JSON).
 *
 * Usage:
 *   node scripts/generate-student-book-drafts.mjs           # генерит missing
 *   node scripts/generate-student-book-drafts.mjs --force   # перезаписывает все
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isForce = args.includes('--force');

const seedFile = resolve(repoRoot, 'scripts/seed/modules-2026-05-19.json');
const outDir = resolve(repoRoot, 'scripts/seed/student-book-drafts');

mkdirSync(outDir, { recursive: true });

const data = JSON.parse(readFileSync(seedFile, 'utf8'));
const modules = data.modules;

const today = new Date().toISOString().split('T')[0];

function renderDraft(mod, locale) {
  const meta = mod[locale];
  if (!meta) return null;

  const objectives = meta.objectives ?? [];
  const concepts = meta.concepts ?? [];
  const homework = meta.homework ?? '';

  const h = locale === 'ru'
    ? {
        draftBanner: 'Черновик. Заполняется методистом. После правки — pnpm drafts:upload.',
        objectives: '## Цели модуля',
        concepts: '## Понятия',
        reference: '## Опорный материал',
        referenceTodo: 'TODO: основной текст лекции. Поддерживается markdown, ссылки на YouTube, изображения, Mermaid-диаграммы (формат фиксируется отдельно).',
        video: '## Видео',
        videoTodo: 'TODO: ссылка на запись лекции / YouTube (если has_video=1 или has_external_video=1).',
        homework: '## Домашнее задание',
        homeworkTodo: 'TODO: формулировка домашнего задания.',
      }
    : {
        draftBanner: 'Draft. To be filled in by the methodist. After editing — pnpm drafts:upload.',
        objectives: '## Module objectives',
        concepts: '## Concepts',
        reference: '## Reference material',
        referenceTodo: 'TODO: main lecture text. Supports markdown, YouTube links, images, Mermaid diagrams (format to be fixed separately).',
        video: '## Video',
        videoTodo: 'TODO: link to lecture recording / YouTube (if has_video=1 or has_external_video=1).',
        homework: '## Homework',
        homeworkTodo: 'TODO: homework brief.',
      };

  const objectivesBlock = objectives.length > 0
    ? objectives.map((o) => `- ${o}`).join('\n')
    : '- (none yet)';

  const conceptsBlock = concepts.length > 0
    ? concepts.join(' · ')
    : '(none yet)';

  return `---
slug: ${mod.slug}
locale: ${locale}
title: "${meta.title.replace(/"/g, '\\"')}"
status: draft
generated_at: ${today}
---

> **${h.draftBanner}**

${h.objectives}

${objectivesBlock}

${h.concepts}

${conceptsBlock}

${h.reference}

<!-- ${h.referenceTodo} -->

${h.video}

<!-- ${h.videoTodo} -->

${h.homework}

${homework || `<!-- ${h.homeworkTodo} -->`}
`;
}

let generated = 0;
let skipped = 0;

for (const mod of modules) {
  for (const locale of ['en', 'ru']) {
    const filename = `${mod.slug}.${locale}.md`;
    const filePath = join(outDir, filename);

    if (existsSync(filePath) && !isForce) {
      skipped++;
      continue;
    }

    const content = renderDraft(mod, locale);
    if (!content) {
      console.warn(`[gen] skip ${mod.slug}.${locale}: no ${locale} metadata`);
      continue;
    }
    writeFileSync(filePath, content);
    generated++;
  }
}

console.log(`[gen] generated ${generated} files, skipped ${skipped} (existing)`);
console.log(`[gen] target: ${outDir}`);
console.log(`[gen] next: pnpm drafts:upload`);
