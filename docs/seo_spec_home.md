# ТЗ: SEO-обновление главной страницы
**Файлы:** `src/content/pages/home.en.mdx` · `src/content/pages/home.ru.mdx`
**Шаблон:** `index.astro` — не трогать.

---

## Контекст и цели

Moirai — двухуровневый онлайн-курс кинорежиссуры (Beginner / Intermediate).
Преподаватели: Vladimir Popov и Anastasia Zasypkina — оба базируются в Нью-Йорке.
Целевая аудитория: EN и RU говорящие, гео-старт — Нью-Йорк и Северная Америка.

**Ключевые USP (влияют на текст):**
- Нью-йоркские практикующие режиссёры
- Группы строго до 15 человек
- Каждое задание разбирается лично (не автоответы)
- Структура каждой сессии: разбор сданной работы → новый материал → закрепление → новое задание
- На выходе — готовый короткометражный фильм (не сертификат)
- Цены: $369 / $469 / $749 — конкурентно vs рынок ($500+ за уикенд у Sundance Collab)

**Целевые ключевые слова (EN):**

Высокий интент — только в мета-тегах, не строить контент вокруг них (высокая конкуренция: Udemy, Coursera, Skillshare):
- `online filmmaking course`
- `film directing course online`
- `learn filmmaking online`
- `how to make a short film course`

Средний интент — в тексте секций и FAQ:
- `filmmaking course for beginners`
- `online film school alternative`
- `short film course with feedback`
- `online filmmaking course with live instructor`

Длинный хвост — приоритет, почти нулевая конкуренция, строить FAQ и контент вокруг них:
- `how to direct your first short film online`
- `beginner film directing and screenwriting course`
- `learn to make a short film from scratch`
- `hands-on film production course online`
- `build film portfolio online`

**Исключены после ресёрча:**
- `film school new york` — поиск занят NYU / Columbia / NYFA ($30–85k/год), интент "поступить в вуз", нерелевантен для онлайн-курса
- `film mentorship` — размытый интент, нет конвертируемого трафика
- `study filmmaking online`, `filmmaking courses` — монополизированы агрегаторами, зайти нереально
- `screenwriting course online` — отдельная ниша, не приоритет для главной

**NY в тексте:** остаётся как trust signal в видимом тексте (eyebrow, lede) — USP преподавателей, не SEO-keyword.

---

## Правила редактирования

1. **Не трогать** структуру YAML, ключи, вложенность — только значения.
2. **Не изменять** `id` уровней (`beginner`, `intermediate`), `cta_href`, `ids` инструкторов.
3. **Не добавлять** новые ключи в `sections` — шаблон их не рендерит.
4. **FAQ** — допустимо добавлять новые объекты в массив `faqs`.
5. RU-версия — смысловой эквивалент EN, не машинный перевод.
6. `seo.title` — строго до 60 символов.
7. `seo.description` — строго 150–160 символов.
8. HTML-теги `<em>` в значениях `title` полей — сохранять там где они уже есть.

---

## home.en.mdx — точные замены

### seo.title
```
# БЫЛО
title: "Online Filmmaking Program — Direct Your First Film | Moirai"

# СТАЛО
title: "Learn Filmmaking Online — Make Your First Short Film | Moirai"
```
_59 символов. Primary keyword в начале. NY убран из title — не geo-keyword, остаётся в тексте как trust signal._

---

### seo.description
```
# БЫЛО
description: "Two-level online program with working directors. Small cohorts, personal feedback, finished short film. Beginner: cinema language; Intermediate: deeper craft."

# СТАЛО
description: "Hands-on online filmmaking course with New York working directors. Max 15 per cohort, personal feedback on every assignment. Finish with a short film you directed yourself."
```
_156 символов. Покрывает: `hands-on film production`, `short film course with feedback`, `online filmmaking course`. NY — trust signal, не keyword._

---

### sections.hero.eyebrow
```
# БЫЛО
eyebrow: "Beginner & Intermediate — cohorts of max 15"

# СТАЛО
eyebrow: "Online filmmaking course · New York directors · cohorts of max 15"
```
_Primary keyword в crawlable-тексте над H1. Google читает eyebrow как контекст к заголовку._

---

### sections.hero.lede
```
# БЫЛО
lede: "A two-level online program taught by working directors. Beginner covers the language of cinema, editing, and screenwriting. Intermediate goes deeper — actor direction, producing, and the full mechanics of a professional shoot. Both levels end with a short film you made yourself."

# СТАЛО
lede: "A two-level online filmmaking course taught by working New York directors. Learn screenwriting, directing, and editing from scratch — or go deeper with actor direction, producing, and hands-on film production. Both levels end with a short film you directed yourself."
```
_Добавлено: `online filmmaking course`, `New York`, `learn screenwriting`, `hands-on film production`, `short film`._

