# Sprint 0 Stage 13 — Per-instructor pages (`/{locale}/instructors/[id]`)

## Context

После Stage 9 в коллекции `instructors` появятся entries для
Владимира Попова и Анастасии Засыпкиной. Stage 12 уже рендерит
`InstructorCard` на главной — но клик никуда не ведёт (карточки
без link сейчас).

Stage 13 создаёт динамический route для per-instructor страницы:
полное bio в long-form (используя light theme из Stage 10),
фильмография, ссылки на программы, где преподают, Schema.org Person.

## Этапы

### 13a — динамический route

`src/pages/[locale]/instructors/[id].astro`:

```astro
---
import { getCollection } from "astro:content";
import Layout from "../../../layouts/public/Layout.astro";
import PersonSchema from "../../../components/schema/PersonSchema.astro";

export const prerender = true;

export async function getStaticPaths() {
  const instructors = await getCollection("instructors");
  return instructors.map((entry) => {
    const [slug, locale] = entry.id.split(".");
    return {
      params: { locale, id: slug },
      props: { entry },
    };
  });
}

const { locale } = Astro.params;
const { entry } = Astro.props;
const { Content } = await entry.render();
---

<Layout locale={locale} seo={entry.data.seo ?? defaultSeo(entry, locale)}>
  <Fragment slot="schema">
    <PersonSchema instructor={entry} locale={locale} />
  </Fragment>

  {/* Hero/cover — тёмный (light-on-dark hero per Design_system §4) */}
  <section class="instructor-hero">
    <div class="center">
      <p class="eyebrow">{entry.data.role}</p>
      <h1 class="h1">{entry.data.name}</h1>
      {entry.data.bio_short && <p class="text-muted">{entry.data.bio_short}</p>}
    </div>
  </section>

  {/* Reading region — light theme (long-form bio, фильмография) */}
  <article class="section center" data-theme="light">
    <div class="prose">
      <Content />
    </div>
  </article>

  {/* Social links → ghost-стиль */}
  {entry.data.social && (
    <section class="section center">
      <h2 class="h2">Links</h2>
      <ul class="cluster cluster--lg">
        {Object.entries(entry.data.social).map(([key, url]) => (
          <li><a class="btn btn--ghost" href={url} target="_blank" rel="noopener">{key}</a></li>
        ))}
      </ul>
    </section>
  )}
</Layout>
```

### 13b — `defaultSeo` helper

В instructor frontmatter `seo` опционален. Если отсутствует —
генерим по умолчанию:

`src/lib/default-seo.ts`:

```ts
export function defaultInstructorSeo(entry: any, locale: "en"|"ru") {
  const tpl = locale === "ru"
    ? { title: (n: string, r: string) => `${n} — ${r} | Moirai`,
        desc: (n: string, r: string) => `${n}, ${r}. Преподаёт в онлайн-программе кинорежиссуры Moirai. Личный фидбэк, реальная практика.` }
    : { title: (n: string, r: string) => `${n} — ${r} | Moirai`,
        desc: (n: string, r: string) => `${n}, ${r}. Teaching at Moirai online filmmaking program. Personal feedback, hands-on practice.` };
  return {
    title: tpl.title(entry.data.name, entry.data.role),
    description: tpl.desc(entry.data.name, entry.data.role),
  };
}
```

### 13c — добавить link с главной

`src/components/public/InstructorCard.astro` — расширить пропом
`href`, который оборачивает name + initial в `<a>`:

```astro
interface Props {
  // ... существующие
  href?: string;
}
const { name, role, body, initial, href } = Astro.props;
---
<article class="instructor-card">
  {href ? <a href={href} class="instructor-card__link" aria-label={name}><span class="instructor-card__initial">...</span></a> : ...}
  <h3 class="instructor-card__name">
    {href ? <a href={href}>{name}</a> : name}
  </h3>
  ...
</article>
```

В `index.astro` (Stage 9 integration):

```astro
<InstructorCard
  ...
  href={`/${typedLocale}/instructors/${id}`}
/>
```

И на programme page (Stage 12) — instructors-секция с теми же
карточками-ссылками.

### 13d — instructor-hero стиль

В `[id].astro` scoped style для `.instructor-hero`:

```css
.instructor-hero {
  padding-block: clamp(120px, 16vw, 200px);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}
.instructor-hero h1 { margin-bottom: var(--space-lg); }
.instructor-hero .eyebrow { margin-bottom: var(--space-md); color: var(--amber); }
```

### 13e — verification

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
# /en/instructors/vladimir-popov
# /ru/instructors/anastasia-zasypkina
```

- Hero отображает name + role
- Long-form bio в light-theme регионе (фон paper, текст ink)
- Nav и footer **остаются тёмными** на этой странице (Design_system
  §4 invariant)
- PersonSchema валидируется в Google Rich Results

## Verification

- [ ] 4 страницы (2 instructors × 2 locales) отдают 200
- [ ] `data-theme="light"` применяется только к `<article>`, nav/footer
      остаются dark
- [ ] InstructorCard на главной и programme page имеет рабочий
      `href` на per-instructor route
- [ ] Schema.org PersonSchema валиден
- [ ] sitemap содержит 4 новых URL
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные

## Out of scope

- **Фильмография как структурированные данные** (отдельная коллекция
  `works` с связью через `directed_by`) — отдельная задача Sprint 1+.
  Сейчас фильмография — часть MDX body.
- **Реальные фото инструкторов** — нужен R2 + image pipeline. До
  тех пор photo_r2_key — placeholder, на странице фото не рендерим.
- **VideoObject markup для showreel** — отдельный stage.
- **Контактная форма "связаться с преподавателем"** — отдельно
  если будет user-need.

## Critical files

- `src/pages/[locale]/instructors/[id].astro` (новый)
- `src/lib/default-seo.ts` (новый)
- `src/components/public/InstructorCard.astro` (расширить пропом `href`)
- `src/pages/[locale]/index.astro` (передать href в InstructorCard)
- `src/pages/[locale]/[programme].astro` (тот же patten, Stage 12)

## Dependencies

- **Stage 9** — instructors коллекция с entries
- **Stage 10** — light theme tokens (для `data-theme="light"` региона)
- **Stage 6** — PersonSchema компонент
- **Stage 12** — programme pages (для consistency InstructorCard
  использования)

## Reference

- `docs/Design_system.md` §4 — light theme application paттерн
- `src/content/config.ts` — instructors zod schema
- Astro Content Collections — `entry.render()` для MDX body
