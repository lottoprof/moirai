# Apply flow — spec

**Status**: in discussion · **Updated**: 2026-05-20 · **Owner**: lottoprof

Документ фиксирует обсуждение UX и архитектуры Apply-флоу до старта
реализации (stage14). Растёт по мере ответов на вопросы. План
(`.agent/plans/active/stage14-apply.md`) создаётся когда спека закрыта.

## Текущий флоу (high-level, 6 шагов)

```
1. /[locale]/                       Hero CTA "Apply now"
              ↓
2. /[locale]/apply (anonymous)      ВЫБОР СЛОТА
   - Сетка свободных слотов
   - Каждый слот: программа + пара дней + время + старт + N/max мест
   - Клик → выбран
              ↓
3. /[locale]/apply/contact          ID
   - Email + имя + Turnstile
   - "Регистрируясь, вы соглашаетесь с Terms + Privacy"
   - Submit → создаёт user + application + шлёт magic-link
              ↓
4. /[locale]/dashboard (logged in, БЕЗ ОПЛАТЫ)
   - Application summary: программа, слот, старт даты
   - Countdown до старта когорты
   - Teaser курса (модули, инструкторы) — locked
   - КНОПКА "Pay now → start the course"
              ↓
5. /[locale]/checkout (Stripe Checkout redirect)
   - Чекбокс "I accept Terms + Refund + Privacy"
   - Pay → Stripe webhook → enrollment.status = 'paid'
   - Audit log: offer_accepted с timestamp+IP+terms_version
              ↓
6. /[locale]/dashboard (paid, full access)
   - Все модули, сессии, homework, инструктор
```

**Ключевое решение** (lottoprof, 2026-05-20):
- Клиент попадает в дашборд **ДО оплаты** — повышает конверсию (видит что покупает, "ввязывается")
- Оплата = подписание оферты (Terms + Refund + Privacy acceptance в audit_log)
- Группа минимум 1 человек — когорта стартует на фиксированной дате независимо от размера

## Список вопросов

### A. Регистрация vs Apply: точка входа

- [ ] A1. Apply доступен до регистрации (anonymous) или только залогиненным?
- [ ] A2. Если anonymous — Apply создаёт user аккаунт автоматически или отдельный шаг?
- [ ] A3. Magic-link / OAuth / password — где подключается (до Apply / после / без аккаунта)?
- [ ] A4. Повторный Apply через тот же email — разрешён?

### B. Apply form — поля

- [ ] B1. Обязательные поля: email, имя, программа, slot — что ещё?
- [ ] B2. Опциональные: телефон / страна / опыт / мотивация / source?
- [ ] B3. Turnstile — да?
- [ ] B4. Промокод/реферал — сразу или Sprint 2?

### C. Сетка слотов

- [ ] C1. Гранулярность: "день+время" или фиксированная пара дней?
- [ ] C2. Утро/вечер — конкретные часы (09:00 / 19:00 ET) или диапазон?
- [ ] C3. Часовой пояс — фиксированный ET или конвертация под клиента?
- [ ] C4. UI: матрица 7×2 или предустановленный shortlist?
- [ ] C5. Можно выбрать несколько слотов (preference order) или один?
- [ ] C6. Откуда ограничиваются: availability инструктора или фикс пресет?

### D. Формирование группы

- [ ] D1. Минимум 1 человек — стартуем сразу или окно ожидания N дней?
- [ ] D2. Максимум 10 — что если 11-й хочет тот же слот (waitlist / next cohort)?
- [ ] D3. Когда стартует cohort: фиксированные даты / динамически / вручную админом?
- [ ] D4. Один клиент = одна группа или несколько одновременно?
- [ ] D5. Cohort = группа или группа = подгруппа внутри cohort?

### E. Оплата

- [ ] E1. Apply → сразу к оплате или Apply бесплатно, оплата после discovery-call?
- [ ] E2. Discovery-call — для всех или только individual?
- [ ] E3. Stripe Checkout (redirect) vs Elements (embedded)?
- [ ] E4. Если cohort не сформировалась — refund или авто-перенос?

### F. Коммуникации после Apply

- [ ] F1. Confirmation email сразу — что в нём?
- [ ] F2. Notification инструктору — где (email / dashboard)?
- [ ] F3. Когда группа собирается — auto-email?
- [ ] F4. Дашборд если apply есть но enrollment не active — что показывать?

### G. Видимость в admin/instructor

- [ ] G1. Apply-список — где (admin/applications)? Статусы и переходы?
- [ ] G2. Инструктор видит applications своего слота или всех?
- [ ] G3. Какие статусы (new → contacted → ... → paid)?

### H. Edge-кейсы

- [ ] H1. Apply без free слотов — waitlist / next cohort?
- [ ] H2. Дубль Apply (email+programme) — заменяет / отклоняется / показывает существующий?
- [ ] H3. Apply на archived programme — 404 / disabled?
- [ ] H4. Apply на individual — отдельный flow (discovery-call)?
- [ ] H5. Apply на уже купленную programme — блок или re-take?

### I. Data model

- [ ] I1. `applications` отдельная или часть `enrollments` со статусом pending?
- [ ] I2. User создаётся при Apply (anonymous) или связывается потом?
- [ ] I3. Slots — отдельная таблица или JSON в applications?
- [ ] I4. Cohorts — связь с applications/enrollments?

### J. i18n

- [ ] J1. Apply form en+ru, fallback стратегия для непереведённых slot-names?

### K. Legal / compliance

- [ ] K1. Чекбокс Terms+Privacy на Apply — обязательный?
- [ ] K2. Marketing emails opt-in — отдельный чекбокс?
- [ ] K3. Возрастная проверка (≥18) — дата рождения / чекбокс?
- [ ] K4. GDPR Art. 7 — timestamp consent + audit_log?

## Зафиксированные решения

| # | Решение | Источник |
|---|---|---|
| FLOW-1 | Дашборд открывается **до** оплаты (увидеть курс → ввязаться) | lottoprof 2026-05-20 |
| FLOW-2 | Оплата = подписание оферты (Terms+Refund+Privacy → audit_log) | lottoprof 2026-05-20 |
| FLOW-3 | Минимальная группа = 1 человек (клиент = основная единица, не группа) | lottoprof 2026-05-20 |
| FLOW-4 | Слоты: 2 раза в сутки (утро/вечер) × 2 раза в неделю (фиксированные пары дней) | lottoprof 2026-05-20 |
| FLOW-5 | Сначала клиент видит слоты → выбирает → потом email | lottoprof 2026-05-20 |
| FLOW-6 | Apply имеет промежуточную ценность: дашборд с описанием + countdown пока не оплатил | lottoprof 2026-05-20 |

## Открытые развилки (нужны ответы для плана)

Минимум для старта реализации:

1. **A1-A3**: anonymous + magic-link vs registered + password
2. **C1-C4**: формат слотов в UI
3. **D1, D3**: окно ожидания + источник дат старта
4. **E1, E3**: Apply → checkout flow + Stripe вариант
5. **G1, G3**: admin applications view + статусы
6. **I1-I4**: data model

Остальные блоки (B, F, H, J, K) можно решить после структуры.
