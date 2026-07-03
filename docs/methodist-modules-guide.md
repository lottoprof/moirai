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

