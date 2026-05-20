# Apply flow — spec

**Status**: in discussion · **Updated**: 2026-05-20 · **Owner**: lottoprof

Документ фиксирует обсуждение UX и архитектуры Apply-флоу до старта
реализации (stage14). Растёт по мере ответов на вопросы. План
(`.agent/plans/active/stage14-apply.md`) создаётся когда спека закрыта.

## Текущий флоу (high-level, 6 шагов)

```
1. /[locale]/                       Hero CTA "Apply now"
              ↓
2. /[locale]/apply (anonymous)      ВЫБОР СЛОТА (FLOW-12,13,14)
   - List view, grouped by programme, с фильтрами
   - Каждый слот: программа + пара дней + время + старт +
     гибридный spot count (FLOW-13)
   - "1:1 at group price" бейдж при ≤ 2 (FLOW-11)
   - Клик → выбран
              ↓
3. /[locale]/apply/contact          ID
   - Email + имя + Turnstile
   - Submit → INSERT user + application(status='awaiting_payment')
   - createRefreshSession() → Set-Cookie (FLOW-16)
   - Send welcome email с magic-link (save-point convenience)
   - Redirect → /dashboard
              ↓
4. /[locale]/dashboard (logged in, БЕЗ ОПЛАТЫ)   FLOW-17
   - Защищён только session-cookie (низкая ценность данных)
   - Application summary + countdown до старта
   - Curriculum teaser, инструкторы — locked модули
   - Banner: "Set password optional · welcome email sent"
   - КНОПКА "Pay now → start the course"
              ↓
5. /[locale]/checkout                FLOW-18
   - Краткая сводка заказа
   - ОБЯЗАТЕЛЬНО: установка пароля (новые password fields)
   - ОБЯЗАТЕЛЬНО: чекбокс "I accept Terms · Refund · Privacy"
   - Pay button disabled пока оба не выполнены
   - На submit → set password + redirect to Stripe Checkout
              ↓
6. Stripe Checkout (external)        FLOW-9 / E3
   - Карточные данные, 3DS, webhooks
   - Success → callback /api/checkout/success
              ↓
7. /api/checkout/success → audit_log event='offer_accepted' (FLOW-2 / E5)
   - INSERT audit_log с user_id, ip_hash, ua, terms_version,
     refund_version, privacy_version, programme_id, cohort_id,
     amount, currency, stripe_payment_id
   - UPDATE application.status='paid' + INSERT enrollment
              ↓
8. /[locale]/dashboard (paid, full access)
   - Все модули, сессии, homework, инструктор разлочены
```

Recovery flow (любой шаг после 3):

- Клиент logged out → /login → "Email me a sign-in link" → свежий
  token TTL 30 мин → клик из email → залогинен (FLOW-19)

**Ключевое решение** (lottoprof, 2026-05-20):
- Клиент попадает в дашборд **ДО оплаты** — повышает конверсию (видит что покупает, "ввязывается")
- Оплата = подписание оферты (Terms + Refund + Privacy acceptance в audit_log)
- Группа минимум 1 человек — когорта стартует на фиксированной дате независимо от размера

## Список вопросов

### A. Регистрация vs Apply: точка входа

- [x] A1. Apply доступен до регистрации (anonymous) или только залогиненным? → **anonymous** (FLOW-5: сначала слоты, потом email; FLOW-6: дашборд до оплаты)
- [x] A2. Если anonymous — Apply создаёт user аккаунт автоматически или отдельный шаг? → **автоматически** при submit'е contact-формы (шаг 3 флоу)
- [x] A3. Magic-link / OAuth / password — где подключается? → **immediate session при Apply + magic-link как fallback** (FLOW-16, FLOW-19). Пароль — на checkout-step (FLOW-18)
- [ ] A4. Повторный Apply через тот же email — разрешён?

### B. Сетка слотов

UX-порядок: слот выбирается **первым** (FLOW-5), потому что определяет
дальнейший шаг (когорта + старт + контекст для контакта).

