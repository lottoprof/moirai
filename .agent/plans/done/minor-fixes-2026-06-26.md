# Minor fixes — 2026-06-26 (home + intermediate + instructor feedback bug)

> Created 2026-06-26. Минорные правки текста на Home + Intermediate
> summary, плюс bug fix в Instructor LK: после записи review
> комментарии не отображаются при возврате через OPEN REVIEW.

## A. Bug — Instructor feedback не отображается после save

### Симптом
Препод оставил замечания на `/en/instructor/homework/<submission_id>`
(пример: `aa1506e1-8c98-49e6-90ad-0a9a41b0391a`, Test Student 6),
сохранил, вернулся в когорту
`/en/instructor/cohorts/1ba36e98-37d2-1827-e229-4a6e7261a2ee` →
кликнул **OPEN REVIEW** → на странице ревью комментарии не видны.

### Гипотезы (требуют верификации Playwright)
1. После POST review не обновляется submission.status → когорта показывает
   "Open review" в pending состоянии, а данные сохранены и доступны
   только через прямую ссылку, не через цепочку.
2. GET endpoint для submission возвращает `feedback`/`comments` поле,
   но frontend читает не из того поля (mismatch field name).
3. Race condition: после POST редирект происходит до flush в D1.
4. Кэширование на browser-стороне держит старую версию страницы.

### Шаги диагностики
1. Playwright: залогиниться как `test-instructor`, открыть submission
   Test Student 6.
2. Записать review (короткий тест-комментарий), submit.
3. Вернуться в когорту → OPEN REVIEW → screenshot, network tab,
   проверить что грузится в `<textarea>` / комментариях.
4. Параллельно D1 SELECT `homework_submissions` WHERE id =
   `aa1506e1-...` — посмотреть какие поля заполнены после save.
5. Найти SSR код страницы `/en/instructor/homework/[id]` —
   как читает feedback при render.

### Fix (после диагностики)
TBD после шага 5. Возможные варианты:
- Поправить field mapping (SSR читает не из того столбца)
- Поправить redirect target после POST
- Добавить `Cache-Control: private, no-store` если страница cached
- Поправить статус submission на сервере

## B. Home page text fixes

### B1. "10 Students max" → "10 Students in each group"

**Файлы:**
- `src/content/pages/home.en.mdx:42` — `label: "Students max"` →
  `label: "Students in each group"`
- `src/content/pages/home.ru.mdx:42` — `label: "Студентов в группе"`
  уже корректно (проверить визуально через Playwright)

### B2. Убрать цифры (01, 02, 03) в "Who is this for" + "What's included"

**Файлы:**
- `src/components/public/WhoCard.astro` — удалить рендер `num`,
  обновить CSS layout (грид с двумя колонками: пустой gap или
  убрать левую колонку с номером)
- `src/components/public/FeatureItem.astro` — то же самое
- Места использования: `src/pages/[locale]/index.astro` —
  убрать `num={i+1}` props если они там passed, оставить
  только title+body

### B3. Instructors — восстановить часть текста + поправить роли

**Роли (frontmatter `role`):**
- Vladimir: `Director · Editor · Educator` → `Director · Screenwriter · Editor`
- Anastasia: `Director · Screenwriter · Producer` → `Director · Producer · Editor`

**Bio_short — full тексты от user'а (использовать целиком как
bio_short, заменив 2-предложенческие заглушки):**

Vladimir (`vladimir-popov.en.mdx`):
> Vladimir started making media before he could drive — reporting for
> local television and hosting his own film program on radio as a
> teenager. He holds a film degree in directing and completed his
> graduation project as a feature-length film, shot for $1,000. It
> earned top marks — and proved the principle he now builds every
> class around: craft matters more than resources. His work spans
> music videos, narrative short film, and large-scale commercial
> production. Since moving to the US, he has been teaching filmmaking
> hands-on — and knows exactly what a beginner needs to hear to stop
> waiting and start shooting.

Anastasia (`anastasia-zasypkina.en.mdx`):
> Anastasia holds a film degree in directing and built her career
> from the inside out — working as First Assistant Director on
> television series, short films, and commercial productions before
> stepping fully behind the camera. Her short films have placed at
> international film festivals. She specializes in two things most
> filmmaking courses skip: the director's script as a working
> document, and the psychology of directing actors — how to build
> trust on set and get a real performance out of a real person. In
> the US, she teaches film and theater, bringing the same approach
> to every class: precise, human, and practical.

