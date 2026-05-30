# Methodist Guide — Студенческие работы (/works)

> Инструкция для методиста по добавлению студенческих фильмов на
> публичную галерею `/{locale}/works`.

См. также:
- `works-and-journal-strategy.md` — зачем нужны /works (стратегическая
  роль в воронке)
- `methodist-modules-guide.md` — аналогичный guide для модулей программы

---

## 1. Где живут работы

Контент — в Content Collection как mdx-файлы:

```
src/content/works/
  ├── <slug>.en.mdx          ← per-work, per-locale, обязательно en+ru пара
  └── <slug>.ru.mdx
```

**Видео** — на **YouTube** (не R2). На странице — embed (lite-load, не
автоплей). Storage cost = 0.

**Thumbnail** — auto от YouTube CDN
(`https://img.youtube.com/vi/<youtube_id>/maxresdefault.jpg`). Custom
override опционален через R2 (Sprint 2+).

---

## 2. Как добавить новую работу — 5 шагов

### Шаг 1. Загрузить видео на YouTube

Канал Moirai на YouTube. Видимость:
- **Public** — попадает в YouTube search + наш Schema.org VideoObject
  (хорошо для SEO)
- **Unlisted** — не в YouTube search, но открыт по ссылке (тоже работает,
  меньше discoverability)
- **Private** — НЕ работает (embed недоступен для не-залогиненных).

**Рекомендация:** Public — максимум discoverability через YouTube + наш
сайт сразу. Unlisted если по какой-то причине не нужно в YT search.

После загрузки взять **video ID** из URL.

`https://www.youtube.com/watch?v=`**`dQw4w9WgXcQ`** — 11 символов
после `v=`. Это `youtube_id` для frontmatter.

### Шаг 2. Создать mdx-файлы (en + ru)

Slug — короткий kebab-case английскими буквами:

```
src/content/works/student-name-film-title.en.mdx
src/content/works/student-name-film-title.ru.mdx
```

Минимальный пример (`student-film-01.en.mdx`):

```yaml
---
title: "The Quiet Room"
slug: "the-quiet-room"
year: 2026
director: "Alex Morgan"
filmmakers:
  - { role: "DP", name: "Jordan Lee" }
  - { role: "Editor", name: "Sam Chen" }
youtube_id: "dQw4w9WgXcQ"
runtime_seconds: 263
programme_id: "beginner"
seo:
  title: "The Quiet Room — short film by Alex Morgan | Moirai"
  description: "A 4-minute short about silence, made by Alex Morgan after Moirai's Beginner programme. Direction, editing, and screenwriting by the student."
---

A teenager spends one night in a soundless room — and finds out what
their thoughts actually sound like.

Made as the final project of the Moirai Beginner cohort, Spring 2026.
Shot on iPhone 14, edited in DaVinci Resolve.
```

### Шаг 3. Frontmatter — обязательные поля

| Поле | Тип | Описание |
|---|---|---|
| `title` | string | Название фильма |
| `slug` | string | URL-slug (kebab-case, en chars) |
| `year` | int | Год выпуска (1900-2100) |
| `director` | string | Имя студента-режиссёра |
| `youtube_id` | string (11 chars) | ID видео на YouTube |
| `seo.title` | string (10-70 chars) | `<title>` для SEO |
| `seo.description` | string (50-180 chars) | meta description |

### Frontmatter — опциональные поля

| Поле | Тип | Описание |
|---|---|---|
| `filmmakers` | array | Список съёмочной группы: `[{role, name}]` |
| `runtime_seconds` | int | Длительность в секундах (для отображения "4 min 23 sec" и Schema.org) |
| `programme_id` | string | slug программы — линк "Made after Beginner →" под видео |
| `thumbnail_override` | string | R2 key если нужен кастомный poster вместо YouTube auto |
| `monolingual` | bool | true если только на одной локали (без пары) |

### Шаг 4. Body (markdown) — synopsis

Под frontmatter — markdown body с synopsis на 1-2 абзаца.

Voice-guide (`src/content/voice-guide.md`):
- Concrete, не abstract
- No fluff
- Editorial tone

**Что писать:**
- Что про фильм (1 предложение setup + 1 хук)
- Опционально: контекст (когорта, оборудование, инсайт от студента)

**Что НЕ писать:**
- Маркетинговые штампы ("inspiring journey", "creative voyage")
- Длинные пересказы сюжета (let video do that)

### Шаг 5. Commit + push

```bash
git add src/content/works/<slug>.en.mdx src/content/works/<slug>.ru.mdx
git commit -m "works: <slug> — <director> (<year>)"
pnpm run release   # deploy на production
```

После деплоя:
- Работа появляется на `/{locale}/works` (сортировка по году desc)
- `/{locale}/works/<slug>` — detail-страница с embed
- Schema.org VideoObject индексируется Google Video Search

---

