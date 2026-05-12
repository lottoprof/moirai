# Sprint 0 Stage 7 — Translation-pair validator + i18n dictionary

## Context

Два смежных пробела после Stage 4-6:

1. **UI-строки разбросаны inline в .astro компонентах.** В
   `src/pages/[locale]/index.astro` локальный объект `ui` с
   `explore(title)`, `pendingStage9`, `faqHeading`, `levelLabel(i)`;
   в `Nav.astro` локальный `labels`. Когда таких строк станет 50+
   (per-programme pages, FAQ, apply form, dashboard) — поддержка
   ломается.
2. **Translation-pair invariant не валидируется.** Конвенция:
   каждый base-id в коллекциях имеет файлы во всех активных
   локалях (`<id>.en.mdx` + `<id>.ru.mdx`), либо явный
   `monolingual: true` в frontmatter. Сейчас если разработчик
   создаст `beginner.en.mdx` и забудет `beginner.ru.mdx` — Astro
   build не упадёт, а `/ru/beginner` отдаст 404 в проде.
   Architecture v0.8.1 явно вынесла как build-time check.

## Этапы

### 7a — i18n dictionary scaffold

Новая папка `src/lib/i18n/`:

- `dict.en.ts` / `dict.ru.ts` — параллельные структуры:

  ```ts
  // dict.en.ts
  export const dict = {
    common: {
      apply: "Apply now",
      readMore: "Read more",
      backToHome: "Back to home",
    },
    home: {
      faqHeading: "Common questions",
      levelLabel: (n: number) => `Level ${String(n).padStart(2, "0")}`,
      explore: (title: string) => `Explore ${title}`,
      pendingStage9: "Cards will appear in Stage 9 — data wired from collections.",
    },
    nav: { primary: "Primary", cta: "Apply now →" },
    footer: { copy: (year: number) => `© ${year} Moirai. All rights reserved.` },
  } as const;
  export type Dict = typeof dict;
  ```

  ```ts
  // dict.ru.ts
  import type { Dict } from "./dict.en";
  export const dict: Dict = { /* same shape, RU strings */ };
  ```

- `index.ts`:

  ```ts
  import { dict as en } from "./dict.en";
  import { dict as ru } from "./dict.ru";
  type Locale = "en" | "ru";
  export function getDict(locale: Locale) {
    return locale === "ru" ? ru : en;
  }
  export type { Dict } from "./dict.en";
  ```

**TS-инвариант:** `dict.ru.ts` импортит `Dict` тип из `dict.en.ts`
и аннотирует свой export — TypeScript ругнётся на missing keys /
расхождение signatures. Это translation-pair check на уровне
UI-строк (на уровне content — отдельный валидатор, см. 7c).

### 7b — миграция UI-строк

Пройти по компонентам и страницам, заменить inline-объекты на
вызовы `getDict`:

- `src/pages/[locale]/index.astro` — убрать локальный `ui`,
  заменить:
  ```ts
  import { getDict } from "../../lib/i18n";
  const t = getDict(typedLocale);
  // ...
  <h2>{t.home.faqHeading}</h2>
  <ProgrammeCard linkText={t.home.explore(lvl.title)} ...>
  ```
- `src/components/public/Nav.astro` — `labels` → `t.nav`
- `src/components/public/Footer.astro` — copy/labels → `t.footer`

Это **рефакторинг**, не feature. Поведение на проде не меняется.

### 7c — translation-pair validator

`scripts/check-translation-pairs.ts` (Node TS, запуск через `tsx`):

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const LOCALES = ["en", "ru"];
const COLLECTIONS = [
  "programmes","bundles","instructors","segments",
  "pages","journal","works",
];

let failed = false;
for (const coll of COLLECTIONS) {
  const dir = `src/content/${coll}`;
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => /\.mdx?$/.test(f)); }
  catch { continue; } // empty dir is ok

  const byBase = new Map<string, Set<string>>();
  const monolingual = new Set<string>();

  for (const f of files) {
    const m = f.match(/^(.+)\.(en|ru)\.mdx?$/);
    if (!m) continue;
    const [, base, locale] = m;
    if (!byBase.has(base)) byBase.set(base, new Set());
    byBase.get(base)!.add(locale);
    const fm = matter(readFileSync(join(dir, f), "utf8")).data;
    if (fm.monolingual === true) monolingual.add(base);
  }

  for (const [base, locales] of byBase) {
    if (monolingual.has(base)) continue;
    const missing = LOCALES.filter((l) => !locales.has(l));
    if (missing.length > 0) {
      console.error(
        `✘ ${coll}/${base}: missing [${missing.join(",")}] — add files or set monolingual: true`,
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
else console.log("✓ translation pairs ok");
```

### 7d — wire validator в pipeline

`package.json` scripts:

```json
"check:i18n": "tsx scripts/check-translation-pairs.ts",
"build:check": "pnpm check:i18n && pnpm build"
```

Опциональный pre-commit hook (если husky / simple-git-hooks настроен)
— добавить `pnpm check:i18n` перед коммитом в content. Сейчас pre-commit
не подключён → ограничиваемся `build:check` для CI/local.

### 7e — devDeps

```bash
corepack pnpm add -D tsx gray-matter
```

`tsx` — TS runner без бандла. `gray-matter` — frontmatter parser.

## Verification

После всех этапов:
- [ ] `src/lib/i18n/dict.en.ts` и `dict.ru.ts` структурно
      идентичны — TS-check проходит
- [ ] `pnpm check:i18n` → `✓ translation pairs ok` на текущем
      состоянии (есть только `pages/home.{en,ru}.mdx`)
- [ ] Намеренно удалить `home.ru.mdx` → скрипт падает с понятным
      сообщением → вернуть
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные
- [ ] `index.astro` / `Nav.astro` / `Footer.astro` НЕ содержат
      inline locale-conditional объектов

## Out of scope

- **Полноценный i18n framework** (i18next, vue-i18n) — отказ:
  тяжело для 2 локалей и <100 строк UI; простой объект + TS-проверка
  достаточны.
- **ICU MessageFormat** — пока не нужно, функции `(n) => ...`
  хватает для текущих случаев.
- **Per-content-entry валидация полей** (что `title` в en и ru
  оба не пустые) — задача content-агента / редактуры, не build.
- **Локализация дат / валют / чисел** — `Intl` API при рендере,
  отдельно когда понадобится.

## Critical files

- `src/lib/i18n/dict.en.ts` (новый)
- `src/lib/i18n/dict.ru.ts` (новый)
- `src/lib/i18n/index.ts` (новый)
- `scripts/check-translation-pairs.ts` (новый)
- `package.json` (scripts + devDeps)
- `src/pages/[locale]/index.astro` (рефакторинг UI-строк)
- `src/components/public/Nav.astro` (labels → dict)
- `src/components/public/Footer.astro` (labels → dict)

## Reference

- `docs/Architecture.md` §4 — translation-pair конвенция
- `src/content/config.ts` — `monolingual` поле на каждой схеме
- TC39 `Intl` docs — для будущей localization дат/чисел