**Note:** эти тексты совпадают (модулo `shoestring` → `$1,000` для
Vladimir) с long-form body, которые уже в .mdx файлах. То есть
просто переносим body → bio_short во frontmatter. Long body
можно (а) оставить дублем для индивидуальной /instructors/[slug]
страницы, либо (б) удалить если страницы [slug] нет.

**RU перевод:** аккуратный, не дословный. Сделать после EN-правок.

**SEO:** user знает что добавление текста противоречит сокращению,
которое мы делали для индексации. Это осознанный trade-off —
bio_short ~100 слов × 2 instructor cards = ~200 слов добавочного
контента на home, что не блокирует SEO.

### B4. Pricing — убрать "× 1:1" из sessions строк

**Файл:** `src/pages/[locale]/index.astro:265`

```ts
// До
out.push(ru
  ? `${n.toString()} личных сессий с инструктором`
  : `${n.toString()} × 1:1 sessions with instructor`);

// После
out.push(ru
  ? `${n.toString()} сессий с инструктором`
  : `${n.toString()} sessions with instructor`);
```

RU также убираем "личных" — двусмысленность та же.

## C. Programme — Intermediate summary text fix + weeks count

### C1. Добавить "including" перед списком модулей

**Файл:** `src/content/programmes/intermediate.en.mdx:3`

```mdx
# До
summary: An advanced programme for directors who have the basics. 13 modules — actor direction, pitching, production scheduling, editing, and short-film budgeting.

# После
summary: An advanced programme for directors who have the basics. 13 modules including actor direction, pitching, production scheduling, editing, and short-film budgeting.
```

Изменения: убрать `—` (em dash), заменить на `including`.

**Файл:** `src/content/programmes/intermediate.ru.mdx:3` — отзеркалить
с подходящей RU формулировкой (TBD при правке).

### C2. Weeks count: 7 → 6 (beginner), 9 → 7 (intermediate)

**Причина:** на сайте сейчас 7/9 недель. Формула:
`Math.ceil(lessons_total_hint / 2)` где lessons_total_hint=13/17.
User считает по модулям: `ceil(11/2)=6`, `ceil(13/2)=7`.

**Fix:** переключить формулу с `lessons_total_hint` на
`module_count_hint` (значения 11/13 уже корректные).

**Файлы:**
- `src/pages/[locale]/checkout.astro:106-107` —
  `computeDurationWeeks(programme.data.lessons_total_hint, 2)` →
  `computeDurationWeeks(programme.data.module_count_hint, 2)`
- `src/pages/[locale]/apply/contact.astro:97` — то же
- `src/pages/[locale]/apply/index.astro:271-278` — то же
  (включая обновить комментарий)
- `src/pages/[locale]/dashboard/index.astro:253-254` — то же

**Что НЕ трогаем:** `lessons_total_hint` остаётся 13/17 (показывается
как "13 lessons" / "17 lessons" на home). User сказал — реальная
цифра лекций придёт позже от методиста.

## D. Не делаем сейчас

- Не правим **числа** курсов (количество модулей/лекций) —
  user явно сказал "количество лекций... поменяется, надо будет
  переписать цифры, эта информация будет позже"
- Не трогаем layout WhoCard/FeatureItem сверх удаления номеров
- Не правим long-form bios (внутри body .mdx) — только `bio_short`
  во frontmatter

## Lifecycle

1. **Playwright verify**: открыть live home + intermediate page,
   убедиться что описанные строки реально на тех местах что мы
   нашли в код базе (sanity check перед edit'ами).
2. **Bug A diagnosis**: Playwright прогон instructor review flow,
   identify root cause.
3. **Получить от user'а текст для bio_short** (Vladimir + Anastasia).
4. **Edit'ы B1, B2, B4, C1** (text-only, без user input).
5. **Edit B3 bio_short** после получения текста.
6. **Fix bug A** (после диагностики).
7. **Lint + build**.
8. **Deploy + Playwright re-verify** (без cache: incognito).
9. `git mv` plan → done/.

## Open questions

1. **B2**: убрать цифры — оставить grid layout как есть (просто
   пустая левая колонка пропадёт), или перевёрстывать в single-column?
   → По умолчанию: убрать левую колонку, оставить чистый список.
2. **B3 bio_short**: ждём от user'а текст шаблона.
3. **Bug A**: до диагностики не делаем фикс.
