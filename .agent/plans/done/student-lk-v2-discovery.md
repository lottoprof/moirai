# Student ЛК v2 — Discovery (pre-spec)

> Рабочий документ **перед** ТЗ. Источник: обсуждение флоу обучения
> 2026-05-31 (lottoprof) + сверка с `Architecture.md` §sessions/homework,
> `methodist-modules-guide.md`, `Methodologists_brife.md`,
> `migrations/0004_modules_enrollments.sql`, `migrations/0010_module_progress.sql`,
> текущая реализация `src/pages/[locale]/dashboard/**` (stage26).
>
> Проходим **по одному** пункту: обсуждение → решение фиксируется в
> блоке **Решение** → ставим `[x]`. Когда все закрыты — переносим решения
> в финальный spec (`docs/student-lk-v2-spec.md`) и нарезаем stage'ы.
>
> Открытые вопросы группированы: сначала видимые дыры (D), потом
> архитектурные вопросы (Q), в конце — приоритизация (P).

---

## 1. Видимые дыры в текущем ЛК (D)

Найдены при чтении кода stage26 без отдельного решения от user'a.
Закрываются либо bugfix'ом (короткий PR), либо включаются в новый stage —
определяем по ходу.

- [ ] **D1. Nav-ссылки "Modules" и "Homework" — фейковые.**
      `DashboardNav.astro:54-55` оба ведут на `/${locale}/dashboard`.
      Решение зависит от Q5 (drawer).
      **Решение:** _обсуждаем_

- [ ] **D2. StatCard "Homework" захардкожен `value={[0, ""]}`.**
      `dashboard/index.astro:322-325`. Нет таблицы `homework_submissions` →
      реальной цифры взять неоткуда.
      Закрывается вместе с Q2 (ДЗ UI).
      **Решение:** _обсуждаем_

- [ ] **D3. `homework_md` показывается plain `<p>` без формы сдачи.**
      `dashboard/modules/[slug].astro:171-176`. Студент видит prompt, но
      сдать не может. Закрывается вместе с Q2.
      **Решение:** _обсуждаем_

- [ ] **D4. Module page — нет сохранения позиции чтения.**
      `markModuleOpened` ставит `in_progress` при открытии, но scroll-position
      / "read up to" не сохраняется. Длинный модуль читается «с начала
      каждый раз». Закрытие — отдельный мелкий вопрос (Q8).
      **Решение:** _обсуждаем_

- [ ] **D5. Module page — нет prev/next навигации.**
      `dashboard/modules/[slug].astro` имеет только "← Back to modules".
      Между модулями надо возвращаться на dashboard. Перекрывается Q5 (drawer).
      **Решение:** _обсуждаем_

- [ ] **D6. Paid-студент не видит cohort schedule.**
      `dashboard/index.astro` в `paid` view: stats + Continue + module grid.
      Нет "Next session: Tue 14 May 14:00 ET", нет списка прошедших sessions
      с recordings, нет календаря. `cohort` известен (из `activeApp.cohort_id`)
      но не показан. Закрывается вместе с Q4 (sessions).
      **Решение:** _обсуждаем_

- [ ] **D7. Юникод-иконки в UI — нарушение `feedback_no_unicode_icons`.**
      `ModuleCard.astro:38` (lock), `dashboard/index.astro:154/193/289`
      (check, lock), `dashboard/modules/[slug].astro:97/112` (check).
      Заменить на inline SVG (lock + check). Bugfix.
      **Решение:** _обсуждаем_

- [ ] **D8. `/account` — корректность `currentNavKey` для account view.**
      `account.astro` рендерится на `DashboardLayout` для student'a, но
      `DashboardNav.astro` ожидает `currentKey` из {dashboard/modules/
      homework/account}. Надо проверить что `account.astro` передаёт
      `currentNavKey="account"`. Bugfix если нет.
      **Решение:** _обсуждаем_

---

## 2. Архитектурные вопросы (Q)

Каждый — самостоятельное решение. Без согласования по Q1..Q4 нельзя
писать ТЗ, потому что они меняют D1 schema и unlock-логику.

### Q1. Unlock — completion vs schedule vs гибрид

**Контекст.** Сейчас `listEnrollmentModules` + `getModuleForStudent`
(в `lib/server/student-modules.ts`) блокируют модуль N пока модуль N−1
не имеет `status='done'` в `module_progress`. `done` ставит сам студент
кнопкой "Mark complete".

Твоё описание флоу: лекции идут по расписанию когорты, ДЗ — опционально.
Препод ведёт live-сессию, разбирает старый модуль + проходит новый.

**Проблема текущего кода:** студент пропустил ДЗ → next модуль closed,
а препод уже ведёт его в Zoom. Mark complete — псевдо-самодекларация, не
привязана к фактическому разбору.

**Решение (зафиксировано 2026-06-07):**

Unlock и completion — **две независимые оси**. Mark complete у студента
убираем полностью.

**Ось 1 — Unlock модуля (schedule-only):**
- `unlocked = now >= session.scheduled_at − unlock_lead_hours`
- `unlock_lead_hours = 6h` для всех модулей (включая первый и теоретические).
- Первый модуль: `cohort.start_date − 6h`, даже если enrollment был раньше.
- Backward: прошедшие модули всегда открыты.
- **Instructor override**: explicit "open module" action в instructor UI —
  открывает конкретный модуль студенту досрочно. Кейс: студент с failed
  ДЗ продолжает программу по решению инструктора ("прослушал курс").
- Cadence когорты: **2 sessions/week** (подтверждено).

**Ось 2 — Completion модуля:**
- **Теоретический модуль (`has_homework=0`)**: auto-done через
  `theory_auto_done_delay = 1h` после `session.scheduled_at`.
- **Практический модуль (`has_homework=1`)**: done = есть `approved` или
  `auto_approved` homework submission.
- Студент НЕ ставит completion сам. "Mark complete" UI удаляется.

**Homework status (детали — относятся к Q2):**
- Values: `pending | needs_revision | approved | auto_approved`.
- При upload → автоматом `pending`.
- Препод ставит `approved` / `needs_revision` (+ опциональный коммент;
  на `needs_revision` коммент обязателен).
- **`auto_approved`** — если препод не поставил статус к моменту начала
  следующей session-date. Система автоматом переключает (lazy при query
  или cron). Default UX для студента: видит positive статус, **не**
  блокируется. Метрика дисциплины препода: % submissions прошедших ручной
  review vs auto.

**Diploma / "прослушал курс"** — организационный вопрос, не technical.
Вне scope MVP.

**Уточнения (review 2026-06-07):**

**A. Instructor override storage** — три колонки в существующей
`enrollment_modules`:
```sql
enrollment_modules (
  ...
  unlock_override_at      INTEGER,        -- nullable; если set, открывает
                                          -- модуль независимо от schedule
  unlock_override_by      TEXT REFERENCES users(id),
  unlock_override_reason  TEXT,           -- audit для admin/instructor view
);
```
Override one-way: открыли — оставили. История changes не нужна в MVP.
Условие unlock с учётом override:
```
unlocked =
  enrollment_modules.unlock_override_at IS NOT NULL
  OR now >= session.scheduled_at − unlock_lead_hours
```

**B. Locked module display:**
- В drawer / module list / pre-payment teaser показываем:
  - Номер модуля + title
  - Summary (одно предложение из metadata)
  - "Откроется DD MMM HH:mm (local) · HH:mm ET"
  - Lock icon (Q9 Phosphor Thin)
- НЕ показываем: objectives, concepts, workbook body, presentation body.
- При прямом GET `/dashboard/modules/[slug]` для locked модуля → 404
  (info-hiding, как сейчас).

**C. "Current module" определение + edge case "all caught up":**
- Current = первый module где `unlocked = true AND status != 'done'`.
- Если такого нет (все unlocked → done) но есть locked будущие:
  Continue card → заменяется на карточку "All caught up · Next module
  unlocks <date>". Без CTA, просто инфо.
- Если ни одного unlocked не осталось И нет locked будущих:
  cohort завершён → "All modules complete" с диплом-related копией
  (организационно).

**D. Late enrollment** (студент пришёл mid-cohort):
- Backward unlock работает по умолчанию — модули с прошедшими session
  доступны сразу (workbook + presentation).
- На overview показываем notice banner: "Cohort already in progress.
  Caught-up materials available. Next live session: <date>".
- Live sessions 1..N − 1 уже прошли — recordings вне scope (Q4),
  студент догоняет на static content.

**E. Cohort closed + retention window:**
- Колонка `enrollments.archived_at INTEGER` nullable (set cron'ом
  retention через 30 дней после `completed_at` — Q10).