## 3. Билингвальность (RU + EN)

Каждая работа должна существовать на **обеих локалях** (en + ru), если
не помечена `monolingual: true`.

**Что переводится:**
- `title` (если у фильма английское оригинальное название — оставляем
  то же на обеих локалях)
- `seo.title`, `seo.description`
- Body synopsis

**Что НЕ переводится:**
- `slug` — тот же на обеих локалях
- `youtube_id`, `year`, `runtime_seconds`, `programme_id`
- `director`, `filmmakers[].name` — реальные имена

Translation pairs валидируются через `pnpm check:translations`.

### Monolingual exception

Если работа только на одной локали (например, фильм только с
английскими титрами и студент не подаёт RU-описание) — добавить
`monolingual: true` во frontmatter существующего файла и не создавать
парный. Валидатор пропустит.

---

## 4. Thumbnail — auto vs override

### Auto (default)

Без действий — YouTube CDN отдаёт maxresdefault thumbnail:
`https://img.youtube.com/vi/<id>/maxresdefault.jpg`

Это **default poster** YouTube'а (первый кадр или назначенный
поднявшим). Достаточно для большинства работ.

### Override (опционально)

Если нужен **другой** poster (например festival poster, специальный
кадр):

1. Загрузить картинку в R2 bucket `media.moiraionline.pro`:
   `works/<slug>-poster.jpg`
2. Добавить frontmatter:
   ```yaml
   thumbnail_override: "works/the-quiet-room-poster.jpg"
   ```
3. Frontend подхватит `https://media.moiraionline.pro/<override>` вместо
   YouTube auto.

R2 upload — отдельная процедура (см. `.agent/skills/wrangler/SKILL.md`
секцию R2). Sprint 2+ — будет admin UI для загрузки.

---

## 5. Video player на /works/<slug>

**Lite-load embed**:
- Pre-click: thumbnail + play button (только image, без iframe)
- Click → JS заменяет на `<iframe>` к `youtube-nocookie.com/embed/<id>`
- Lighthouse-friendly (без heavy YouTube SDK до взаимодействия)
- GDPR-friendly (нет cookies до play)

Player настроен на `autoplay=1&rel=0`:
- Видео запускается сразу после клика (один клик = play)
- `rel=0` — YouTube не показывает related videos в конце (только наш
  бренд остаётся, юзер не утекает)

**Privacy:** используется `youtube-nocookie.com` (а не `youtube.com`)
— YouTube не ставит tracking-cookies до момента play.

---

## 6. Schema.org VideoObject

Автоматически на странице detail (`/{locale}/works/<slug>`):

```json
{
  "@type": "VideoObject",
  "name": "<title>",
  "description": "<seo.description>",
  "thumbnailUrl": "https://img.youtube.com/vi/<id>/maxresdefault.jpg",
  "uploadDate": "<year>-01-01",
  "embedUrl": "https://www.youtube-nocookie.com/embed/<id>",
  "contentUrl": "https://www.youtube.com/watch?v=<id>",
  "duration": "PT<min>M<sec>S"
}
```

Google Video Search индексирует это и показывает работу в video карусели
при релевантных запросах. Видео-thumbnail появляется в SERP.

---

## 7. Empty-state

Пока `src/content/works/` пуст — `/works` показывает CTA "Apply now to
be among the first" со ссылкой на `/apply`.

Когда добавится первая работа — empty-state автоматически исчезает,
появляется grid с этой работой.

---

## 8. Checklist перед публикацией

- [ ] Видео на YouTube (Public или Unlisted)
- [ ] `youtube_id` правильно скопирован (11 chars, без `?v=`)
- [ ] `slug` уникальный, kebab-case, английскими буквами
- [ ] `year` — год выпуска
- [ ] `director` — имя студента (как он сам хочет, full name preferred)
- [ ] `filmmakers` (опц.) — съёмочная группа с ролями
- [ ] `runtime_seconds` (опц.) — длительность для отображения и Schema
- [ ] `programme_id` (опц.) — линк на программу из которой работа
- [ ] `seo.title` 10-70 chars, `seo.description` 50-180 chars
- [ ] EN + RU mdx файлы (или `monolingual: true` в одной)
- [ ] Body synopsis 1-2 абзаца, voice-guide compliant
- [ ] `pnpm lint && pnpm build` — checks pass
- [ ] `git commit + pnpm run release` — deploy

---

## 9. Удаление работы

Если студент попросил снять работу с сайта:

1. Удалить mdx файлы:
   ```bash
   git rm src/content/works/<slug>.en.mdx src/content/works/<slug>.ru.mdx
   git commit -m "works: remove <slug> (per student request)"
   pnpm run release
   ```
2. Опционально — удалить/поменять видимость видео на YouTube (если
   студент хочет полностью снять с public)

После redeploy — `/works/<slug>` отдаёт 404, страница исчезает из
sitemap и из grid'a.
