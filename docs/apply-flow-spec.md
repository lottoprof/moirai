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

- [x] A1. Apply доступен до регистрации (anonymous) или только залогиненным? → **anonymous** (FLOW-5: сначала слоты, потом email; FLOW-6: дашборд до оплаты)
- [x] A2. Если anonymous — Apply создаёт user аккаунт автоматически или отдельный шаг? → **автоматически** при submit'е contact-формы (шаг 3 флоу)
- [x] A3. Magic-link / OAuth / password — где подключается? → **magic-link** _предложение, требует подтверждения_
- [ ] A4. Повторный Apply через тот же email — разрешён?

### B. Сетка слотов

UX-порядок: слот выбирается **первым** (FLOW-5), потому что определяет
дальнейший шаг (когорта + старт + контекст для контакта).

- [x] B1. Гранулярность: "день+время" или фиксированная пара дней? → **фиксированная пара дней** (FLOW-4: 2 раза в неделю)
- [x] B2. Утро/вечер — конкретные часы или диапазон? → **2 раза в сутки утро/вечер** (FLOW-4), конкретные часы _уточнить_
- [ ] B3. Часовой пояс — фиксированный ET или конвертация под клиента?
- [ ] B4. UI: матрица 7×2 или предустановленный shortlist?
- [x] B5. Можно выбрать несколько слотов (preference order) или один? → **один** _предложение (1 slot = 1 cohort), требует подтверждения_
- [ ] B6. Откуда ограничиваются: availability инструктора или фикс пресет?
- [ ] B7. Что показываем по местам: "7/10 мест" / просто "available" / без счётчика?
- [ ] B8. Если все слоты заняты — waitlist / "next cohort" / disabled?

### C. Apply form — поля (после выбора слота)

- [x] C1. Обязательные: email, slot уже выбран — нужно ли **имя** обязательным?
- [ ] C2. Опциональные: телефон / страна / опыт / мотивация / source?
- [x] C3. Turnstile — да (как на login/register) _предложение, требует подтверждения_
- [ ] C4. Промокод/реферал — сразу или Sprint 2?

### D. Формирование группы

- [x] D1. Минимум 1 человек — стартуем сразу или окно ожидания N дней? → **стартуем по фиксированной дате независимо от размера** (FLOW-3)
- [ ] D2. Максимум 10 — что если 11-й хочет тот же слот (waitlist / next cohort)?
- [x] D3. Когда стартует cohort? → **фиксированные даты** (FLOW-3 + countdown в дашборде, нужны конкретные даты в админке)
- [ ] D4. Один клиент = одна группа или несколько одновременно?
- [ ] D5. Cohort = группа или группа = подгруппа внутри cohort?
- [ ] D6. Сколько дней дашборд живёт без оплаты (auto-expire application за N дней до старта)?

### E. Оплата

- [x] E1. Apply → сразу к оплате или Apply бесплатно? → **Apply бесплатно**, оплата из дашборда (FLOW-1, FLOW-2)
- [ ] E2. Discovery-call — для всех или только individual?
- [x] E3. Stripe Checkout (redirect) vs Elements (embedded)? → **Stripe Checkout (redirect)** _предложение для Sprint 1, требует подтверждения_
- [ ] E4. Если cohort не сформировалась — refund или авто-перенос?
- [x] E5. Что фиксируется при оплате как offer acceptance? → **audit_log event=`offer_accepted`** с user_id, ip_hash, ua, terms_version, refund_version, privacy_version, programme_id, cohort_id, amount, currency, stripe_payment_id (FLOW-2)

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

- [x] I1. `applications` отдельная или часть `enrollments` со статусом pending? → **отдельная** _предложение, требует подтверждения_
- [x] I2. User создаётся при Apply (anonymous) или связывается потом? → **создаётся при Apply** (см. A1/A2)
- [x] I3. Slots — отдельная таблица или JSON в applications? → **отдельная `slots`** + конфигурация админа (programme_id, days, time_of_day, timezone, instructor_id, max_students) _предложение_
- [x] I4. Cohorts — связь с applications/enrollments? → **`cohorts`** новая (id, programme_id, slot_id, start_date, status: forming/open/running/completed); applications.cohort_id FK _предложение_

Полная модель (предложение, требует подтверждения):

- `slots(id, programme_id, day_pair, time_of_day, timezone, instructor_id, max_students)` — конфиг админа
- `cohorts(id, programme_id, slot_id, start_date, status)` — конкретный запуск, status: forming/open/running/completed
- `applications(id, user_id, programme_id, cohort_id, status, created_at)` — статусы: submitted → dashboard_active → paid (или expired / cancelled)
- При оплате `applications.status='paid'` создаётся `enrollments` row (уже существующая таблица в схеме)

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

## Статус по блокам

| Блок | Закрыто | Открыто | Готовность |
|---|---|---|---|
| A. Точка входа | A1, A2, A3*| A4 | 3/4 |
| B. Слоты | B1, B2, B5* | B3, B4, B6, B7, B8 | 3/8 |
| C. Apply form | C1*, C3* | C2, C4 | 2/4 |
| D. Группа | D1, D3 | D2, D4, D5, D6 | 2/6 |
| E. Оплата | E1, E3*, E5 | E2, E4 | 3/5 |
| F. Коммуникации | — | F1, F2, F3, F4 | 0/4 |
| G. Admin/Instructor | — | G1, G2, G3 | 0/3 |
| H. Edge-кейсы | — | H1, H2, H3, H4, H5 | 0/5 |
| I. Data model | I1*, I2, I3*, I4* | — | 4/4 |
| J. i18n | — | J1 | 0/1 |
| K. Legal | — | K1, K2, K3, K4 | 0/4 |

`*` — требует подтверждения (мои предложения).

**Минимум для старта плана**: A4 + B (большинство) + D (большинство) +
E2/E4 + G1/G3. F/H/J/K можно решать инкрементально по ходу.