- Все check'и доступа в SQL и guards:
  ```
  enrollment.status IN ('active','completed')
    AND enrollment.archived_at IS NULL
  ```
- Между `completed_at` и `archived_at` (= +30 дней): module pages,
  homework submissions, downloads — всё доступно.
- После `archived_at`: GET модулей → 404, homework files уже удалены
  из R2, rows hard-deleted.

**Конфигурация — все timing/limits в одном файле**

`src/lib/config/student-lk.ts`:
```ts
export const STUDENT_LK_CONFIG = {
  unlock_lead_hours: 6,
  theory_auto_done_delay_hours: 1,
  retention_grace_days: 30,
  homework_upload_cap_bytes: 100 * 1024 * 1024,    // 100 MB
  homework_deadline_warning_hours: 24,             // amber "Срок завтра"
  student_comment_max_chars: 2000,
  instructor_comment_max_chars: 10000,
  drawer_width_px: 320,
  drawer_edge_swipe_zone_px: 20,                   // mobile edge swipe area
  zoom_join_window_minutes_before: 15,             // когда "Join Zoom" active
  signed_url_expiration_hours: 24,                 // pre-signed PUT URL
  signed_get_url_ttl_seconds: 3600,                // R2 GET for playback
  gdpr_delete_mode: 'on_completion',               // 'immediate' | 'on_completion'
  pre_archive_email_days_before: 7,                // warning email
} as const;
```

Изменения = code change → deploy. Не runtime-editable (overkill для MVP).
Per-cohort параметры (cadence, session days, time_et) — в `cohort_slots`.
Secrets (Resend API key, R2 keys) — wrangler secrets.

- [x] Q1 закрыт

---

### Q2. ДЗ — full submission flow

**Контекст.** В `Architecture.md` (строки 755-770) запланированы таблицы
`homework` + `feedback` + R2-путь `homework/<group_or_user>/<sub_id>.mp4`.
В коде ничего из этого нет (`0010` — последняя миграция, `homework` нет).

Твой описанный flow:
1. Студент сдаёт ДЗ (video/file/text/PDF/table) в ЛК.
2. Препод проверяет **до** следующей сессии, фиксирует комментарии.
3. Если ДЗ-видео: препод может скачать → локально проаннотировать
   (отметки timecode, голосовой комментарий) → загрузить annotated-копию
   рядом с оригиналом.
4. Студент видит обе версии + текстовые комментарии в ЛК.

**Подвопросы (статус по ходу обсуждения):**

#### Q2a. Форматы upload + размер + транспорт — закрыт 2026-06-07

**Допустимые форматы:**

| Категория | Расширения | Mime |
|---|---|---|
| Изображение | jpg, png, webp, gif | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Текст | txt | `text/plain` |
| MS Office | xlsx, docx, pptx | `application/vnd.openxmlformats-officedocument.*` |
| OpenDocument | odt, ods, odp | `application/vnd.oasis.opendocument.*` |
| PDF | pdf | `application/pdf` |
| Видео | mp4, mov, webm | `video/mp4`, `video/quicktime`, `video/webm` |

ZIP-архивы (проекты FCP/Premiere) — **не принимаем** (нет use case в MVP,
проверка структуры zip — отдельная задача).

**Cap размера:** **100 MB** на файл. Памятка студенту: "Сжимайте видео
до отправки — MP4 H.264 720p + AAC 128kbps ≈ 50 MB на 2 минуты". FAQ-страница
с инструкцией для HandBrake / iMovie / Premiere Export.

**Транспорт — pre-signed URL pattern** (не proxy через worker):
1. Client → `POST /api/student/homework/upload-url` (auth + module_slug +
   file metadata) → worker генерирует signed PUT URL (aws4fetch, R2
   S3-compatible endpoint).
2. Client → `PUT <signed-url>` напрямую в R2. Worker не участвует
   в передаче тела файла (обход 10 ms CPU limit на free Workers).
3. Client → `POST /api/student/homework/submissions` (finalize) → worker
   создаёт row в `homework_submissions` со `status='pending'`.

Path: `homework/{enrollment_id}/{submission_id}.<ext>`.

**Cloudflare free tier работает** при этом паттерне (см. Q2a-rationale ниже).

#### Q2a-rationale: Free tier breakdown (для протокола)

| Лимит | Cap | Прогноз 1 cohort | Запас |
|---|---|---|---|
| R2 storage | 10 GB | ~6-12 GB пик | впритык, overage $0.015/GB |
| R2 Class A ops | 1M/мес | ~120 PUT | огромный |
| R2 Class B ops | 10M/мес | ~500 GET | огромный |
| R2 egress | unlimited | — | — |
| Worker requests | 3M/мес | ~150K | огромный |
| Worker CPU | **10 ms/request** | **критично** | решается pre-signed URL |
| D1 storage | 5 GB | <1 MB | огромный |
| D1 writes | 100K/день | ~50 | огромный |
| Cron Triggers | 5 jobs | 1 (retention auto-cron) | запас |

При роста до 2-3 одновременных cohort — overage R2 storage копеечный
(~$1/мес). Upgrade на Workers Paid $5/мес — когда захотим upload через
worker proxy (не нужно).

#### Q2b. Где живёт submission UI — закрыт 2026-06-07

**Module page (`/dashboard/modules/[slug]`) — табы**:
- **Presentation** | **Workbook** | **Homework**.
- Default tab — **Workbook** (главное для самостоятельной работы).
- URL state — `?tab=workbook` (для bookmark / refresh / direct link).
- Desktop — классические tabs (ARIA tabs pattern, keyboard arrow nav).
- Mobile — те же tabs + horizontal swipe gesture для переключения
  (Material-style).
- Бейдж на Homework tab — если есть submission с `needs_revision` или
  свежий feedback. Возможно auto-open этого tab'a при заходе после
  такого события (решим при имплементации).

**Homework tab — содержимое:**
- Ссылка/anchor "К описанию ДЗ" → переход в Workbook tab к секции
  `## Домашнее задание` (или короткий excerpt этой секции).
- Submission form: upload button (pre-signed URL flow из Q2a) + памятка
  про cap 100 MB.
- История submissions (last 3 + "show all"): каждая card содержит
  filename, size, дата, status badge, instructor comment (если есть),
  annotated copy link (Q2d), кнопка resubmit (на `needs_revision`).

**Aggregate `/dashboard/homework`** — отдельная страница со списком
ВСЕХ submissions across all modules:
- Фильтры: `awaiting_review` / `needs_revision` / `approved`.
- Закрывает D1: ссылка "Homework" в `DashboardNav` теперь ведёт сюда
  (не фейковая).
- Бейдж с цифрой "X needs revision" на main dashboard и в nav.

**НЕ делаем:**
- Отдельной страницы per-module homework (`/dashboard/modules/[slug]/homework`)
  — избыточно при наличии tab'a.
- Drawer для homework view (Q5 drawer — только навигация между модулями).

**Уточнения (review 2026-06-07):**

**B. Tab URL state — `replaceState`, не `pushState`.**

При tab switch — `history.replaceState({...}, '', '?tab=<new>')`.
Tab switch не считается navigation event. Browser back выводит из
module page целиком (стандарт для tab UI — Notion, Linear, GitHub).

**Sticky tabs:**
- **Desktop ≥1024** — tabs sticky на верху content area при scroll
  (сохраняет orientation на длинном workbook).
- **Tablet/mobile** — НЕ sticky (sticky уменьшает viewport заметно).

**Tab reset при module switch** — см. Q5 уточнение A (default = workbook
для нового модуля).

#### Q2c. Resubmit — закрыт неявно в Q1

История всех попыток сохраняется (1 row per upload, не overwrite).
При `needs_revision` студент перезаливает → новая row `pending` →
снова попадает в queue препода. Студент видит свою историю, препод —
все попытки этого студента.

#### Q2d. Annotated copy — закрыт 2026-06-07

**Annotated copy — опциональный путь** инструктора, не обязательный.

Препод может:
- Оставить только текстовый коммент (Q2e) — типичный путь.
- Скачать оригинал → локально проаннотировать (вырезать timecode, voice-over,
  drawn marks) → загрузить annotated файл — **дополнительный** путь для
  кейсов когда нужно показать конкретно "вот тут".
- Оба варианта одновременно.

**Schema:**
```sql
homework_submissions (
  ...
  file_r2_key                        TEXT NOT NULL,   -- оригинал студента
  instructor_annotation_r2_key       TEXT,            -- nullable
  instructor_annotation_uploaded_at  INTEGER,
  ...
);
```
Поле в той же row, без отдельной таблицы — annotated copy 1:1
с submission.

