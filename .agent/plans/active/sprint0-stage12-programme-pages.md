# Sprint 0 Stage 12 — Per-programme pages (`/{locale}/[programme]`)

## Context

После Stage 9 в коллекции `programmes` появятся entry'и
`beginner.{en,ru}.mdx` и `intermediate.{en,ru}.mdx` с frontmatter
(title, summary, tiers, features, seo) + long-form MDX body
(детальный curriculum, weekly schedule, FAQ).

На главной `ProgrammeCard` уже ведёт на `/{locale}/beginner` и
`/{locale}/intermediate` — но динамического route нет, пользователь
получает 404. Stage 12 создаёт route и рендерит контент.

## Этапы

### 12a — динамический route

`src/pages/[locale]/[programme].astro`:

```astro
---
import { getCollection } from "astro:content";
import Layout from "../../layouts/public/Layout.astro";
import TierCard from "../../components/public/TierCard.astro";
import InstructorCard from "../../components/public/InstructorCard.astro";
import Faq from "../../components/public/Faq.astro";
import FinalCta from "../../components/public/FinalCta.astro";
import { formatPrice } from "../../lib/format-price";

export const prerender = true;

export async function getStaticPaths() {
  const programmes = await getCollection("programmes");
  return programmes.map((entry) => {
    const [slug, locale] = entry.id.split(".");
    return {
      params: { locale, programme: slug },
      props: { entry },
    };
  });
}

const { locale } = Astro.params;
const { entry } = Astro.props;
const { Content } = await entry.render();
---

<Layout locale={locale} seo={entry.data.seo}>
  <section class="section center">
    <header class="section__head">
      <p class="eyebrow">{entry.data.title}</p>
      <h1 class="h1">{entry.data.title}</h1>
      <p class="text-muted">{entry.data.summary}</p>
    </header>

    <article class="prose">
      <Content />
    </article>
  </section>

  <section class="section section--alt center">
    <header class="section__head">
      <p class="eyebrow">Pricing</p>
      <h2 class="h2">Choose your tier</h2>
    </header>
    <div class="pricing-grid">
      {entry.data.tiers.map((tier, i) => (
        <TierCard
          name={tier.name}
          price={formatPrice(tier.base_price_amount, tier.base_price_currency, locale)}
          features={Object.entries(tier.features)
            .filter(([_, v]) => v !== false)
            .map(([k, v]) => formatFeature(k, v, locale))}
          ctaText={ui.applyToTier(tier.name)}
          ctaHref={`/${locale}/apply?programme=${entry.id}&tier=${tier.id}`}
          featured={i === 1}
        />
      ))}
    </div>
  </section>

  <FinalCta .../>
</Layout>
```

### 12b — `formatFeature` helper

`src/lib/format-feature.ts` — преобразовать ключ из
`tier.features` объекта в человеческую строку per-locale:

```ts
const featureKeyMap = {
  en: {
    lectures_count: (n: number) => `${n} live lectures`,
    assignments_count: (n: number) => `${n} graded assignments`,
    live_qa: () => "Live Q&A sessions",
    personal_review: () => "Personal review of every assignment",
    one_on_one_sessions: (n: number) => `${n} one-on-one sessions`,
    final_film_review: () => "Final film review with both instructors",
    cohort_size_max: (n: number) => `Cohort capped at ${n}`,
    certificate: () => "Certificate of completion",
    community_access: () => "Cohort community access",
  },
  ru: { /* RU strings, same shape */ },
};

export function formatFeature(key: string, value: unknown, locale: "en"|"ru"): string {
  const fn = (featureKeyMap[locale] as any)[key];
  if (!fn) return `${key}: ${String(value)}`;
  return typeof fn === "function" ? fn(value) : String(fn);
}
```

После Stage 7 это переедет в `dict.{locale}.ts` (под секцию `features`).
Сейчас отдельный файл — проще.

### 12c — prose стили

