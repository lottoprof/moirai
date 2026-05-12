# Sprint 0 Stage 15 — Static placeholder pages (FAQ / Contact / Legal)

## Context

Footer на каждой публичной странице ссылается на 6 endpoints, все
сейчас 404:

- `/{locale}/faq` — расширенная FAQ (на главной показывается только
  топ-8 вопросов из `home.faqs[]`)
- `/{locale}/contact` — контакты (email, соцсети, форма)
- `/{locale}/legal/privacy` — Privacy Policy
- `/{locale}/legal/terms` — Terms of Service
- `/{locale}/works` — галерея работ (отдельный план Stage 16)
- `/{locale}/journal` — журнал/блог (отдельный план Stage 16)

Stage 15 закрывает FAQ + Contact + Legal (4 страницы × 2 локали = 8
routes). Works и Journal — Stage 16.

## Этапы

### 15a — FAQ page

Расширенная FAQ — больше вопросов чем на главной + категоризация
(General / Beginner / Intermediate / Pricing / Technical).

Подход:
- Добавить новую коллекцию `pages` entry `faq.{en,ru}.mdx` с
  `sections.faq.categories[]{title, items[]{q,a}}`
- `src/pages/[locale]/faq.astro` рендерит через расширенный
  `<Faq>` компонент (или цикл по категориям, каждая категория —
  `<Faq>`)
- Schema.org `FAQPage` JSON-LD — переиспользуем `FaqSchema` из
  Stage 6, передавая flatten'нутый список items

### 15b — Contact page

`src/pages/[locale]/contact.astro`:

- Email: `hello@moiraionline.pro` (mailto link)
- Соц.сети из `site-config.ts` (если есть)
- Опционально — короткая форма "General inquiry" с reuse `/api/applications`
  endpoint (type=general_inquiry) — но это требует добавления типа в
  D1 миграции; для Sprint 0 проще оставить mailto-only
- Если есть юридический адрес / реквизиты — добавить в footer-card
  внизу страницы (для compliance Россия 152-ФЗ + EU)

### 15c — Legal pages — Privacy & Terms

`src/pages/[locale]/legal/[doc].astro` — динамический route на
коллекцию `pages` с entries:

- `legal-privacy.{en,ru}.mdx`
- `legal-terms.{en,ru}.mdx`

Frontmatter:

```yaml
---
title: "Privacy Policy"
sections:
  legal:
    last_updated: "2026-05-12"
    body: |
      Multi-paragraph legal text здесь. Markdown OK.
seo:
  title: "Privacy Policy | Moirai"
  description: "How Moirai collects, uses, and protects your personal data."
  noindex: false   # хотим в индекс для compliance видимости
---

Long-form legal text в MDX body — основной контент. Frontmatter
sections.legal.body можно не использовать, MDX body достаточно.
```

Pages rendering:

```astro
---
import { getCollection } from "astro:content";
import Layout from "../../../layouts/public/Layout.astro";

export const prerender = true;

export async function getStaticPaths() {
  const docs = (await getCollection("pages"))
    .filter(e => e.id.startsWith("legal-"));
  return docs.map(entry => {
    const [base, locale] = entry.id.split(".");
    const doc = base.replace(/^legal-/, "");  // "privacy" / "terms"
    return { params: { locale, doc }, props: { entry } };
  });
}
const { entry } = Astro.props;
const { Content } = await entry.render();
---

<Layout locale={Astro.params.locale} seo={entry.data.seo}>
  <article class="section center" data-theme="light">
    <header class="section__head">
      <h1 class="h1">{entry.data.title}</h1>
      {entry.data.sections?.legal?.last_updated && (
        <p class="text-faint">Last updated: {entry.data.sections.legal.last_updated}</p>
      )}
    </header>
    <div class="prose">
      <Content />
    </div>
  </article>
</Layout>
```

`data-theme="light"` (Stage 10) — long-form legal text более
читаемо на светлом фоне. Nav и footer остаются тёмными.

### 15d — контент юр.текстов

**От пользователя:** утверждённые тексты Privacy Policy и Terms
of Service на en+ru. Если нет — placeholder с TODO в body + явно
`noindex: true` в seo пока не утверждены:

```yaml
seo:
  noindex: true
```

```mdx
---
title: "Privacy Policy (DRAFT)"
sections:
  legal:
    last_updated: "2026-05-12"
seo:
  title: "Privacy Policy | Moirai"
  description: "Privacy policy for Moirai online filmmaking program."
  noindex: true
---

# Privacy Policy

> ⚠️ DRAFT — текст не утверждён юристом. Не для публикации.

Placeholder text. Final version pending review.
```

Pre-commit hook anti-hardcode — игнорирует legal/* (по соглашению
с rules/forbidden.md, секцию legal надо добавить в исключения если
hook на это ругнётся).

### 15e — verification

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
```

- `/en/faq`, `/ru/faq` — отдают 200, рендерят расширенную FAQ
- `/en/contact`, `/ru/contact` — отдают 200
- `/en/legal/privacy`, `/ru/legal/privacy` — отдают 200, body в
  light theme
- `/en/legal/terms`, `/ru/legal/terms` — то же
- Footer ссылки → 200 везде (не 404)
- sitemap содержит 8 новых URLs (4 endpoint × 2 locale)
- Schema.org FAQPage валиден на /faq

## Verification

- [ ] 8 routes отдают 200
- [ ] FAQ page рендерит больше вопросов чем главная (или то же если
      контент пока не расширен)
- [ ] Contact page имеет рабочий mailto + социальные ссылки
- [ ] Legal pages — `data-theme="light"` применён к body региону,
      nav/footer dark
- [ ] Если legal — DRAFT, то `noindex: true` в SEO → `<meta
      name="robots" content="noindex">` в head
- [ ] sitemap корректный (DRAFT legal — exclude из sitemap)
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные

## Out of scope

- **Cookie banner** — отказ: если не используем third-party tracking
  (мы не используем), GDPR не требует. При появлении analytics
  (Stage 8h+) — пересмотрим.
- **GDPR data export / deletion request** flow — Sprint 1+ когда
  появятся users.
- **Cookie policy page** — если cookie появятся (analytics, locale
  switcher cookie из Stage 11), добавим. Locale cookie — minimal,
  не PII, не требует banner.
- **Terms acceptance checkbox на форме apply** — добавится после
  Stage 14 формы + утверждённых юр.текстов.
- **Real Contact form** (не mailto) — может перейти в Stage 14
  endpoint с типом `general_inquiry`.

## Critical files

- `src/content/pages/faq.{en,ru}.mdx` (новые, опционально —
  или используем расширенный `home.faqs[]`)
- `src/content/pages/legal-privacy.{en,ru}.mdx` (новые)
- `src/content/pages/legal-terms.{en,ru}.mdx` (новые)
- `src/pages/[locale]/faq.astro` (новый)
- `src/pages/[locale]/contact.astro` (новый)
- `src/pages/[locale]/legal/[doc].astro` (новый)
- `src/lib/site-config.ts` (опц., contact email + socials)

## Dependencies

- **Stage 10** — light theme infrastructure (для legal regions)
- **Stage 6** (опционально) — FaqSchema для /faq page
- **Юр.тексты от пользователя** — без них legal остаётся DRAFT
  с noindex

## Reference

- `src/content/config.ts` — pages коллекция (free-form sections)
- `docs/Design_system.md` §4 — light theme для long-form
- 152-ФЗ (Россия) — обязательные элементы privacy policy
- GDPR Art. 13/14 — обязательные элементы privacy policy в EU
