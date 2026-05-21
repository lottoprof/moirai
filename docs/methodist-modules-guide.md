# Гайд методиста — каталог модулей

> Этот документ — инструкция для методистов по работе с каталогом модулей
> Moirai в git. Замена прежнего `.ods`-шаблона. См. также
> `.agent/rules/decisions_archive.md` 2026-05-17 и 2026-05-19.

## Что такое модуль

**Модуль** — атомарная единица учебной программы. Один модуль = одна тема,
один связный блок. Состав модуля:

- **Метаданные** — структурированные поля (хранятся в нашей БД)
- **Student book** — публикуемый материал для студента (markdown или PDF)
- **Личные заметки** — рабочий материал методиста; не публикуется и нас не
  касается (методист хранит локально или в gitignored папке)

## Где живут модули

Когда заведём external git repo (`moirai-content`):

```
modules/
  beg-01-lumiere-frame/
    metadata.yaml          ← метаданные ниже описанные
    student_book.ru.md     ← или .pdf (выбор методиста)
    student_book.en.md     ← перевод
    images/                ← assets для markdown body
    private/               ← опц. — личные заметки (gitignored)
  beg-02-melies-frame/
    ...
```

До запуска external repo — присылаешь обновлённые метаданные владельцу
в любом формате (markdown table ниже, json, csv) → owner делает one-time
seed в D1.

## Поля модуля (метаданные)

### Общие — одно значение на модуль

| Поле | Тип | Пример | Что |
|---|---|---|---|
| `slug` | строка | `beg-01-lumiere-frame` | Уникальный ID. Pattern `{prefix}-{NN}-{english-keyword}`. **Стабильный** — на него ссылаются programmes и enrollments, переименовывать НЕЛЬЗЯ |
| `track` | enum | `Directing` | `Directing` / `Editing` / `Scriptwriting` / `Producing` |
| `has_text` | 0/1 | `1` | Есть ли текстовый материал в student book |
| `has_video` | 0/1 | `0` | Есть ли видео-контент (наш mp4 или внешнее) |
| `has_external_video` | 0/1 | `0` | Есть ли YouTube/Vimeo ссылки (subset has_video) |
| `has_homework` | 0/1 | `1` | Требует ли модуль практической работы + сессии с преподом |
| `lessons` | int | `1` | Сколько занятий нужно на модуль. Длительность одного занятия не фиксируется (20-45 мин гибко) |
| `requires_modules` | string[] | `[]` | Slug'и модулей без которых этот не работает. Пусто = standalone. Используется редко |
| `suggested_programme` | строка | `beginner` | Hint для admin: для какой programme задумывался. **Не constraint** — admin может включить в любую programme |
| `suggested_order` | int | `1` | Hint порядка внутри suggested_programme |

### Билингвальные — два значения (ru + en)

Каждое поле существует в `ru` и `en` версии:

| Поле | Тип | Что |
|---|---|---|
| `title` | строка | Название модуля для UI |
| `summary` | строка | 1-2 предложения. Краткое описание для списков |
| `objectives` | string[] | Цели модуля. Что студент узнает/научится. 2-4 пункта |
| `concepts` | string[] | Ключевые понятия. Термины |
| `homework` | строка | Описание ДЗ. Пусто если `has_homework: 0` |

## Пример: один модуль в `metadata.yaml`

```yaml
slug: beg-01-lumiere-frame
track: Directing
has_text: 1
has_video: 0
has_external_video: 0
has_homework: 1
lessons: 1
requires_modules: []
suggested_programme: beginner
suggested_order: 1

ru:
  title: Кадр Люмьера
  summary: Погружение в истоки кинематографа через практику наблюдения за повседневной жизнью и освоение основ композиции кадра.
  objectives:
    - Знать, откуда пошёл кинематограф
    - Научиться вести наблюдение и различать интересные ситуации в повседневной жизни
    - Практика постановки кадра
  concepts: [Зарождение кино, братья Люмьер, кинематограф, неподвижная камера, наблюдение]
  homework: |
    Упражнение «Кадр Люмьера». Документальный видеофрагмент до одной минуты,
    статичная камера, с живыми объектами в кадре, без монтажных склеек, VFX
    и экранной речи (желательно также обойтись без музыки).

en:
  title: Lumière Frame
  summary: A dive into the origins of cinema through the practice of observing everyday life and mastering the fundamentals of frame composition.
  objectives:
    - Understand the origins of cinema
    - Learn to observe and identify compelling moments in everyday life
    - Practice composing a frame
  concepts: [Birth of cinema, the Lumière brothers, cinematograph, static camera, observation]
  homework: |
    "Lumière Frame" exercise. A documentary video clip up to one minute,
    with a static camera and live subjects in the frame, no edits, VFX,
    or on-screen speech (music ideally avoided too).
```