**Side-by-side player view (B)** — отложен. Annotation вшит в файл,
sync не нужен.

**Annotation track / overlay (C)** — отложен. Timestamp markers
обсуждаются в Q2e и тоже отложены.

**UI на submission card (student view):**
- "Your submission" — filename + size + Download + inline player (для video).
- Если annotated есть → secondary card "Annotated by instructor" с
  отдельным player + Download.
- Player — Vidstack (lite-load thumbnail → click → play).
- PDF — embed via `<iframe>` или native browser viewer + Download.
- Images — inline `<img>`.
- Docs / text / xlsx / etc — Download only.

**Instructor upload flow:**
- На странице `/instructor/homework/[id]` — кнопка "Upload annotated copy"
  → тот же pre-signed URL flow что у студента (Q2a).
- Cap 100 MB, та же памятка про сжатие.

#### Q2e. Comment format — закрыт 2026-06-07

**Решение: общая записка (markdown) + student_comment при upload.**

**Schema (расширение `homework_submissions`):**
```sql
homework_submissions (
  ...
  student_comment      TEXT,    -- markdown, опц., cap 2000 chars
  instructor_comment   TEXT,    -- markdown, cap 10 000 chars
  -- llm_draft_comment TEXT     -- уже из Q1
  ...
);
```

**Student comment (при upload, опционально):**
- Cap 2000 chars (markdown).
- Use cases: "переделал по вашим замечаниям", "ссылка на референс",
  "не успел доснять сцену 3, прикладываю scratch версию".
- Особенно полезно при **resubmit** — поясняет препoду что изменилось.

**Instructor comment:**
- Cap 10 000 chars (markdown).
- Markdown → HTML через `marked` (тот же rendering что workbook).
- Препод пишет в textarea с preview-кнопкой (live preview не делаем в MVP).
- **Required по статусу (из Q1):**
  - `needs_revision` → коммент обязателен (нельзя отправить пустой).
  - `approved` → коммент опциональный.
  - `auto_approved` → коммент пустой (system-set).
- **LLM pre-fill (future):** при наличии `llm_draft_comment` —
  pre-fill textarea. Препод правит / перезаписывает / принимает as-is.

**Timestamp markers (B/C из вариантов Q2e) — в § 5 Future migrations.**
Если препод/студенты запросят precise feedback на конкретные моменты
видео — добавим `submission_feedback(submission_id, ts, comment)` table
поверх. Не блокирует MVP.

#### Q2f. Уведомления — закрыт 2026-06-07

**Каналы:**
- **Email** (Resend free) — на важные события студенту.
- **In-app badge** — обеим сторонам.
- **Browser push** — отложен в § 5 Future migrations.

**Triggers:**

Студенту (email + badge):
- Препод поставил `approved` / `needs_revision` + коммент → email "Feedback
  on <module>" + badge на Homework tab + бейдж "X needs revision" на
  `/dashboard`.
- Препод залил annotated copy → тот же email/badge.

Преподу (badge only):
- Новая submission в queue (включая resubmit) → badge на nav-item
  "Homework" в `/instructor/homework` со счётчиком awaiting reviews.

НЕ нотифицируем:
- `auto_approved` — system event, не тревожим студента.
- Студентский upload preподу — только badge, без email (preпод откроет
  queue регулярно, email = шум).

**Email infrastructure:**
- Resend free ($0/мес, 3K/мес, 100/день, любые получатели, работает на
  Workers Free).
- Один template с conditional rendering (approved / needs_revision).
- Subject: `"Feedback on <module title>"`, body: status, instructor name,
  первые 200 chars коммента, CTA "View in dashboard" deep link
  `/dashboard/homework?focus=<submission_id>`.
- Reply-to: `feedback@moiraionline.pro` → Email Routing → forward на
  preпод inbox (студент может ответить).

**Email Routing (inbound)** — отдельная инфраструктурная задача, не
блокирует Q2f. Включить для:
- `support@moiraionline.pro` / `hello@moiraionline.pro` → forward.
- `noreply@moiraionline.pro` → blackhole.
- `feedback@moiraionline.pro` → forward на preподa (reply-to handling).

**Opt-out:**
- Колонка `users.notifications_email BOOLEAN NOT NULL DEFAULT 1`.
- UI в `/account` → "Notifications" секция → toggle.
- In-app badge **не отключается** (core UX).

**Storage — без отдельной notifications table:**
```sql
-- расширения существующих rows:
homework_submissions (
  ...
  feedback_email_sent_at   INTEGER,   -- nullable, чтобы не отправить 2x
  ...
);

enrollments (
  ...
  homework_last_seen_at    INTEGER,   -- обновляется при заходе на
                                      -- /dashboard/homework
  ...
);
```

**Badge computation (on-demand):**
```sql
SELECT COUNT(*) FROM homework_submissions hs
 JOIN enrollments e ON e.id = hs.enrollment_id
WHERE e.user_id = ?
  AND hs.reviewed_at IS NOT NULL
  AND hs.reviewed_at > COALESCE(e.homework_last_seen_at, 0);
```

`notifications` table добавится когда появятся другие kinds (cohort
announcements, system alerts) — пока overhead.

**Daily digest для preпoда** — отложен. Если возникнет дисциплинарная
проблема (preпод тянет с review) — добавим как cron + Resend digest.

**Pricing escape valve:**
- 3K/мес и 100/день Resend хватает на ~12 одновременных активных cohort.
- При выходе за лимит — Resend Pro $20/мес (50K/мес) или Workers Paid
  $5/мес + CF Email Service (3K/мес included + $0.35/1K).

#### Уточнения по Q2 (review 2026-06-07)

**A. Auto-approve и late submission.**

Auto-approve **только** для submissions с
`uploaded_at < next_session.scheduled_at`. Late submissions (`is_late=true`)
всегда остаются `pending` до manual review. Это предотвращает кейс
"студент сдал пустышку с опозданием → auto-approved".

Cron / lazy query:
```sql
SELECT ... FROM homework_submissions
 WHERE status = 'pending'
   AND uploaded_at < next_session.scheduled_at
   AND NOW() > next_session.scheduled_at + 1h grace
```

Late submissions для preпoда — обычная work item с меткой "Late",
видны в queue. Та же работа что для on-time — лишних действий нет.

**B. Auto-approve и needs_revision.**

Auto-approve работает **только** для status `pending`. Status
`needs_revision` НЕ переключается auto, остаётся как есть. Это уважает
явное решение преподавателя.

Если студент не отреагировал на `needs_revision`:
- Module остаётся **not done** (нет approved submission).
- Это не вина preподa — он своё решение озвучил.
- Студент видит in-app badge / email напоминание (Q2f).
- Препод не делает дополнительных действий — лишних нет.

**C. Resubmit после approved.**

Студент может resubmit в любой момент пока
`enrollment.status='active' AND archived_at IS NULL`.

- Новая submission = `pending`.
- Module остаётся `done` (есть предыдущая approved submission).
- Если новая получит `needs_revision` — module остаётся `done`
  (старая approved сохраняется).
- Module становится `not done` **только** если все approved отозваны
  (admin action, не делаем в MVP).

**Resubmit после approved помечается `priority='low'` в queue preпода.**
Препод может игнорировать без последствий (module всё равно done).
Если ответит — обычный feedback flow. Это снимает давление
"обязан смотреть все resubmit'ы".

```sql
homework_submissions (
  ...
  priority TEXT NOT NULL DEFAULT 'normal'
           CHECK(priority IN ('normal','low')),
  ...
);
```

Set `priority='low'` automatically при upload если module уже done.

**D. Pre-signed URL expiration.**

`signed_url_expiration_hours = 24` (S3 signed URL поддерживает до 7 дней,
24h комфортно для медленного интернета на 100 MB файле). В
`STUDENT_LK_CONFIG`.

**E. R2 GET access pattern.**

Submissions — приватные R2 объекты. Студент / препод НЕ получают прямой
R2 URL.

**Endpoint:** `GET /api/student/homework/submissions/[id]/file-url`
- ACL: student-owner OR lead instructor cohort'ы OR admin.
- Returns: `{ url: "https://...", expires_at: ... }` — signed GET URL,
  TTL 1 час.
- Vidstack player / `<iframe>` PDF preview / download — все идут через
  этот endpoint.

Аналогично для annotated copy: `/api/student/homework/submissions/[id]/annotation-url`.

**F. Один файл per submission.**

В MVP — один файл per submission. Если ДЗ требует видео + script —
студент делает две submission'а подряд, обе `pending`. Препод видит
как пару в queue, может approve каждую отдельно или обе.

Multi-file submission ("submission group") — overkill для MVP. В § 5
Future migrations если возникнет регулярный кейс.