---

### sections.who.title
```
# БЫЛО
title: "Film school teaches theory. We teach <em>practice</em>."

# СТАЛО
title: "Film school teaches theory. We teach <em>practice</em> — hands-on, from day one."
```
_`film school` как контраст-keyword остаётся. Добавлено `hands-on` для LSI._

---

### sections.included — item "Practice After Every Lecture"
Заменить второй item целиком (title + body):
```
# БЫЛО
- title: "Practice After Every Lecture"
  body: "Each session ends with a hands-on assignment — shooting exercises, written scenes, short edits. Every piece of work gets reviewed personally. Real director notes, not automated responses."

# СТАЛО
- title: "A Full Cycle Every Session"
  body: "Each session opens with a review of your submitted work — specific notes, timestamps, what worked and why. Then new material. Then consolidation. Then your next assignment. You arrive with work, you leave with more. Real director notes, not automated responses."
```
_Описывает реальную механику сессии. Бьёт в `hands-on film experience`, `short film course with feedback`, `film mentorship`._

---

### sections.after — item "A festival submission"
```
# БЫЛО
- title: "A festival submission"
  body: "Personal guidance on where and how to submit your film — which festivals to target, how to write your synopsis, and what the selection process actually looks like."

# СТАЛО
- title: "A film portfolio — and your first festival submission"
  body: "You leave with a finished film for your portfolio and personal guidance on where to submit it — which festivals to target, how to write your synopsis, and what the selection process actually looks like."
```
_Добавлено `build film portfolio` как явный outcome._

---

### sections.curriculum.intro
```
# БЫЛО
intro: "Both levels cover Directing, Editing, and Scriptwriting — but Intermediate isn't a continuation, it's a different depth. Where Beginner builds your foundation, Intermediate breaks down the craft: advanced actor direction, complex editing principles, world-building in the script, and a full Producing track covering budgets, locations, and production logistics."

# СТАЛО
intro: "Both levels cover Directing, Editing, and Scriptwriting — but Intermediate isn't a continuation, it's a different depth. Where Beginner builds your foundation, Intermediate breaks down the craft: advanced actor direction, complex editing principles, world-building in the script, and a full Producing track covering budgets, locations, and production logistics. Every level ends with a finished short film you can add to your portfolio."
```
_Один sentence добавлен в конце. `short film`, `portfolio` — естественно._

---

### faqs — добавить в конец массива 3 новых вопроса

```yaml
  - q: "Is this a good alternative to film school?"
    a: "For people who want to actually make films — yes. Film school covers theory across years and costs tens of thousands of dollars. This program is built around one goal: you finish with a real short film, personal feedback on every step, and the skills to make the next one. New York working directors, cohorts of max 15, hands-on from session one."

  - q: "How do I make my first short film if I've never made anything?"
    a: "Start with Beginner. It's designed for complete newcomers — no camera, no experience, no film vocabulary needed. A smartphone is enough. By the end you'll have shot, edited, and submitted your first short film, with personal feedback from both instructors at every stage."

  - q: "What makes this different from other online filmmaking courses?"
    a: "Three things. First, every assignment gets reviewed personally — not by a forum, not by AI, by a working director with specific notes. Second, cohorts are capped at 15 so you're not invisible. Third, you finish with a real film — not a certificate. In Intermediate, that film is built to submit to festivals."
```

---

## home.ru.mdx — точные замены

### seo.title
```
# БЫЛО
title: "Онлайн-программа кинорежиссуры — Сними свой первый фильм | Moirai"

# СТАЛО
title: "Онлайн-курс кинорежиссуры — сними свой первый фильм | Moirai"
```
_60 символов. NY убран из title — остаётся в eyebrow и lede как trust signal._

---

### seo.description
```
# БЫЛО
description: "Двухуровневая программа от практикующих режиссёров. Малые группы, персональный фидбэк, готовый короткометражный фильм. Beginner и Intermediate."

# СТАЛО
description: "Онлайн-курс кино с нью-йоркскими режиссёрами. Группы до 15 человек, личный разбор каждой работы. Снимите свой первый фильм — смартфон подойдёт, опыт не нужен."
```
_157 символов._

---

### sections.hero.eyebrow
```
# БЫЛО
eyebrow: "Beginner и Intermediate — группы до 15 человек"

# СТАЛО
eyebrow: "Онлайн-курс кинорежиссуры · режиссёры из Нью-Йорка · группы до 15 человек"
```

---

