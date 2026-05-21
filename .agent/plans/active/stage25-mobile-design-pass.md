# Stage 25 — Mobile design pass (deferred после Student ЛК)

## Контекст

Stage 8 (PSI audit) подсветил техническую сторону — Performance / a11y /
Best Practices на мобильном идут 96-100. Но **визуальное оформление**
текущих компонентов на узких viewport'ах (375-414px) не отполировано.
Пользовательский отзыв 2026-05-21.

Этот pass делается **после** Student ЛК (Sprint 1 student dashboard
с реальным контентом), потому что там тоже могут быть mobile UX issues —
лучше пройти всё разом одним подходом.

## Конкретные жалобы (lottoprof, 2026-05-21)

### 1. AnnouncementBar в шапке — "мешанина из букв"

Компонент: `src/components/public/AnnouncementBar.astro`

На mobile в одной строке тесно лезут: kind-chip · text · CTA-link · ✕.
При активной cohort'е "Next Beginner cohort starts June 15 — limited to 10
students" + "Apply now →" + ✕ — переносится грязно.

Возможные направления:
- На < 640px свернуть в 2 строки: row 1 [chip] [text], row 2 [CTA] [✕]
- Или сократить text на mobile (data-mobile-text attribute)
- Или вообще скрывать AnnouncementBar на mobile (UX trade-off)
- Pagination dots тоже занимают место — на mobile показать первый
  message и hint "+N more"

Текущий стиль: `.announce-bar` flex row, gap var(--space-md), wrap.

### 2. StatsBanner на главной — текст разъезжается

Компонент: `src/components/public/StatsBanner.astro`

На mobile 2×2 grid:
```
10  · Студентов в группе
2×  · Занятия в неделю
1:1 · Личный разбор
1   · Готовый короткометражный
```

Проблема: длинные label-ы ("Готовый короткометражный") wrap'ятся в
2-3 строки и ломают выравнивание; разная высота ячеек.

Возможные направления:
- На mobile: вертикальный stack (1 col) — больше места под label
- Сократить labels: "Готовый короткометражный" → "Готовый фильм"
- Min-height на ячейке + center align по вертикали
- Использовать `<dl>` вместо grid — браузер сам выровняет

### 3. Прочие места что проверить (audit list)

Когда дойдём — пройти через 375px viewport и проверить:

- [ ] **Hero** на главной — long lede wraps? Title overflow?
- [ ] **WhoCard** grid — 4 carda × длинные titles
- [ ] **ProgrammeCard** в curriculum-секции — title + lede + meta + link CTA
- [ ] **TierCard** (Pricing) — featured badge не съезжает?
- [ ] **InstructorCard** — initial letter не наезжает на text?
- [ ] **AiModule banner** (slim) — на mobile inline layout norm?
- [ ] **Faq accordion** — длинные вопросы / ответы readable?
- [ ] **FinalCta** — title overflow?
- [ ] **Footer** — links wrap чисто?
- [ ] `/programmes/[id]` — module timeline на mobile (60px order column)
- [ ] `/apply` — фильтры chips + cohort cards на 375px
- [ ] `/apply/contact` — 2-col layout collapses в 1 col правильно?
- [ ] `/checkout` — 2-col aside + form на mobile
- [ ] `/dashboard` (paid + pre-payment) — stats grid + module cards
- [ ] `/legal/*` — markdown body на 375px (особенно tables)
- [ ] `/admin/applications` — table horizontal scroll работает?
- [ ] `/instructor/` — my cohorts cards + students grid

## Не входит

- **Tablet (768-1024px) refinement** — отдельным проходом если будет нужно
- **iPad landscape vs portrait** — низкий приоритет
- **Дизайн светлой темы** (stage10) — отдельно
- **Performance optimizations** — Stage 8 уже сделал основное

## Critical files

- `src/components/public/AnnouncementBar.astro` — больше всего нужно
- `src/components/public/StatsBanner.astro` — медиа-query refactor
- Все компоненты в `src/components/public/` где @media (max-width:...)
  есть — пройти и проверить визуал

## Reference

- `psi-desktop.png` (если ещё в git, иначе перегенерить через PSI)
- Mobile breakpoints в codebase: 640px и 768px
- Manual testing через Chrome DevTools device toolbar (Pixel 7 / iPhone 14)