В `utilities.css` добавить `.prose` — стилизация long-form
markdown body:

```css
.prose {
  max-width: 65ch;
  margin-inline: auto;
  font-size: var(--type-body-md);
  line-height: var(--leading-relaxed);
  color: var(--text-muted);
}
.prose h2 {
  font-family: var(--font-display);
  font-size: var(--type-display-sm);
  font-weight: 300;
  margin-top: var(--space-3xl);
  margin-bottom: var(--space-lg);
  color: var(--text);
}
.prose h3 {
  font-size: var(--type-body-lg);
  font-weight: 500;
  margin-top: var(--space-2xl);
  margin-bottom: var(--space-sm);
  color: var(--text);
}
.prose p { margin-bottom: var(--space-lg); }
.prose ul, .prose ol { padding-left: var(--space-xl); margin-bottom: var(--space-lg); }
.prose li { margin-bottom: var(--space-xs); }
.prose strong { color: var(--text); font-weight: 500; }
.prose em { font-style: italic; color: var(--text-accent); }
.prose a { color: var(--amber); border-bottom: 1px solid var(--amber); }
.prose a:hover { color: var(--amber-light); border-bottom-color: var(--amber-light); }
```

### 12d — Schema.org интеграция

В шаблоне:

```astro
<Fragment slot="schema">
  <OrganizationSchema locale={locale} />
  <CourseSchema programme={entry} locale={locale} />
</Fragment>
```

(`CourseSchema` появляется в Stage 6.)

### 12e — sitemap entries

`astro.config.mjs` sitemap-integration соберёт routes автоматически
(prerender = true). Проверить, что
`https://moiraionline.pro/sitemap-0.xml` после деплоя содержит:

```xml
<url><loc>https://moiraionline.pro/en/beginner</loc></url>
<url><loc>https://moiraionline.pro/ru/beginner</loc></url>
<url><loc>https://moiraionline.pro/en/intermediate</loc></url>
<url><loc>https://moiraionline.pro/ru/intermediate</loc></url>
```

### 12f — verification

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
# открыть /en/beginner и /ru/intermediate
```

- Hero отображает title/summary
- Long-form MDX body рендерится в prose-стилях
- TierCard'ы внизу с правильными ценами через `Intl.NumberFormat`
- FinalCta в конце
- Schema.org Course validates на preview deploy

## Verification

- [ ] `/en/beginner`, `/ru/beginner`, `/en/intermediate`,
      `/ru/intermediate` отдают 200
- [ ] Hero/summary/body/tiers рендерятся
- [ ] CTA ссылается на `/{locale}/apply?programme=...&tier=...`
- [ ] sitemap содержит 4 новых URL
- [ ] Schema.org Course schema валиден (Google Rich Results)
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные

## Out of scope

- **Instructor bios на programme page** — отдельная под-секция,
  ждёт Stage 13 (per-instructor pages с anchor links отсюда).
- **Сравнительная таблица между тирами** — отдельная компонентная
  задача, дизайн ждёт.
- **Curriculum детализация trackов** (Directing/Editing/Scriptwriting
  с topics list) — рендерится из MDX body как есть.
- **Promo codes в URL** (`?code=...`) — после Sprint 1+ когда
  появится система промо.

## Critical files

- `src/pages/[locale]/[programme].astro` (новый)
- `src/lib/format-feature.ts` (новый, временно — переедет в i18n dict
  в Stage 7)
- `src/lib/format-price.ts` (создан в Stage 9)
- `src/styles/utilities.css` (добавление `.prose`)

## Dependencies

- **Stage 9** — programmes коллекция с реальными entries
- **Stage 6** (рекомендуется но не блокирует) — CourseSchema
- **Stage 14** (опционально) — `/apply` существует, CTA не 404

## Reference

- Astro 5 `getStaticPaths` docs
- Astro Content Collections — entry.render() для MDX body
- `src/content/config.ts` — programmes zod schema
