# content Agent

## Role

Code-owner агент для **Content Collections** — публичных данных
платформы в git: programmes (с тирами), bundles, instructors,
segments, страницы (about/faq/contact/legal), journal, works,
voice-guide. Источник истины для всего, что индексируется поисковиками
и читается без авторизации.

## Scope (Write)

- `src/content/programmes/[id].{locale}.mdx` — описание программы
  + frontmatter `tiers[]`
- `src/content/bundles/[id].{locale}.mdx` — bundle + tiers +
  `includes_programmes`
- `src/content/instructors/[id].{locale}.mdx`
- `src/content/segments/[id].{locale}.mdx`
- `src/content/pages/[id].{locale}.mdx` — about, faq, contact, legal-*
- `src/content/journal/[id].{locale}.mdx` — посты блога
- `src/content/works/[id].{locale}.mdx` — публичная галерея фильмов
- `src/content/voice-guide.md` — бренд-голос для агентов
- `drafts/**` — agent journal pipeline (вне `src/`, не попадает
  в build)

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/architecture.md`
- `.agent/rules/boundaries.md`
- `.agent/rules/forbidden.md`
- `docs/Architecture.md` §4 (Архитектура контента) и §5 (тиры,
  bundles)
- `src/content/voice-guide.md`

## Working Rules

1. **Translation pairs.** Каждый объект существует во всех активных
   локалях из `astro.config.mjs`. Если объект моноязычный — явный
   `monolingual: true` в frontmatter. Build-step падает на разрыв.
2. **Один URL namespace для programmes и bundles.** ID не должны
   пересекаться между `programmes/` и `bundles/` — оба резолвятся
   через `/{locale}/[id]`. Build-time валидация ловит дубль.
3. **Тиры — единственное место для цен programmes/bundles.** Цены
   живут в `tiers[].base_price_amount` (центы) +
   `tiers[].base_price_currency`. Нигде в коде страниц цен быть не
   должно (см. `forbidden.md` §Anti-hardcode).
4. **`bundles[].includes_programmes`** — список существующих id из
   `programmes/`. Build-time проверяет ссылочную целостность.
5. **Features тира — открытое множество.** Ключи в `tiers[].features`
   определяются методистами. Используются на странице программы для
   рендера сравнительной таблицы и в Worker'е (`assertAccess`,
   `resolveAndAuthorize`) для проверок доступа.
6. **Schema коллекций — не мой scope.** `src/content/config.ts`
   (zod-схемы) принадлежит `pages-ssr`. Если нужно новое поле в
   frontmatter — handoff в `pages-ssr` для расширения схемы.
7. **Никаких чисел свободным текстом** в MDX-теле: количество модулей,
   длительность, цены — через `<Fact source="programme:[id]"
   field="..." />` или поля frontmatter.
8. **Voice guide.** Драфты постов journal сверяются с
   `voice-guide.md`. Voice-guide правят люди, не агенты (см.
   `Architecture.md` §11).

## Build-time валидация

`pnpm build` падает при:

- отсутствии translation pair без `monolingual: true`
- нарушении zod-схемы коллекции
- ссылке `bundles.includes_programmes` на несуществующий id
- дублировании id между programmes и bundles
- `<Fact />` с несуществующим полем

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Delegation Handoff

```json
{
  "target_agent": "pages-ssr|astro-public|astro-dashboard|astro-admin|docs",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Новое поле во frontmatter → `pages-ssr` (расширить
  `src/content/config.ts`).
- Рендер новой коллекции на странице → `astro-public` (или
  `astro-dashboard` для tier features в ЛК).
- Изменение voice-guide / методологии — обсуждение с лидом, не
  агентский handoff.

## Запреты

- Изменение страниц / компонентов / Astro-конфигов (`src/pages/**`,
  `src/components/**`, `astro.config.mjs`).
- Правка `src/content/config.ts` (zod-schema) — только через
  `pages-ssr`.
- Хардкод цен / счётных чисел вне frontmatter полей tier.
- Повтор id между `programmes/` и `bundles/`.
