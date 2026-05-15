# Security Rules (moirai)

Безопасность обязательна. Без исключений.

## Секреты

- **Никогда** не коммитить секреты, токены, API-ключи в репозиторий.
- Локально — `.dev.vars` в корне проекта. Файл в `.gitignore`.
  `wrangler pages dev` подхватывает его автоматически.
- Production — `wrangler pages secret put <NAME>` (на конкретный
  Pages project). Чтение в коде — через
  `Astro.locals.runtime.env.<NAME>`.
- Не логировать секреты, токены, заголовки с авторизацией.

### Чтение secret-containing файлов

**Никогда не использовать `Read` tool** на файлах с секретами:
`.env`, `.env.*`, `.dev.vars`, `.secrets`, `secrets/**`, `*.pem`,
`*.key`, любой файл который содержит API-ключи / OAuth Client Secret /
DB credentials / etc.

**Причина:** `Read` показывает содержимое в conversation context →
секрет попадает в transcript сессии (Anthropic logs / hypothetical
breach). Даже если файл локальный и gitignored — после Read его
значение **уже не локальное**.

**Правильный паттерн — `grep + pipe`** (значение проходит через
shell streams, не попадает в наш контекст):

```bash
# Загрузить OAuth secret в production без leak в transcript
grep "^Client secret=" .secrets | sed 's/^Client secret=//' | \
  wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name moirai

# Добавить в .dev.vars через redirect (значение не echo'ится)
{ echo "GOOGLE_CLIENT_SECRET=$(grep '^Client secret=' .secrets | sed 's/^Client secret=//')"; } >> .dev.vars
```

Bash-переменные внутри одной команды (`VAR=$(grep ...); echo "X=$VAR" >> file`)
тоже безопасны — значение не echo'ится в stdout, только через `>>`
в файл уходит. Стdout агенту видим, файл — нет.

**Если нужно показать факт что секрет получен** — log только длину
или префикс/маску:
```bash
echo "GOOGLE_CLIENT_SECRET length=${#VAR}"
# или
echo "GOOGLE_CLIENT_SECRET=${VAR:0:8}..."
```

**Что делать если по ошибке прочитал через Read:** немедленно
сообщить пользователю и рекомендовать **rotate секрет** (выдать
новое значение взамен скомпрометированного). Старый secret из
transcript уже не убрать.

### Список secret-containing файлов в проекте

В `.gitignore` уже исключены:
`.env`, `.env.*`, `.dev.vars`, `.secrets`, `secrets/**`, `*.pem`, `*.key`.
Если появятся новые форматы (например `.secrets.local`, `*.token`) —
добавлять в `.gitignore` + сюда сразу.

## Шифрование

- Только Web Crypto API (`crypto.subtle`).
- Чувствительные значения, хранящиеся в KV/D1/R2 — шифровать
  AES-GCM с уникальным IV на запись.
- Мастер-ключ (`MASTER_SECRET` или эквивалент) — только через
  `wrangler pages secret put`, никогда в коде или конфиге.

## Валидация ввода

- Любой внешний ввод (params, query, body, заголовки, события
  webhook) — валидируется (zod / валидным аналогом) до использования.
- Cookie / JWT с проверкой подписи и срока действия.
- Ошибки валидации — короткие, без утечки внутренней структуры.

## Защищённая зона (ЛК + admin)

- Доступ к `src/pages/[locale]/dashboard/**`, `src/pages/admin/**`
  и `src/pages/api/**` (где требуется авторизация) — через
  `src/middleware.ts` и/или явный guard в начале handler'а.
- `/admin/**` дополнительно проверяет `users.role = 'admin'`.
- Сессии — в KV; токены сессий — opaque, неугадываемые
  (`crypto.getRandomValues`).
- CSRF / SameSite куки — настроены явно.
- Никогда не доверять `Astro.cookies` без проверки подписи.

## SSRF / external API

- Список разрешённых внешних хостов вынесен в конфигурацию (если
  применимо).
- Не передавать пользовательский URL в `fetch` без allowlist'а.
- Не возвращать ответ внешнего API напрямую без санитизации.

## Если сомневаешься — выбирай безопаснее.