- [x] B1. Гранулярность: "день+время" или фиксированная пара дней? → **фиксированная пара дней** (FLOW-4: 2 раза в неделю)
- [x] B2. Утро/вечер — конкретные часы или диапазон? → **2 раза в сутки утро/вечер** (FLOW-4), конкретные часы _уточнить (предложение: 09:00 ET morning, 19:00 ET evening)_
- [ ] B3. Часовой пояс — фиксированный ET или конвертация под клиента? _предложение: фикс ET для cohort schedule (инструкторы из NY), клиент видит и свою TZ tooltip'ом_
- [x] B4. UI: матрица 7×2 или предустановленный shortlist? → **list view сгруппированный по programme** (FLOW-12)
- [x] B5. Можно выбрать несколько слотов (preference order) или один? → **один** (1 slot = 1 cohort заявка)
- [x] B6. Откуда ограничиваются slots? → **админ-конфиг** (FLOW-10): admin задаёт slots × programmes × instructors, скрипт auto-публикует cohorts на 12 мес (FLOW-7)
- [x] B7. Что показываем по местам? → **гибрид** (FLOW-13): > 5 spots → "available"; ≤ 5 → "N left"; ≤ 2 → "1:1 at group price"
- [x] B8. Если все слоты заняты? → **N/A**: grid auto-публикует следующую cohort (FLOW-7, без waitlist'a)
- [x] B9. Фильтры? → programme / day_pair / time_of_day / period, обязательны сразу (FLOW-14)
- [x] B10. Где хранится cohort? → **D1** таблица (FLOW-15)

### C. Apply form — поля (после выбора слота)

- [x] C1. Обязательные: email, slot уже выбран — нужно ли **имя** обязательным?
- [ ] C2. Опциональные: телефон / страна / опыт / мотивация / source?
- [x] C3. Turnstile — да (как на login/register) _предложение, требует подтверждения_
- [ ] C4. Промокод/реферал — сразу или Sprint 2?

### D. Формирование группы

- [x] D1. Минимум 1 человек — стартуем сразу или окно ожидания N дней? → **стартуем по фиксированной дате независимо от размера** (FLOW-3, FLOW-11)
- [x] D2. Максимум 10 — что если 11-й хочет тот же слот? → **берёт следующую auto-published cohort** (FLOW-7 без waitlist'a)
- [x] D3. Когда стартует cohort? → **фиксированные даты** из админ-сетки (FLOW-3, FLOW-7, FLOW-8)
- [ ] D4. Один клиент = одна программа активна одновременно или несколько (например Beginner + AI module)?
- [x] D5. Cohort = группа или группа = подгруппа внутри cohort? → **cohort = run** (1 slot × 1 программа × 1 start date); группа = N студентов внутри cohort'ы. При N ≤ 2 — reframe в Individual (FLOW-11)
- [x] D6. Сколько дней дашборд живёт без оплаты? → **бессрочно** (pay anytime, FLOW-9). Дашборд закрывается только при отмене application или старте курса без оплаты

### E. Оплата

- [x] E1. Apply → сразу к оплате или Apply бесплатно? → **Apply бесплатно**, оплата из дашборда (FLOW-1, FLOW-2)
- [ ] E2. Discovery-call — для всех или только individual?
- [x] E3. Stripe Checkout (redirect) vs Elements (embedded)? → **Stripe Checkout (redirect)** _предложение для Sprint 1, требует подтверждения_
- [x] E4. Если cohort не сформировалась — refund или авто-перенос? → **N/A**: cohort всегда run'ится; при 1-2 студентах переквалифицируется в Individual (FLOW-11) — маркетинговое позиционирование "вы получили индивидуальную программу"
- [x] E5. Что фиксируется при оплате как offer acceptance? → **audit_log event=`offer_accepted`** с user_id, ip_hash, ua, terms_version, refund_version, privacy_version, programme_id, cohort_id, amount, currency, stripe_payment_id (FLOW-2)
- [x] E6. Refund schedule — **3 окна** (FLOW-9a):
  - От apply до T-14: **100% refund**
  - T-14 → T-7: **50% refund**
  - T-7 → T: **только credit/transfer на следующую cohort**, no cash refund
  - После T (старт курса): **no refund** (digital content consumed per EU Directive 2011/83 Art. 16(m))

### F. Коммуникации после Apply

- [x] F1. Confirmation email сразу — что в нём? → **welcome email с magic-link** save-point (FLOW-16); содержание: подтверждение Apply + slot info + magic-link + ссылки на login/account. **Confirmation email при payment success** — Sprint 1 (FLOW-23)
- [x] F2. Notification инструктору — где? → **Sprint 1: ничего**; Sprint 2: email/dashboard alert при оплате студента в его cohort'е (FLOW-23 → потом)
- [x] F3. Когда группа собирается — auto-email? → **N/A**: cohorts auto-published на 12 мес, нет момента "собралась" (FLOW-7). Reminder email "cohort starts in 7 days" — Sprint 2
- [x] F4. Дашборд если apply есть но enrollment не active — что показывать? → **Application summary + countdown + curriculum teaser + Pay now CTA** (FLOW-17 + flow diagram шаг 4)

### G. Видимость в admin/instructor

- [x] G1. Apply-список — где? → **`/admin/applications`** (FLOW-20): tabs + filters + bulk + row actions + drawer с детальной info
- [x] G2. Инструктор видит applications своего слота или всех? → **только свои cohorts** (`lead_instructor_id = current_user`), без payment сумм и audit log оплаты (FLOW-21)
- [x] G3. Какие статусы? → **awaiting_payment → paid → running → completed** + ветки cancelled / expired / refunded (FLOW-22)
- [x] G4. Notifications? → **минимум Sprint 1**: только client confirmation email при payment success (FLOW-23). Остальное Sprint 2
- [x] G5. Audit log events? → **6 типов** для apply flow (FLOW-24)

### H. Edge-кейсы

- [x] H1. Apply без free слотов? → **N/A**: grid auto-публикуется на 12 мес вперёд, всегда есть свободные cohorts (FLOW-7)
- [ ] H2. Дубль Apply (email+programme+cohort) — заменяет / отклоняется / показывает существующий?
- [ ] H3. Apply на archived programme — 404 / disabled?
- [ ] H4. Apply на individual programme — отдельный flow (discovery-call)? _уточнить: или Individual теперь = любая cohort с 1-2 студентами по FLOW-11, а старая "individual"-programma остаётся для custom-плана?_
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

- [x] K1. Чекбокс Terms+Privacy — где? → **На checkout-step** (FLOW-18), а не на Apply. Apply — низкая ценность, чекбокс там был бы лишним friction. На checkout формулировка покрывает Terms + Refund + Privacy одним чекбоксом. Payment = explicit consent moment (FLOW-2)
- [ ] K2. Marketing emails opt-in — отдельный чекбокс?
- [ ] K3. Возрастная проверка (≥18) — дата рождения / чекбокс?
- [x] K4. GDPR Art. 7 timestamp consent — **audit_log event=`offer_accepted`** (FLOW-2, E5) с user_id, ip_hash, ua, terms_version, refund_version, privacy_version, payment_id. Это и есть GDPR proof of consent

## Зафиксированные решения

| # | Решение | Источник |
|---|---|---|
| FLOW-1 | Дашборд открывается **до** оплаты (увидеть курс → ввязаться) | lottoprof 2026-05-20 |
| FLOW-2 | Оплата = подписание оферты (Terms+Refund+Privacy → audit_log) | lottoprof 2026-05-20 |
| FLOW-3 | Минимальная группа = 1 человек (клиент = основная единица, не группа) | lottoprof 2026-05-20 |
| FLOW-4 | Слоты: 2 раза в сутки (утро/вечер) × 2 раза в неделю (фиксированные пары дней) | lottoprof 2026-05-20 |
| FLOW-5 | Сначала клиент видит слоты → выбирает → потом email | lottoprof 2026-05-20 |
| FLOW-6 | Apply имеет промежуточную ценность: дашборд с описанием + countdown пока не оплатил | lottoprof 2026-05-20 |
| FLOW-7 | Без waitlist'a. Сетка cohorts auto-публикуется на горизонт 12 месяцев из админ-конфига (slots × programmes × instructors) | lottoprof 2026-05-20 |
| FLOW-8 | Длительность курса рассчитывается: `lessons / sessions_per_week` → недель. Beginner ~6.5w, Intermediate ~8.5w, Bundle ~15w | lottoprof 2026-05-20 |
| FLOW-9 | Payment window — **B (pay anytime)**. Дашборд имеет CTA "Pay now" сразу после Apply. Защита от late cancellations через 3 refund-окна (см. FLOW-9a) | lottoprof 2026-05-20 |
| FLOW-9a | Refund policy 3 окна: до T-14: 100%; T-14 до T-7: 50%; T-7 до T: только credit/transfer; после T: no refund | lottoprof 2026-05-20 |
| FLOW-10 | Конфигурация slots / cohorts / instructor availability / start_dates — через admin LK (Sprint 2). До этого — правка через коллекцию + redeploy | lottoprof 2026-05-20 |
| FLOW-11 | Минимальная группа = 1 (cohort всегда run'ится). При 1-2 студентах **переквалифицируется в Individual** — маркетинговый ход "вы получили индивидуальную программу со скидкой". Инструктор может вручную merge близкие cohorts (договорившись со студентами) | lottoprof 2026-05-20 |
| FLOW-12 | Slot UI: list view, сгруппированный по programme. Календарь-сетка отвергнута (overkill для ~4 программ × ~6 cohorts) | lottoprof 2026-05-20 |
| FLOW-13 | Spot count — **гибрид**: > 5 → "available"; ≤ 5 → "N spots left" (urgency); ≤ 2 → "1:1 at group price · individual bonus" (FLOW-11 reframe) | lottoprof 2026-05-20 |
| FLOW-14 | Фильтры обязательны сразу: programme · day_pair · time_of_day · period (next 30d / 3mo / year). Default: all / all / all / next 3mo | lottoprof 2026-05-20 |
| FLOW-15 | Cohorts хранятся в **D1** (не Content Collection). Static — programmes; dynamic — cohorts (apply_count, even-by-event обновления через админ-API) | lottoprof 2026-05-20 |
| FLOW-16 | Apply submit → **immediate session** (HttpOnly cookie) + welcome email с magic-link (save-point convenience). Без email-click required для входа в дашборд в той же вкладке | lottoprof 2026-05-20 |
| FLOW-17 | Pre-payment dashboard защищён только session-cookie + magic-link fallback. Без обязательного пароля — низкая ценность данных (только application + публичный teaser курса) | lottoprof 2026-05-20 |
| FLOW-18 | На **checkout-step** перед оплатой — **обязательная установка пароля** + accept-чекбокс Terms/Refund/Privacy. Кнопка Pay disabled пока оба условия не выполнены. Гейт стоит на деньги + paid контент | lottoprof 2026-05-20 |
| FLOW-19 | Magic-link — fallback recovery flow. На `/login` кнопка "Send me a sign-in link" → сервер генерит свежий token (TTL 30 мин) → шлёт email. Тот же KV-механизм что password-reset | lottoprof 2026-05-20 |
| FLOW-20 | `/admin/applications` view: tabs со счётчиками (All / Awaiting payment / Paid / Running / Cancelled / Expired / Refunded), фильтры (programme / cohort / status / date range / search), row actions (View / Contact / Transfer / Cancel / Trigger refund), bulk (cancel + export CSV), drawer с детальной info + audit log per application | lottoprof 2026-05-20 |
| FLOW-21 | Instructor view `/[locale]/instructor/` — секции **"My upcoming cohorts"** (с paid/awaiting counts + days-until-start) и **"My active cohorts"** (week N of M + homework awaiting). Click → детальная cohort page со списком студентов. Не видит чужих cohorts, payment сумм, audit log оплаты | lottoprof 2026-05-20 |
| FLOW-22 | Application status machine: **awaiting_payment → paid → running → completed** + 3 terminal branches **cancelled / expired / refunded**. Переходы фиксируются в audit_log event=`application_status_changed` с from/to/actor/reason | lottoprof 2026-05-20 |
| FLOW-23 | Notifications минимум Sprint 1: **только client confirmation email при payment success** (Resend transactional). Остальные (admin digest / instructor alerts / cohort-start reminders) — Sprint 2 | lottoprof 2026-05-20 |
| FLOW-24 | Audit log apply-events (6 типов): `apply_submitted`, `offer_accepted` (FLOW-2), `application_status_changed`, `application_cancelled`, `application_transferred`, `refund_processed`. Все с user_id + ip_hash + ua + metadata JSON | lottoprof 2026-05-20 |

## Статус по блокам

| Блок | Закрыто | Открыто | Готовность |
|---|---|---|---|
| A. Точка входа | A1, A2, A3* | A4 | 3/4 |
| B. Слоты | B1, B2, B4, B5, B6, B7, B8, B9, B10 | B3 | 9/10 |
| C. Apply form | C1*, C3* | C2, C4 | 2/4 |
| D. Группа | D1, D2, D3, D5, D6 | D4 | 5/6 |
| E. Оплата | E1, E3*, E4, E5, E6 | E2 | 5/6 |
| F. Коммуникации | F1, F2, F3, F4 | — | 4/4 |
| G. Admin/Instructor | G1, G2, G3, G4, G5 | — | 5/5 |
| H. Edge-кейсы | H1 | H2, H3, H4, H5 | 1/5 |
| I. Data model | I1*, I2, I3*, I4* | — | 4/4 |
| J. i18n | — | J1 | 0/1 |
| K. Legal | K1, K4 | K2, K3 | 2/4 |

`*` — требует подтверждения (мои предложения).

**Минимум для старта плана**: A4, B3/B4/B6/B7/B8, C2/C4, D4, E2, G всё,
H2-H5, K1/K3.

## Production TODOs (sync с прочими доками после спеки)

1. **`src/content/legal/refund.{en,ru}.mdx`** — переписать §3 (Refunds outside EU)
   на 3-окна FLOW-9a. Текущий placeholder использует упрощённую модель.
2. **Programme `individual.{en,ru}.mdx`** — переосмыслить позиционирование
   с учётом FLOW-11 (потенциальный конфликт: cohort с 1 студентом ≈ individual)
3. **`docs/methodist-modules-guide.md`** — добавить раздел про
   `lessons` → `cohort.duration_weeks` расчёт.