**G. Finalize atomicity + orphan cleanup.**

Pre-signed URL flow:
1. Client → `POST /api/student/homework/upload-url` (с
   `idempotency_key` UUID, generated client-side).
2. Worker возвращает signed PUT URL + `submission_id`.
3. Client PUT R2 → success.
4. Client → `POST /api/student/homework/submissions` (finalize) c тем же
   `idempotency_key`.

**Если finalize fails:**
- Client retry'ит с тем же `idempotency_key`. Endpoint идемпотентный —
  второй call видит существующий submission_id, no-op.
- Если client сдался (закрыл вкладку) — orphan R2 файл.

**Orphan cleanup cron** (раз в день):
- List R2 prefix `homework/{enrollment_id}/`.
- Сравнить с D1 `homework_submissions.file_r2_key`.
- Удалить файлы старше 24h без соответствующей D1 row.

**H. Instructor ACL.**

MVP — **только lead_instructor видит submissions** своих enrollment'ов:
```sql
WHERE submission.enrollment_id IN (
  SELECT id FROM enrollments
  WHERE lead_instructor_id = current_instructor_id
    AND status IN ('active','completed')
)
```

Admin override через `/admin/homework` — cross-enrollment view без
role-фильтра.

**Co-instructors** (если потом появятся) — расширим до
`cohort_instructors(cohort_id, user_id, role)` table. Сейчас не делаем.

---

#### Q2g. Deadline — закрыт 2026-06-07

**Soft deadline = `next_session.scheduled_at` для модуля N**

То есть дата session модуля N+1, где препод разбирает ДЗ N.

**Поведение:**
- До deadline — нормальный статус, обычный UI.
- За 24h — amber бейдж "Срок завтра" / "Deadline tomorrow" в Homework tab.
- После deadline — submission получает флаг `is_late=true`. **Не блокирует**,
  просто метка.
- **Окно сдачи** — всегда открыто пока `enrollment.status='active'`. После
  archival (Q10 — 30 дней после `completed_at`) — submission flow закрыт
  вместе с retention cleanup.
- Resubmit — тот же deadline, без отдельного "deadline на исправление".
  Если препод вернул `needs_revision` за день до next session — студенту
  стоит поторопиться; если уже после — `is_late=true` на всех попытках.

**Late влияет только как метка:**
- Late submission может стать `approved` без проблем.
- Препод видит "Late" в queue + опц. фильтр / сортировка по late.
- Не используется как блокирующий фактор где-либо.

**Notification:**
- **In-app** только: amber бейдж "Срок завтра" в Homework tab + бейдж
  на main `/dashboard`.