### sections.hero.lede
```
# БЫЛО
lede: "Двухуровневая онлайн-программа от практикующих режиссёров. На уровне Beginner — язык кино, монтаж и сценарий. Intermediate уходит глубже: работа с актёром, продюсирование и полная механика профессиональной съёмки. Каждый уровень завершается коротким фильмом, который вы сняли сами."

# СТАЛО
lede: "Двухуровневый онлайн-курс кинорежиссуры от практикующих нью-йоркских режиссёров. Beginner — язык кино, монтаж, сценарий с нуля. Intermediate уходит глубже: работа с актёром, продюсирование и полная механика съёмки. Каждый уровень завершается коротким фильмом, который вы сняли сами."
```

---

### sections.who.title
```
# БЫЛО
title: "Киношколы учат теории. Мы учим <em>практике</em>."

# СТАЛО
title: "Киношколы учат теории. Мы учим <em>практике</em> — с первого занятия."
```

---

### sections.included — item "Практика после каждой лекции"
```
# БЫЛО
- title: "Практика после каждой лекции"
  body: "Каждая сессия завершается практическим заданием — съёмочные упражнения, написанные сцены, короткие монтажные склейки. Каждая работа разбирается лично. Реальные режиссёрские заметки, не автоматические ответы."

# СТАЛО
- title: "Полный цикл на каждом занятии"
  body: "Каждая сессия начинается с разбора сданной работы — конкретные заметки, таймкоды, что сработало и почему. Затем новый материал, закрепление, следующее задание. Вы приходите с работой и уходите с новой. Реальные режиссёрские заметки, не автоматические ответы."
```

---

### sections.after — item "Подача на фестивали"
```
# БЫЛО
- title: "Подача на фестивали"
  body: "Личное руководство куда и как подавать фильм — какие фестивали выбирать, как написать синопсис, как реально устроен процесс отбора."

# СТАЛО
- title: "Готовый фильм в портфолио — и первая подача на фестиваль"
  body: "Вы уходите с готовым фильмом для портфолио и личным руководством куда его подавать — какие фестивали выбирать, как написать синопсис и как реально устроен процесс отбора."
```

---

### sections.curriculum.intro
```
# БЫЛО
intro: "Оба уровня покрывают режиссуру, монтаж и сценарий — но Intermediate не продолжение, а другая глубина. Beginner закладывает фундамент, Intermediate разбирает ремесло: продвинутая работа с актёром, сложные принципы монтажа, построение мира в сценарии и полный продюсерский трек — бюджеты, локации, логистика производства."

# СТАЛО
intro: "Оба уровня покрывают режиссуру, монтаж и сценарий — но Intermediate не продолжение, а другая глубина. Beginner закладывает фундамент, Intermediate разбирает ремесло: продвинутая работа с актёром, сложные принципы монтажа, построение мира в сценарии и полный продюсерский трек — бюджеты, локации, логистика производства. Каждый уровень завершается готовым фильмом, который войдёт в ваше портфолио."
```

---

### faqs — добавить в конец массива 3 новых вопроса

```yaml
  - q: "Это альтернатива киношколе?"
    a: "Для тех, кто хочет снимать — да. Киношкола даёт теорию за несколько лет и стоит десятки тысяч долларов. Эта программа построена вокруг одной цели: вы заканчиваете с реальным коротким фильмом, личным фидбэком на каждом шаге и пониманием как снимать следующий. Нью-йоркские режиссёры, группы до 15 человек, практика с первого занятия."

  - q: "Как снять первый короткометражный фильм если я никогда ничего не снимал?"
    a: "Начните с Beginner. Программа создана для полных новичков — камера, опыт и профессиональный словарь не нужны. Смартфона достаточно. К концу уровня вы снимете, смонтируете и сдадите свой первый короткий фильм с личным разбором от обоих преподавателей на каждом этапе."

  - q: "Чем это отличается от других онлайн-курсов по кино?"
    a: "Три вещи. Первое — каждая работа разбирается лично практикующим режиссёром с конкретными заметками, не форумом и не ботом. Второе — группы до 15 человек, вас видят и знают. Третье — вы заканчиваете с реальным фильмом, а не сертификатом. На Intermediate этот фильм готов к подаче на фестивали."
```

---

## Чеклист после внесения изменений

- [ ] `seo.title` EN ≤ 60 символов
- [ ] `seo.description` EN 150–160 символов
- [ ] `seo.title` RU ≤ 60 символов
- [ ] `seo.description` RU 150–160 символов
- [ ] Ключи YAML не изменены
- [ ] `<em>` теги сохранены где были
- [ ] `cta_href` не изменены
- [ ] `ids` инструкторов не изменены
- [ ] Новые FAQ добавлены в конец массива `faqs`
- [ ] `index.astro` не тронут