## Markdown table для быстрого обзора

Для review всего каталога удобнее markdown table. Один файл `modules/_index.md`
содержит сводку:

```markdown
# Каталог модулей

## Beginner

| slug | title (ru) | track | lessons | hw |
|---|---|---|---:|:---:|
| beg-01-lumiere-frame | Кадр Люмьера | Directing | 1 | ✓ |
| beg-02-melies-frame | Кадр Мельеса | Directing | 1 | ✓ |
| ...

## Intermediate

| slug | title (ru) | track | lessons | hw |
|---|---|---|---:|:---:|
| int-01-dialogue-coverage | Диалог — «восьмёрка» | Directing | 1 | ✓ |
| ...
```

Эту сводку генерит CI на каждый push в `main` (Sprint 2+).

## Конвенции

### Slug

- Латиница, lowercase, дефисы
- Pattern: `{prog-prefix}-{NN}-{english-keyword}`
  - `prog-prefix` — `beg` / `int` (по suggested programme)
  - `NN` — двузначное число порядка
  - `english-keyword` — короткое английское ключевое слово темы
- Примеры: `beg-01-lumiere-frame`, `int-10-editing-principles`, `int-12-budget`
- **Slug стабильный** — после публикации не переименовывается. Если очень
  нужно — миграция вручную через owner.

### Track

Один из четырёх (фиксированный enum):
- `Directing` — режиссура
- `Editing` — монтаж
- `Scriptwriting` — сценарное мастерство
- `Producing` — продюсирование

### lessons (занятия)

Сколько 50-минутных (или 25-минутных, или 45-минутных — гибко) занятий
нужно на модуль. Большинство теоретических модулей = 1 занятие. Сложные
практические могут быть 2-3.

### has_homework

- `1` — требуется домашка → после модуля 1 сессия 1:1 с преподавателем (50 мин)
- `0` — теоретический модуль без практики, идёт перед следующим практическим

### requires_modules

Пусто `[]` в большинстве случаев. Заполняется только когда модуль реально
не работает без других — например, "Финальное упражнение по монтажу"
требует "10 принципов монтажа".

## Структура занятия (для понимания)

Сессия 1:1 со студентом, 50 минут (плюс-минус), три части:

- **10 мин** — разбор предыдущей домашки (письменный preparing уже отправлен
  студенту до сессии)
- **20-25 мин** — углубление по новому модулю (записывается, попадает в
  личный кабинет студента)
- **10-15 мин** — практическое упражнение по только что пройденному

## Programmes (для контекста)

**Programme** — упорядоченный набор модулей с ценой и features. Один модуль
может входить в несколько programmes одновременно:

- `beginner` — 11 модулей за €399
- `intermediate` — 13 модулей за €499
- `bundle` — все 24 за €749 (со скидкой)
- `individual` — пустой шаблон, инструктор собирает per-student
- `budget-calculation` — один модуль `int-12-budget` за €49 (sample standalone)

Methodist **не определяет** какие модули в каких programmes — это делает
admin/owner. Поля `suggested_programme` / `suggested_order` — только
рекомендация группировки.

## Workflow обновлений

### До запуска external repo

1. Methodist шлёт обновлённые метаданные владельцу (любой формат — md table,
   yaml, json)
2. Owner коммитит в `moirai-content/modules/{slug}/metadata.yaml`
3. Owner запускает re-seed (`pnpm seed:modules`) → D1 обновляется

### После запуска external repo (Sprint 2)

1. Methodist клонирует `moirai-content` локально
2. Создаёт/правит `modules/{slug}/metadata.yaml` + `student_book.{ru,en}.md`
3. `git push` в main
4. GH Actions автоматически делает sync на `/api/admin/modules/sync`
5. D1 + R2 обновляются автоматически

## Lessons → длительность курса (cohort duration)

Поле `lessons` в модуле — **критическое** для расчёта длительности курса.
Не путать со "сколько минут идёт занятие" (это не отслеживается).

### Формула

```
cohort.duration_weeks = SUM(modules.lessons) / sessions_per_week
```

При стандартном `sessions_per_week = 2` (FLOW-4 в `apply-flow-spec.md`):

| Программа | Σ lessons | Недель | Месяцев |
|---|---:|---:|---:|
| Beginner (11 модулей) | 13 | ~6.5 | ~1.5 |
| Intermediate (13 модулей) | ~17 | ~8.5 | ~2 |
| Bundle (B + I, 24 модуля) | ~30 | ~15 | ~3.5 |

### Что это значит для методиста