- **НЕТ email** "deadline approaching" — иначе спам (12 модулей × email
  за 24h = 12 reminder'ов на cohort).

**Storage:**
```sql
homework_submissions (
  ...
  is_late BOOLEAN NOT NULL DEFAULT 0,   -- set at upload time:
                                        -- uploaded_at > next_session.scheduled_at
  ...
);
```

**Решение:** _обсуждаем_

- [ ] Q2 закрыт

---

### Q3. Workbook — отдельный артефакт или семантика body?

**Контекст.** Сейчас один markdown в R2 (`modules/{slug}.{locale}.md`)
делает всё одновременно: опорный материал, чтение, prompt для ДЗ.
В маркетинге (`moirai_site_text.md:98,146`) есть "Course Workbook" — но
это плейсхолдер, без отдельного поля в schema.

Твоё описание: workbook = опорный материал лекции, доступный в ЛК. Может
быть отдельно от того что показывается на "трансляции".

**Решение (зафиксировано 2026-06-07):**

Модуль состоит из **двух markdown-артефактов** + ДЗ как секция в workbook.

**Структура контента:**

1. **Presentation** (`presentation.{locale}.md`) — короткое полотно
   для live: тезисы, графики, YT-ссылки-примеры. Препод share-screen'ит
   во время Zoom-сессии. Студент тоже видит — для пересмотра.
2. **Workbook** (`workbook.{locale}.md`) — длинный материал для
   самостоятельной работы: текст, графика, таблицы, теоретические
   объяснения. **Содержит описание ДЗ** в финальной секции
   `## Домашнее задание`.

**Schema changes:**
```sql
modules (
  ...
  presentation_r2_key  TEXT NOT NULL,   -- new
  workbook_r2_key      TEXT NOT NULL,   -- new (фактически current body)
  -- body_r2_key       — переименовываем в workbook_r2_key
  -- homework_md       — УДАЛЯЕМ (описание ДЗ переезжает в workbook)
  ...
)
```

**R2 layout** (каталог per module, согласно
`methodist-modules-guide.md:22-31`):
```
modules/
  beg-01-lumiere-frame/
    presentation.en.md
    presentation.ru.md
    workbook.en.md
    workbook.ru.md
    images/                 — assets для markdown (Sprint 2 image uploads)
```

**Migration существующих 48 modules:**
- Текущий `modules/{slug}.{locale}.md` → `modules/{slug}/workbook.{locale}.md`
- `modules.homework_md` → concat в конец workbook'a как
  `## Домашнее задание\n\n{homework_md}`.
- `presentation.{locale}.md` — добавляет methodist (новый артефакт, мы
  можем seed-нуть пустой шаблон).

**Rendering:**
- Server-side через `marked` → HTML (как сейчас работает в
  `dashboard/modules/[slug].astro:67-74`).
- Один компонент `<MarkdownContent md={...} />` для обоих артефактов.
- Стили `.prose` (h2/h3/p/ul/ol/blockquote/code/table). Адаптив:
  - Таблицы — wrapper `overflow-x: auto`.
  - Images — `max-width: 100%; height: auto`.
  - YT embeds — `aspect-ratio: 16/9` (Q6 решает embed pattern).
  - Code blocks — `overflow-x: auto`.
- PDF download copies — не делаем сейчас.

**Methodist workflow update** (обновляем `docs/methodist-modules-guide.md`):
- Раньше один student_book.md → теперь presentation.md + workbook.md.
- ДЗ описание — в workbook, не в metadata.

- [x] Q3 закрыт

---

### Q4. Sessions — cohort расписание в ЛК

**Контекст.** В `Architecture.md` строки 732-749 запланированы `sessions`,
`session_participants`, `session_modules`. Не реализовано. `cohorts`
есть (используется в pre-payment view), `sessions` нет.

После Q1 sessions стали обязательны: unlock считается от
`session.scheduled_at − 6h`.

**Решение (зафиксировано 2026-06-07):**

**Schema:**
```sql
sessions (
  id              TEXT PRIMARY KEY,
  cohort_id       TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  module_slug     TEXT NOT NULL,           -- 1:1 mapping (Q4f)
  order_idx       INTEGER NOT NULL,
  scheduled_at    INTEGER NOT NULL,        -- UTC unix
  zoom_url        TEXT,                    -- override; NULL → cohort.zoom_url
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK(status IN ('scheduled','passed','cancelled','rescheduled')),
  notes           TEXT,                    -- admin internal
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
```

`cohorts` расширяется: `+ zoom_url TEXT` (persistent recurring meeting).

`session_participants` — НЕ делаем (attendance видно по Zoom report).

**Recordings — out of scope полностью.**
"Это как записывать лекции в аудитории — никто смотреть не будет."
Полей `recording_url` / `recording_kind` в schema нет. Если потребуется
в будущем — пойдём через Whisper transcript, не video storage.

**Q4a — auto-generate.** При создании cohort'ы service берёт
`programme.default_modules[]` + `cohort.start_date` + `cohort_slot.days_json`
+ `time_et` → автоматом генерит N rows в `sessions`. Admin потом правит
отдельные даты для праздников/переносов через UI.

**Q4b — `cohort.zoom_url` (one persistent).** Per-session `zoom_url`
опциональный override для редких случаев.

**Q4c — отменено** (см. recordings выше).

**Q4d — UTC хранение + browser-local + ET display.**
Формат: `"Tue, 14 May · 9:00 (your time) · 14:00 ET"`.
Через `Intl.DateTimeFormat`, без user-settings timezone.

**Q4e — три места:**
1. `/dashboard` overview — виджет "Next session" (одна карточка): дата
   локально + ET, module title, "Join Zoom" (active за 15 мин до начала).
2. `/dashboard/sessions` — список всех sessions cohort'ы (past + upcoming).
3. `/dashboard/modules/[slug]` — строка вверху: "Live session: <date>,
   <time> · Join Zoom".

**Q4f — 1:1** (`sessions.module_slug` напрямую). N:N через junction
table не делаем (избыточно для MVP).

**Cadence:** 2 sessions/week (подтверждено в Q1).

**Уточнения (review 2026-06-07):**

**A. Programme changes vs cohort snapshot.**

При создании cohort'ы копируем `programme.default_modules[]` в
`cohorts.modules_snapshot_json` — фиксированный список модулей для
этой cohort'ы.

```sql
cohorts (
  ...
  modules_snapshot_json TEXT NOT NULL,  -- ["beg-01-...","beg-02-...",...]
  ...
);
```

Sessions auto-generate на основе snapshot. Если methodist изменит
`programme.default_modules` после — **active cohorts не затрагиваются**.
Только новые cohorts получат изменённый список.

`enrollment_modules` для новых enrollment'ов заполняется из
`cohort.modules_snapshot_json` (не из `programme.default_modules`
напрямую) — это гарантирует консистентность всех enrollment'ов одной
cohort'ы.

**B. Cancelled session — interplay с Q1/Q2.**

- **Unlock module** срабатывает по `session.scheduled_at` independent
  от status (включая `cancelled`). Студент имеет static material
  (workbook + presentation) даже если live не было.
- **Auto-done теоретического** (Q1, has_homework=0) — срабатывает
  через `theory_auto_done_delay = 1h` после `session.scheduled_at`,
  independent of cancelled status.
- **Auto-approve homework** (Q2 review §A) — привязан к **next
  non-cancelled session**. Если session 5 cancelled — auto-approve
  trigger для submission'ов module 4 смещается на session 6 date.
  Это даёт студенту дополнительное время сдать ДЗ при переносах.

Computation:
```sql
SELECT MIN(scheduled_at) FROM sessions
 WHERE cohort_id = ?
   AND status != 'cancelled'
   AND order_idx > current_module_order
```

**C. cohort.start_date change — auto-cascade.**

При UPDATE `cohorts.start_date`:
- Service / trigger пересчитывает `sessions.scheduled_at` для всех
  sessions со `status='scheduled'` (не cancelled, не passed) сдвигом
  на delta `new − old`.
- `status='passed'` / `cancelled` / `rescheduled` — НЕ трогаем
  (historical).
- Admin потом может override individual sessions через UI.

Кейс: cohort starts 1 June → admin переносит на 8 June → все upcoming
sessions сдвигаются на +7 дней автоматом.

**D. Zoom URL fallback chain.**

```
display_zoom_url = session.zoom_url ?? cohort.zoom_url ?? null
```

Если `null` — "Join Zoom" button скрывается, replaced на placeholder
"Zoom link will appear closer to the session" (i18n). Даёт admin'у
grace period настроить link после создания cohort.

**E. DST-aware auto-generation.**

Sessions stored в UTC unix timestamp. При auto-generation конверсия
`(date + cohort.time_et) → UTC` делается **per session** с учётом DST.

Кейс: cohort starts 1 March (EST UTC-5), длится 8 недель, проходит
DST transition 9 March (EDT UTC-4). Sessions до 9 March конвертятся
с offset −5, после — с offset −4.

Implementation:
- Используем `Temporal` API (если Edge supports) или библиотеку
  `date-fns-tz` (lightweight, edge-compat).
- Per-session compute, не bulk.

`cohort.time_et` хранится как `"HH:MM"` строка (без offset). Offset
вычисляется per date.

- [x] Q4 закрыт

---

### Q5. Drawer navigation для модулей

**Контекст.** Текущая nav: top bar (Dashboard/Modules/Homework/Account),
"Modules" и "Homework" → /dashboard (D1). На module page — только
"← Back to modules".

Твоё предложение: drawer с list всех модулей программы, слайдается с
края экрана, открывается кнопкой или edge-swipe.

**Решение (зафиксировано 2026-06-07):**

**Q5a — drawer дополняет top nav, не заменяет.**

Top nav остаётся для primary destinations. "Modules" link убираем
(закрывает D1) — становится drawer trigger. "Homework" остаётся как
ссылка на `/dashboard/homework` (aggregate page из Q2b).

Top nav after Q5:
```
[Logo]  Dashboard  Sessions  Homework  Account  [Sign out]
[Hamburger ← drawer trigger на mobile]
```

**Q5b — только модули программы** + progress meta:
- Programme title в шапке drawer.
- Progress bar: "3 / 12 done".
- List модулей в order_idx:
  - `done` — приглушённый + check SVG icon (Q9).
  - `in_progress` / current — highlighted amber.
  - `locked` — серый + lock SVG icon (Q9).
- Каждый item — ссылка на `/dashboard/modules/[slug]`.

Sessions / Homework / Resources — НЕ дублируем (они top-level pages).

**Q5c — drawer доступен на всех страницах внутри `/dashboard/`:**
- `/dashboard` overview — trigger в Dashboard hero ("Все модули") +
  на desktop permanent sidebar.
- `/dashboard/modules/[slug]` — drawer sticky, на desktop permanent
  sidebar open by default.
- `/dashboard/homework`, `/dashboard/sessions` — через hamburger.

**Q5d — responsive поведение:**

| Breakpoint | Поведение |
|---|---|
| Desktop ≥1024px | **Permanent sidebar**, **open by default**, можно collapse кнопкой |
| Tablet 768-1023 | Overlay drawer (hamburger trigger, tap-outside-to-close) |
| Mobile <768 | Overlay + edge swipe gesture (left-swipe edge → open) |

**Position:** **left side** (стандарт для nav).
**Width:** **320px** (комфортно для permanent sidebar с прогресс
индикатором + module titles).

**Q5e — persistence:**
- Desktop: localStorage key `moirai.drawer.open` запоминает последнее
  состояние (открыт/закрыт).
- Mobile/tablet: всегда закрыт по умолчанию (overlay-стиль не нужно
  persistent).

**Доп: prev/next в module page footer (закрывает D5)**

В дополнение к drawer — footer-навигация на module page:
- `← Previous module` (если есть unlocked предыдущий).
- `Next module →` (если есть unlocked следующий).
- Между ними — link "Back to all modules" (открывает drawer overlay
  на mobile или фокусирует sidebar на desktop).

Drawer — для skip-around (быстро перейти к любому модулю).
Prev/next — для линейного движения по программе.

**Закрывает D1 + D5.**

**Уточнения (review 2026-06-07):**

**A. Tab reset при module switch через drawer.**

При клике на module в drawer — URL переход на
`/dashboard/modules/<new-slug>` БЕЗ наследования `?tab=`. Default tab
для нового модуля — `workbook` (Q2b). Homework / Presentation context
у каждого модуля свой, наследование запутает.

**C. Mobile — edge swipe zone (drawer vs tab swipe).**

- Левые **20px** от края → drawer edge swipe.
- Остальная область → tab swipe (Q2b).
- При открытом overlay drawer — tab swipe blocked (drawer overlay
  блокирует touch на content).

Зафиксировать в `STUDENT_LK_CONFIG`:
```ts
drawer_edge_swipe_zone_px: 20,
```

**D. Drawer visibility — только active/paid enrollment.**

- `enrollment.status='awaiting_payment'` — drawer **hidden**.
  Pre-payment view (`pp-curriculum` teaser с locked модулями) остаётся
  как есть.
- `enrollment.status IN ('active','completed') AND archived_at IS NULL`
  — drawer показывается.
- `no_application` (нет enrollment'a) — drawer hidden.
- `archived` (Q1.E — после retention 30 дней) — dashboard заблокирован
  целиком, drawer не существует.

**F. Scroll lock при overlay drawer на mobile/tablet.**

При open overlay drawer:
- `document.body.style.overflow = 'hidden'` (body не scroll'ится).
- Tap outside drawer / Esc / hamburger click → close + restore overflow.

Permanent sidebar на desktop ≥1024 — не требует lock (drawer не overlay).

- [x] Q5 закрыт

---

### Q6. YouTube / Vimeo embed в body модуля

**Контекст.** Body рендерится через `marked` в `set:html`. YT-ссылка в
markdown сейчас превращается в обычный `<a href>` — открывается в новой
вкладке на youtube.com, вырывая студента из ЛК. У нас Vidstack уже
интегрирован (`/works/[slug]`), есть lite-load YT embed pattern.

**Решение (зафиксировано 2026-06-07):**

**Auto-detect raw URL в markdown** — самый прозрачный вариант для
methodist'а:
- Параграф = **только URL** на отдельной строке → заменяем на lite-load
  YT embed.
- URL в тексте (`[clip](url)` или inline) → остаётся обычной `<a>`.

**Supported URL форматы (regex):**
- `https://www.youtube.com/watch?v=<id>`
- `https://youtube.com/watch?v=<id>`
- `https://youtu.be/<id>`
- `https://www.youtube.com/embed/<id>`

Параметр `?t=120` (start time) — передаём в iframe как `?start=120`.
Важно для film references ("посмотрите эпизод с 2:00").

**Marked extension** — `src/lib/markdown/extensions/youtube.ts`. Используется
общим компонентом `<MarkdownContent>` (Q3).

**Lite-load pattern:**

1. **Render output (statically generated):**
   ```html
   <div class="yt-embed" data-video-id="ABC123" data-start="120">
     <img src="https://img.youtube.com/vi/ABC123/maxresdefault.jpg"
          alt="Video preview" loading="lazy">
     <button class="yt-embed__play" aria-label="Play video">
       <svg>...play icon...</svg>
     </button>
   </div>
   ```

2. **Vanilla JS** на page-level (один listener):
   - `document.querySelectorAll('.yt-embed')` → click handler.
   - Click → swap на `<iframe src="https://www.youtube.com/embed/${id}?
     autoplay=1&rel=0&playsinline=1&start=${start}">`.

3. **Не Astro island** — markdown rendered как `set:html`, компоненты
   не работают. Vanilla JS обходит этот ограничитель.

**Adaptive CSS:**
```css
.yt-embed {
  aspect-ratio: 16 / 9;
  max-width: 100%;
  position: relative;
}
.yt-embed img { width: 100%; height: 100%; object-fit: cover; }
.yt-embed__play { /* centered play button overlay */ }
```

**Privacy:**
- YT cookies не грузятся до клика (lite-load fix).
- `youtube.com/embed` (не `youtube-nocookie.com` — зафиксировано в
  `seo-markup-rules.md` после anti-bot инцидента).

**Schema.org:**
- Body модуля — paid content, не индексируется (`/dashboard` под auth).
- `VideoObject` JSON-LD НЕ добавляем (на `/works/[slug]` остаётся —
  public).

**MVP — только YouTube.**

**Vimeo + кастомный синтаксис (`::video[...]`)** — в § 5 Future
migrations. Vimeo требует fetch через oembed API на каждый thumbnail
(нет static URL), при текущем film-course use case 95% references
будут YT.

- [x] Q6 закрыт

Твоё требование: ссылка на видео в материале должна открываться через
наш встроенный плеер.

**Варианты.**
1. **Кастомный markdown синтаксис.** `[youtube:DJUO8FJv1CE]` или
   `:::video src=...` → custom marked extension → рендерит Vidstack
   placeholder. Чисто, но методист должен знать синтаксис.
2. **Auto-detect raw URL.** Если в body параграф = только YT/Vimeo URL,
   заменяем на lite-load embed. Методист пишет ссылки как обычно.
3. **Frontmatter `videos: [...]`.** Список ID в metadata, рендерится
   отдельной секцией "Видео по теме". Не привязано к месту в тексте.

**Решение:** _обсуждаем_

- [ ] Q6 закрыт

---

### Q7. Presentation mode — Zoom screen-share-friendly view

**Контекст.** Препод ведёт в Zoom, share-screen'ит страницу модуля.
После Q1 (Mark complete убран) и Q3 (Presentation tab — короткое
полотно лекции) — нужен специальный layout без dashboard chrome,
с увеличенной типографикой.

**Решение (зафиксировано 2026-06-07):**

**URL:** `/dashboard/modules/[slug]/present` (отдельный route, не query
параметр — чище для bookmark / share-link).

**Access:** те же ACL что у main module page — student с enrollment'ом
в cohort + instructor (lead). Не "instructor-only" — студент тоже
может использовать для self-study на большом экране.

**Layout:**

Скрываем:
- Top dashboard nav.
- Drawer (Q5).
- Tabs (Presentation / Workbook / Homework) — только Presentation
  content.
- Homework section / submission UI.
- Sessions info / Zoom link.

Оставляем:
- Минимальный header: module title + "× Exit" в правом верхнем углу.
  **Title скрывается** после первого scroll-down (sticky-translate-out).
  Exit-button остаётся sticky.
- Presentation markdown через `<MarkdownContent>` (Q3) + YT embeds (Q6).
- Footer навигация: `← Previous module` / `Next module →`.

**Typography (увеличенная — Zoom share-screen viewer'ы видят small
windows):**
- h1 ~56-64px
- h2 ~36-42px
- h3 ~24-28px
- body 22-24px
- container max-width 1200px, generous padding

**Theme:** **dark** (консистенция с остальным сайтом, Zoom monitor
показывает dark нормально). Не делаем light theme override.

**Keyboard nav:**
- `←` / `→` — prev / next module.
- `Esc` — exit с **confirmation modal** ("Точно выйти из режима
  презентации?" / "Exit presentation mode?") — preпод случайно
  нажал Esc → шанс показать студентам dashboard. Confirm → переход
  на main module page (tab Presentation).
- `F` — fullscreen toggle (`document.documentElement.requestFullscreen()`).

**Trigger:** на main module page, Presentation tab — кнопка "Open in
presentation mode" → `target="_blank"` → новая вкладка → fullscreen →
share Zoom.

**НЕ делаем в MVP:**
- Slide-by-slide режим (manual `---` breaks + keyboard slide nav) —
  § 5 Future migrations.
- Speaker notes (private notes под слайдами) — нет.
- Pointer / laser — overkill.

**Уточнения (review 2026-06-07):**

**E. Empty content placeholders.**

Если methodist ещё не загрузил `presentation.md` / `workbook.md`:

- **Presentation tab пустой** → placeholder "Materials will be available
  before the live session" + дата session (i18n).
- **Workbook tab пустой** → placeholder "Workbook materials are being
  prepared" (i18n).
- **Homework tab** — всегда доступен (даже при пустом workbook —
  description ДЗ может быть в metadata или TBA-stub).
- **Presentation mode (`/present`) при пустом** → render placeholder
  в large typography, без CTA.
- **Если оба artifact'а пусты** → module page показывает hero с
  combined placeholder, без tabs (edge case "methodist совсем не
  подготовил").

- [x] Q7 закрыт

---

### Q8. Read-position / progress tracking — глубина

**Контекст.** Сейчас `markModuleOpened` = одно событие "первый GET страницы".
Для большого модуля (10-30 экранов) хочется знать «студент дочитал до конца».

**Решение (зафиксировано 2026-06-07): не делаем в MVP.**

Q1 убрал Mark complete у студента. Completion определяется instructor
action (homework approved) или auto (auto_approved / theory модуль через
час). Scroll-position — это UX-улучшение, не функциональная необходимость.
Workbooks не настолько длинные (несколько экранов), студент скроллит
вручную без больших потерь.

**В § 5 Future migrations:** если methodist'ы начнут писать workbooks
по 30+ экранов или появится запрос "продолжить с того места где был" —
добавим IntersectionObserver + `last_scroll_pct INT 0..100` колонку
в `module_progress`.

**D4 переходит в Future migrations** вместе с этим.

- [x] Q8 закрыт

---

### Q9. Юникод-иконки — что взамен

**Контекст.** D7 — нарушение `feedback_no_unicode_icons`. Lucide-style
(stroke 1.5) корпоративный, не соответствует editorial duo Cormorant +
Manrope. Нужен thinner, typographic feel.

**Решение (зафиксировано 2026-06-07):**

**Icon set: Phosphor Thin** (MIT license).
- Stroke 8 в viewBox 256×256 (тонкая editorial-engraving линия).
- Open-source MIT — копируем SVG paths свободно, **без npm-deps**.
- Огромный набор (~1000 icons) — на будущее тоже хватит.

**Источник:** https://phosphoricons.com (фильтр weight=Thin).
Paths копируем из `@phosphor-icons/core` GitHub repo либо с сайта.

**Размещение: `src/components/icons/`** — per-icon Astro components,
tree-shakable, явный импорт.

**Size mapping (фиксированный):**

| Контекст | Size |
|---|---|
| Inline в body text, статусы в cards | 14 |
| Кнопки, badges, inline action triggers | 20 |
| Nav items, drawer trigger, footer nav | 24 |

**Иконки MVP:**

| Component | Phosphor name | Где используется |
|---|---|---|
| `Lock.astro` | `lock-thin` | locked модули (ModuleCard, drawer, pp-module-stub) |
| `Check.astro` | `check-thin` | done статусы в текстах |
| `CheckCircle.astro` | `check-circle-thin` | альт — drawer done items |
| `ArrowLeft.astro` | `arrow-left-thin` | prev module (footer nav) |
| `ArrowRight.astro` | `arrow-right-thin` | next module (footer nav) |
| `CaretLeft.astro` | `caret-left-thin` | inline chevron, expand toggle |
| `CaretRight.astro` | `caret-right-thin` | inline chevron, expand toggle |
| `List.astro` | `list-thin` | drawer trigger (hamburger) |
| `X.astro` | `x-thin` | presentation exit, modal close |
| `Play.astro` | `play-thin` | YT embed play button (Q6) |

**Пример компонента:**
```astro
---
// src/components/icons/Lock.astro
interface Props { size?: number; class?: string; }
const { size = 20, class: className } = Astro.props;
---
<svg width={size} height={size} viewBox="0 0 256 256" fill="none"
     stroke="currentColor" stroke-width="8"
     stroke-linecap="round" stroke-linejoin="round"
     class={className} aria-hidden="true">
  <!-- Phosphor Thin lock path -->
  <rect x="40" y="88" width="176" height="128" rx="8"/>
  <path d="M88 88V56a40 40 0 0 1 80 0v32"/>
</svg>
```

**Места замены (D7):**

| Файл | Строка | Сейчас | Заменить на |
|---|---|---|---|
| `src/components/dashboard/ModuleCard.astro` | 38 | `🔒` | `<Lock size={14} />` |
| `src/pages/[locale]/dashboard/index.astro` | 154, 193 | `✓` в i18n strings | template-conditional + `<Check size={14} />` |
| `src/pages/[locale]/dashboard/index.astro` | 289 | `🔒` | `<Lock size={14} />` |
| `src/pages/[locale]/dashboard/modules/[slug].astro` | 97, 112 | `✓` в i18n strings | template-conditional + `<Check size={14} />` |

**Перенос Unicode из i18n strings в template:** иконка рендерится
отдельно от текста, через conditional:

```astro
{status === "done" && <Check size={14} />}
{t.statusLabel}
```

**Закрывает D7.**

- [x] Q9 закрыт

---

### Q10. Retention — хранение ДЗ и комментариев препода

**Контекст.** После Q1+Q2 у нас появятся:
- `homework_submissions` rows в D1 (status, comment, reviewer_id, timestamps)
- Files в R2 (`homework/{enrollment_id}/{submission_id}.<ext>` — видео, PDF,
  тексты)
- Instructor annotated copies (`homework/{enrollment_id}/{submission_id}.annotated.<ext>`)

User raised: **"хранение комментариев препода для ДЗ и их удаление
после диплома"**. То есть после завершения программы (выдача diploma
или "прослушал курс") — данные удаляются.

Это пересекается с compliance:
- GDPR (Art.17 — right to erasure, EU users)
- 152-ФЗ (RU users)
- Educational records retention (US/RU/EU — обычно 3-7 лет, но мы не
  гос. учреждение, разные правила)

**Подвопросы.**

- **Q10a. Trigger удаления.** Что запускает delete:
  1. Admin button "Close enrollment" → cascading delete files+rows.
  2. End of cohort + N дней grace period (auto-cron).
  3. По запросу студента (GDPR right to be forgotten).
  4. Все три варианта (manual + auto + by-request).

- **Q10b. Что удаляется.** Несколько уровней:
  1. **Files only** (R2): удаляем submissions + annotated. Rows в D1
     остаются как audit log (status, timestamps, instructor_id, no body).
  2. **Files + rows**: hard delete всего. Минус — теряем статистику
     "сколько ДЗ сдал, сколько раз нужна revision".
  3. **Soft archive**: status='archived', files перемещаются в cold
     storage (или просто остаются). Полное удаление по explicit запросу.

- **Q10c. Aggregate stats — сохраняем?**
  Anonimized counters: "у студента N submissions, M approved, X
  auto_approved" — для общей программной аналитики. Если да —
  отдельная таблица `enrollment_stats` (filled при close).

- **Q10d. Сколько хранится "перед удалением".**
  Сразу после diploma? + 30 дней grace? + 1 год для disputes?

- **Q10e. Instructor comments — отдельная судьба?**
  User упомянул именно их. Возможно instructor comments **более ценны**
  чем submission files — могут быть полезны для improving curriculum
  (анонимизированно). Сохранять как learning corpus (без user link)?

- **Q10f. Что делать если cohort ещё не завершён, но user удалил
  account?** (GDPR scenario) — cascade delete всего его enrollment'a +
  homework? Или anonymize (user_id → NULL, files delete)?

**Решение (зафиксировано 2026-06-07):**

**Trigger удаления:**
- Auto-cron: через **30 дней** после `enrollment.completed_at` →
  cascading delete.
- GDPR-button в `/account` ("Delete my data"): немедленный hard delete
  без grace, anonymize связанных rows.

**Что удаляется (hard):**
- R2 files: `homework/{enrollment_id}/*` (original submissions +
  instructor annotated copies).
- D1 rows: `homework_submissions` для этого enrollment'a.

**Что сохраняется:**

1. **Aggregate stats** — таблица `enrollment_stats`:
   ```sql
   enrollment_stats (
     enrollment_id    TEXT PRIMARY KEY,
     cohort_id        TEXT NOT NULL,
     programme_slug   TEXT NOT NULL,
     total_submissions       INTEGER NOT NULL,
     approved_count          INTEGER NOT NULL,
     needs_revision_count    INTEGER NOT NULL,
     auto_approved_count     INTEGER NOT NULL,
     completed_at     INTEGER NOT NULL,
     archived_at      INTEGER NOT NULL
   );
   ```
   Заполняется в момент архивации. Без user PII (только enrollment_id
   как FK на оставшийся enrollment row).

2. **Instructor comments → `curriculum_feedback`** (анонимно по user'у,
   но с cohort context):
   ```sql
   curriculum_feedback (
     id               TEXT PRIMARY KEY,
     cohort_id        TEXT NOT NULL,    -- сохраняем (user req)
     module_slug      TEXT NOT NULL,    -- для curriculum analysis
     instructor_id    TEXT,             -- staff, можно сохранить
     homework_status  TEXT NOT NULL,    -- approved|needs_revision|auto_approved
     comment_text     TEXT NOT NULL,
     original_at      INTEGER NOT NULL  -- когда коммент был оставлен
   );
   ```
   user_id / enrollment_id / submission_id — **не** переносим
   (анонимизация).

**Side effect:** появляется `cohort_number` или `cohort.label` —
нужно проверить что cohorts уже имеет читаемый идентификатор для
curriculum_feedback context.

**Уточнения (review 2026-06-07):**

**A. GDPR delete — параметр `gdpr_delete_mode`.**

Default: **`on_completion`** (отложить delete homework data до конца
программы — контракт исполняется до конца, студент не теряет место).

```ts
// STUDENT_LK_CONFIG
gdpr_delete_mode: 'immediate' | 'on_completion',  // default 'on_completion'
```

Behavior matrix:

| Mode | enrollment status | Действие при GDPR request |
|---|---|---|
| `on_completion` | `active`/`awaiting_payment` | Set `gdpr_delete_requested_at`, студент продолжает |
| `on_completion` | `completed`/`cancelled` | Skip 30-day grace, delete now |
| `immediate` | `active`/`awaiting_payment` | Cancel enrollment + delete now |
| `immediate` | `completed`/`cancelled` | Skip grace, delete now |

**Personal account data (email, password, OAuth)** удаляются НЕМЕДЛЕННО
независимо от mode — это критично для GDPR Art.17 right-to-erasure
basic compliance. User не может login после request, даже если homework
data ещё ждёт on_completion.

Schema:
```sql
enrollments (
  ...
  gdpr_delete_requested_at INTEGER,   -- nullable; flag для on_completion mode
  ...
);
```

При `gdpr_delete_requested_at IS NOT NULL` — retention cron вычисляет
trigger как `MAX(completed_at, cancelled_at)` без +30 grace.

**B. Cancelled enrollments — retention trigger.**

Добавить колонку:
```sql
enrollments (
  ...
  cancelled_at INTEGER,    -- set при cancel/refund admin action
  ...
);
```

Retention trigger расширяется:
```sql
SELECT * FROM enrollments
 WHERE archived_at IS NULL
   AND (
     (completed_at IS NOT NULL AND now > completed_at + 30 days)
     OR
     (cancelled_at IS NOT NULL AND now > cancelled_at + 30 days)
     OR
     (gdpr_delete_requested_at IS NOT NULL AND
      status IN ('completed','cancelled'))
   );
```

**C. User row при GDPR delete.**

Soft delete user row (hard delete нельзя из-за FK references):
```sql
users (
  ...
  deleted_at INTEGER,    -- timestamp GDPR/account delete
  ...
);
```

При GDPR delete:
- `users.deleted_at = now`.
- `users.email = NULL` (или hashed marker `deleted_<userId>`).
- `users.password_hash = NULL`.
- `user_auth_methods` — DELETE все rows (revoke OAuth).
- `auth_sessions` — `UPDATE SET revoked_at = now WHERE user_id = ?`.

User не может login. Аккаунт effectively уничтожен, но FK references
(enrollments, instructor_id в reviews, audit_log) сохраняются на
soft-deleted row.

**D. Atomic archive transaction.**

D1 batch transaction (`db.batch([...])`) для archival cron:
1. INSERT `enrollment_stats` (aggregate counters).
2. INSERT `curriculum_feedback` rows (анонимные instructor comments).
3. UPDATE `enrollments SET archived_at = now`.
4. DELETE `homework_submissions WHERE enrollment_id = ?`.
5. (R2 files delete — отдельно, post-transaction, idempotent retry).

Если transaction fails — rollback, retry next cron pass. R2 delete
best-effort через orphan-cleanup cron (Q2.G).

**E. GDPR delete UI — confirmation modal.**

В `/account` → секция "Delete my data":
- Button "Delete my account permanently".
- Modal: "Это удалит все ваши данные навсегда. Введите DELETE чтобы
  подтвердить".
- Input field — кнопка "Delete" enabled только при exact `DELETE`.
- Confirm → `POST /api/account/delete` → cascading delete (according
  to gdpr_delete_mode + status) → logout → redirect /.
- Footer note: "Cannot be undone."

**F. Pre-archive email notification.**

За **7 дней до archival** — email "Your homework submissions will be
removed in 7 days. Download what you need now."

```sql
enrollments (
  ...
  pre_archive_email_sent_at INTEGER,   -- nullable, idempotency
  ...
);
```

Cron каждый день сканирует:
```sql
WHERE archived_at IS NULL
  AND pre_archive_email_sent_at IS NULL
  AND (
    (completed_at IS NOT NULL AND now BETWEEN completed_at + 23 days
                              AND completed_at + 24 days)
    OR (cancelled_at IS NOT NULL AND now BETWEEN cancelled_at + 23 days
                              AND cancelled_at + 24 days)
  )
```

Resend email + `SET pre_archive_email_sent_at = now`.

**G. Race condition cron + manual GDPR.**

Все archival operations идempotent через `WHERE archived_at IS NULL`.
Параллельные triggers (cron + user manual) → один UPDATE выиграет
condition, второй no-op. Никакой явной locking не требуется.

**H. Hard delete — permanent.**

No backups в MVP. Документируем в `/account`: "Cannot be undone."
Если будет требование "soft archive 7 дней" — добавим в § 5 Future
migrations (move files в `archive/` prefix вместо delete, restore
within 7 days).

- [x] Q10 закрыт

---

## 3. Приоритизация (P)

После того как Q1..Q9 закрыты, нарезаем порядок stage'ей. Текущая
гипотеза очерёдности (правится по ходу обсуждения):

- [ ] **P0** — schema: новые таблицы `homework_submissions`,
      `homework_feedback`, `sessions`, `session_participants` +
      возможно `modules.workbook_r2_key` (если Q3 = вариант 2).
      Без этого следующие этапы парализованы.
- [ ] **P1** — unlock refactor (Q1) + sessions display (Q4 базовый):
      студент видит cohort schedule.
- [ ] **P2** — ДЗ submission UI (Q2): форма + список + feedback view.
      Большой stage, может потребовать разбивки.
- [ ] **P3** — Instructor side: review queue + annotated upload.
      Без него P2 не закрывает loop.
- [ ] **P4** — Drawer navigation (Q5) + presentation mode (Q7).
      UI-улучшения, не блокируют функциональность.
- [ ] **P5** — YT embed (Q6) + read-position tracking (Q8) + D7 cleanup.
      Косметика.

**Решение по приоритетам:** _обсуждаем после закрытия Q1..Q9_

- [ ] Приоритизация закрыта

---

## 4. Что НЕ обсуждаем в этом раунде

Зафиксировано чтобы не разбегаться:

- Homework сдан группой vs individually (Architecture.md упоминает
  `group_id`) — оставляем individually для MVP.
- Live session embedded Zoom plugin (Zoom Web SDK) — не делаем,
  Zoom остаётся как external app.
- Mobile design pass (stage25) — отдельный план, deferred.
- Light theme infrastructure (stage10) — отдельный план, deferred.
- Cohort chat / discussion — не входит ни в один из вопросов выше,
  Sprint 3+.
- Notes / bookmarks per module — Sprint 3+.

## 5. Future migrations / planned upgrades

Зафиксировано чтобы не потерять — не делаем сейчас, но точно
понадобится при росте/жалобах.

### Cloudflare Stream — managed video pipeline

**Trigger миграции:** первая жалоба студента "не могу сжать видео до
100 MB" или жалоба препода "не могу нормально посмотреть/перемотать".

**Что меняется:**
- Видео грузятся в CF Stream (любой формат, до 30 GB).
- Stream автоматом делает H.264 + HLS adaptive bitrate, thumbnails,
  scrubbing preview.
- Получаем `video_id`, играем через Vidstack или Stream player.

**Цена:** $5/1000 мин storage + $1/1000 мин delivery. Прогноз для cohort
10 студентов = ~$2/мес.

**Миграция:** добавить `homework_submissions.media_type` (`'r2_file' |
'stream_video'`) + polymorphic display. Старые submissions остаются на R2,
новые видео идут в Stream. Никакой data migration.

### Slide-by-slide presentation mode

**Trigger:** препод хочет keynote-style лекции — manual slide breaks,
keyboard листание, прогресс-индикатор.

**Что меняется:**
- Marked extension: `---` отдельная строка = slide break.
- Presentation mode (Q7) — keyboard arrows листают по слайдам
  (а не prev/next module).
- Optional: speaker notes под слайдами (private, видны только preподу).
- Optional: slide thumbnails sidebar.

**Не делаем сейчас** — Q7 MVP = scrollable markdown, preпод сам
скроллит. Keynote-режим — отдельный продукт.

### Vimeo embed + кастомный markdown синтаксис

**Trigger:** methodist хочет вставить Vimeo-клип в body, или нужны
параметры (start time через явный синтаксис, mute, autoplay-on-scroll).

**Что меняется:**
- Кастомный синтаксис `::video[https://vimeo.com/123]{start=120 mute}`
  в marked extension.
- Vimeo thumbnail через oembed API (`https://vimeo.com/api/oembed.json?
  url=...`) — fetch на server при render body, кэш в R2 / KV.

**Не делаем сейчас** — Vimeo нужен <5% случаев, oembed fetch добавляет
latency на body render, кэш-пайплайн — отдельная инфраструктура.

### Read-position / scroll tracking в module page

**Trigger:** methodist'ы пишут workbooks по 30+ экранов, либо запрос
"продолжить с того места где был".

**Что меняется:**
- `module_progress` колонка `last_scroll_pct INT 0..100`.
- IntersectionObserver на body sections → debounced PUT progress.
- При возврате на module page — auto-scroll к сохранённой точке.

**Не делаем сейчас** — Mark complete убран (Q1), workbook не длинный,
mvp scroll нужен и сам.

### Browser push notifications

**Trigger:** запрос студентов / preпoдов "хочу видеть feedback сразу,
не дожидаясь email".

**Что меняется:**
- Service worker registration в ЛК.
- VAPID keys generation.
- Push subscription endpoint `/api/student/push/subscribe`.
- Backend trigger дублирует email channel (тот же payload, push API
  через web-push library).
- Permission prompt в UI.

**Pre-requisites:** HTTPS (есть), service worker setup, browser push
subscription management.

**Не делаем сейчас** — overkill для MVP, добавляет complexity. Email +
in-app badge покрывают 95% случаев.

### Cloudflare Email Service — native sending

**Trigger:** переходим на Workers Paid plan ($5/мес) по другой причине
(server-side upload processing, длинные CPU задачи).

**Что меняется:**
- Заменяем Resend на CF Email Service через native binding `env.SEB.send()`.
- Та же 3K/мес included quota, $0.35/1K после.
- Никаких внешних API keys.

**Не делаем сейчас** — Resend free $0 vs Workers Paid $5/мес для той же
квоты. Apple-to-apple для нашего масштаба невыгодно.

### Whisper — транскрипция live sessions

**Trigger:** запрос на "запись sessions для пересмотра" (хотя в Q4
зафиксировано что recordings вне scope — никто смотреть не будет).
Если запрос всё-таки появится — делаем не video recording, а **текстовую
транскрипцию** через Whisper. Дёшево по storage, searchable.

### Workers Paid plan ($5/мес)

**Trigger:** R2 storage стабильно >50 GB, или потребуется upload через
worker proxy (например, для server-side обработки файла).
