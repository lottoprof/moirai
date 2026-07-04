# MoiraiOnline — Voice Guide

> Этот файл — **источник правды** по бренд-голосу. Поддерживается
> людьми, не агентами. Все драфты journal-постов, маркетинговых
> текстов и любого публичного копи сверяются с ним перед публикацией.

См. также: `docs/Home_page_SEO.md` §13, `docs/Architecture.md` §11.

---

## Принципы

### 1. Concrete, не abstract

✅ "Direct your first film."
❌ "Discover your creative journey."

Конкретный, осязаемый исход — не абстрактное обещание.

### 2. No fluff

Убираем заполняющие формулировки. Никаких:

- ❌ "Embark on your filmmaking journey"
- ❌ "Unleash your creative potential"
- ❌ "Level up your filmmaking skills"
- ❌ "Discover the magic of cinema"
- ❌ "Take your storytelling to the next level"
- ❌ "Comprehensive, all-inclusive program"
- ❌ "Empower yourself", "transform your life"

### 3. Authority через specificity

Сила утверждения — в конкретике, не в эпитетах.

✅ "12 sessions across 3 tracks, 1:1 with working directors."
❌ "Comprehensive curriculum with industry experts."

> **Важно:** конкретные числа в производственном коде — **не** свободным
> текстом, а через `<Fact source="programme:[id]" field="..." />` или
> данные из Content Collections (см. `.agent/rules/forbidden.md`
> §Anti-hardcode).

### 4. Прямая речь второго лица

✅ "You'll learn to direct dialogue scenes."
❌ "Students will learn to direct dialogue scenes."

Адресуем читателя, не описываем абстрактного студента.

### 5. Editorial, не corporate

Тон — как в хорошем журнале о кино: сдержанный, уверенный, без
hype-маркетингового языка. Никаких "amazing", "incredible",
"revolutionary".

### 6. Никаких упоминаний AI / агентов в продукте

См. `Architecture.md` §11. Студент не должен знать, что черновик
поста сделан агентом. Подпись — реальное имя редактора.

---

## Длина текстов на главной

| Где              | Слов        |
|------------------|-------------|
| Hero lede        | 15–25       |
| Section H2       | 4–8         |
| Section paragraph| 30–60       |
| Card description | 15–30       |

Длинные описания — на детальных страницах (programme/bundle/instructor).

---

## Двуязычие

Каждый текст существует в **EN** и **RU** (см. translation pairs
в `Architecture.md` §3). Перевод — носителем языка, не машинный.
Стиль "concrete, no fluff, second-person" сохраняется в обоих.

Для RU — избегать кальки с английского:

✅ "Сними свой первый фильм."
❌ "Окунись в путешествие создания фильмов."

### RU-специфичный stop-list

- ❌ "Окунитесь в...", "погрузитесь в..."
- ❌ "Воплотите свои мечты"
- ❌ "Откройте для себя..."
- ❌ "Эксклюзивный", "уникальный" (когда не уникальный)
- ❌ "Профессиональный" (без конкретики какой именно)

---

## Курсив `<em>` в заголовках

В hero и section h2 курсивом выделяется **одно эмоциональное
слово**:

- "Direct *your* first film."
- "Make your *first* film."
- "Film school teaches theory. We teach *practice*."

Курсив всегда визуально подчёркнут амбер-цветом
(`var(--text-accent-hover)`, см. `Design_system.md` §5).