- **Добавляя модуль в программу — вы удлиняете курс.** Это влияет на
  цену (потенциально) и на расписание cohort'ы. Согласовать с lead'ом
  до коммита.
- **Изменяя `lessons` у существующего модуля** (например, разбиваете
  материал на 3 занятия вместо 2) — это меняет длительность всех
  программ, куда модуль входит. Все cohorts с этой программой
  пересчитают окончание автоматически.
- **Когда `lessons` указано — указывайте честно**. Слишком мало → курс
  будет ощущаться рваным; слишком много → клиенты будут устать.

### Стандартный модуль — «один теоретический + одно практическое занятие»

Большинство модулей имеют `lessons: 1` (один обзорный seminar + домашка
до следующего модуля). Модули с глубокой темой — `lessons: 2` (теория +
разбор после самостоятельной работы).

### Связь с расписанием cohort'ы

Когда админ создаёт cohort:

```
cohort.start_date = заданная админом
cohort.end_date   = start_date + (programme.lessons_total / sessions_per_week) недель
```

Поле `lessons_total_hint` в programme frontmatter — denormalized snapshot
для отображения на главной/grid. Должно совпадать с `SUM(modules.lessons)`
для модулей в `modules` array. Проверка автоматическая в CI (TODO Stage 14+).

## Student book формат + workflow (Stage 22)

### Где живут черновики

`scripts/seed/student-book-drafts/` — 48 markdown файлов (24 модуля × 2
локали). По одному на (slug, locale). Frontmatter содержит meta (slug,
locale, title, status, generated_at) + готовые секции для заполнения:

- **## Цели модуля** — list из metadata.objectives
- **## Понятия** — concepts list inline
- **## Опорный материал** — основной текст лекции (TODO)
- **## Видео** — link на запись / YouTube (TODO)
- **## Домашнее задание** — формулировка ДЗ (предзаполнено из metadata.homework
  если есть; иначе TODO)

### Регенерация черновиков

Если методист правит metadata в `modules-2026-05-19.json` (или будущем
yaml), регенерация:

```bash
node scripts/generate-student-book-drafts.mjs           # missing only
node scripts/generate-student-book-drafts.mjs --force   # пересоздать всё (overwrite)
```

### Загрузка в R2 (production)

Body модуля хранится в R2 bucket `moirai-content` по пути:

```
modules/{slug}.{locale}.md
```

Это же поле зафиксировано в D1 `modules.body_r2_key`. Платформа читает
body через `env.MODULE_CONTENT.get(key)`.

После правки черновика — sync в R2:

```bash
# Все 48 файлов
node scripts/upload-student-books.mjs

# Только один
node scripts/upload-student-books.mjs --only=beg-01-lumiere-frame.en
```

Idempotent (R2 PUT overwrites). После upload — production видит новый
body сразу (CF cache по этому пути не настроен; SSR на /modules/[slug]
сам кеширует через `Cache-Control`).

### Body формат — supported markdown features

Текущий MVP принимает любой стандартный markdown:

- Заголовки H1-H4
- Параграфы, lists (bullet + numbered)
- Inline + block code (\`\`\`)
- Tables
- Links (включая YouTube — embed решим позже)
- Images (R2 keys в формате `modules/{slug}/images/<file>.jpg` — Sprint 2)

В будущем добавим (если методисты попросят):

- Mermaid диаграммы (live render)
- Math (KaTeX/MathJax) — низкий приоритет для кино-курса
- Video player embed для YouTube/Vimeo

### Что не должен делать методист

- Менять frontmatter поля `slug` или `locale` — это primary key в D1
- Удалять секции (## Цели, ## Понятия и т.д.) — UI на странице модуля
  ожидает эту структуру
- Заливать ассеты в R2 вручную — только через upload-script

### Validator — R2 ↔ D1 consistency

Каждый body в R2 должен иметь соответствующую metadata row в D1
`modules` table (slug + locale + body_r2_key). Если связь сломана,
runtime получит пустой body на странице модуля.

**Защита:**

1. **Prevention** (в `upload-student-books.mjs`): перед каждым upload'ом
   скрипт делает SELECT в D1 — если нет row с `(slug, locale)` и `has_text=1`,
   файл **пропускается** с warning. Orphan-объектов в R2 не появится.

2. **Retrospective validator** (`scripts/check-r2-d1-mapping.mjs`):
   - Quick (D1 only): `pnpm check:r2-d1:fast` — проверяет конвенцию пути,
     отсутствие NULL и duplicate keys. Sub-секунда.
   - Full (D1 + 48 R2 HEAD requests): `pnpm check:r2-d1` — каждый D1.body_r2_key
     дёргается через `wrangler r2 object get`. ~30-60 сек.

   Exit code 0 = ok, 1 = есть missing/inconsistencies. Подходит для CI gate.

   **Что НЕ проверяет** (TODO Sprint 2): R2 objects без D1 row (orphan
   detection). Wrangler CLI не имеет `r2 object list`. Решение: через
   S3-compatible API с access keys (опционально).

### Workflow методиста — полная последовательность

#### Сценарий A: новый модуль (Sprint 1, manual)

```bash
# 1. Добавить metadata в scripts/seed/modules-2026-05-19.json
#    (или будущий yaml в external repo)

# 2. Залить metadata в D1
pnpm seed:modules                # prod
# или
pnpm seed:modules:local          # local dev D1

# 3. Сгенерить draft markdown для нового модуля
pnpm drafts:gen                  # missing only (skip existing)

# 4. Отредактировать scripts/seed/student-book-drafts/<slug>.<locale>.md
#    Заполнить секции: Опорный материал, Видео, Домашнее задание

# 5. Залить body в R2
pnpm drafts:upload               # все, или
node scripts/upload-student-books.mjs --only=<slug>.<locale>

# 6. Verify
pnpm check:r2-d1                 # full check (D1 + R2)
```

#### Сценарий B: правка существующего модуля

```bash
# 1. Отредактировать markdown файл
$EDITOR scripts/seed/student-book-drafts/beg-05-voiceover.en.md

# 2. Залить
pnpm drafts:upload               # все (idempotent overwrite)
# или одиночно:
node scripts/upload-student-books.mjs --only=beg-05-voiceover.en

# 3. (Опционально) verify
pnpm check:r2-d1
```

#### Что коммитится в git

✅ `scripts/seed/modules-2026-05-19.json` (или будущий yaml)
✅ `scripts/seed/student-book-drafts/*.md` — все 48+ файлов
❌ НИКОГДА: R2 keys, secret API tokens, payment data

R2 — это runtime артефакт (как deployed dist/), не source. Source — это
mdx-файлы в git.

### Sprint 2 / 3 TODO

#### External repo `moirai-content`

**Цель:** методист работает в **отдельном** git репо без доступа к
платформенному коду / секретам / payments.

```
moirai-content/                  # new repo
├── modules/
│   ├── beg-01-lumiere-frame/
│   │   ├── metadata.yaml        # methodist source of truth
│   │   ├── student_book.en.md
│   │   ├── student_book.ru.md
│   │   ├── images/              # img assets (R2 uploads)
│   │   └── private/             # answer keys, не уходит в публичный R2
│   └── ...
├── .github/workflows/
│   └── sync.yml                 # GH Actions → POST /api/admin/modules/sync
└── README.md                    # инструкция methodist'у
```

Steps to implement (high-level):

- [ ] Создать репо `lottoprof/moirai-content`
- [ ] Скрипт миграции `scripts/seed/* → moirai-content/modules/*`
- [ ] GH Actions workflow `.github/workflows/sync.yml`:
  - Triggers: push to main + manual workflow_dispatch
  - Steps: parse changed files → POST на `/api/admin/modules/sync`
    с GitHub OIDC token (бесcredential auth)
- [ ] POST /api/admin/modules/sync endpoint (admin-only):
  - Валидирует payload signature
  - UPSERT в D1 modules
  - PUT bodies в R2
  - Logs audit_log event='modules_synced'
- [ ] Migration: переносим existing 24 modules в новый репо
- [ ] Deprecation: methodist больше не клонирует platform repo

#### Validation / quality gates

- [ ] CI gate: `pnpm check:r2-d1` на каждый PR в moirai monorepo
- [ ] CI gate: `pnpm check:translations` (translation-pair validator)
- [ ] CI gate: yaml schema validation в moirai-content (zod через TS-script)
- [ ] Linkcheck: ссылки на YouTube / external resources валидны
- [ ] Orphan detection: S3 list R2 → diff vs D1 → report orphan keys

#### Content authoring features

- [ ] Mermaid diagram rendering (методисты просили)
- [ ] YouTube embed renderer
- [ ] Math (KaTeX) — низкий priority
- [ ] Image upload pipeline (R2 sub-paths `modules/{slug}/images/`)
- [ ] Private answer keys (отдельный R2 path с ACL)
- [ ] Module versioning (semver на module metadata)

#### Admin UI (Sprint 3+)

- [ ] `/admin/modules` view — list + drawer с body preview
- [ ] Inline edit body через rich-editor
- [ ] Module preview (как видит студент) без deploy
- [ ] Bulk actions: archive / unpublish / re-sync

---

**Версия:** 2026-05-19
**Связанные документы:** `.agent/rules/decisions_archive.md` (2026-05-17,
2026-05-19), `migrations/0004_modules_enrollments.sql`, `db/types.ts`.
