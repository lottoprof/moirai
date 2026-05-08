# common: review

Универсальный protocol code review. Полный чек-лист
reviewer-агента — в `agents/reviewer.md`.

## Перед review

- Подтянуть изменения локально (или открыть PR в браузере).
- Прогнать quality gates (`rules/quality-gates.md`):

  ```bash
  npm run lint
  npm run typecheck
  npm run build
  ```

- Если что-то падает — это уже блокер, дальше не идём.

## Что смотрим

1. **Соответствие задаче.** Каждая изменённая строка трассируется
   до пункта задачи. Лишние правки — повод спросить «зачем это?».
2. **Boundaries** (`rules/boundaries.md`). Public / app / server
   слои не перепутаны.
3. **Edge-compat** (`rules/edge-compat.md`). Никаких Node API в
   runtime-коде.
4. **Security** (`rules/security.md`). Секреты, валидация ввода,
   auth-guard на защищённых роутах.
5. **Schema-changes** (`agents/schema.md`). Если затронуты
   `schema/` — миграция новая, не модифицирует старые.
6. **Зависимости.** Новые пакеты прошли edge-compat-чек
   (`skills/js-ts/deps.md`).
7. **Тесты.** Юнит / интеграционный покрытие соответствует
   изменению (если в проекте принят явный стандарт).

## Формат фидбэка

- **Critical** — блокирует merge: security, edge-compat, schema
  drift, broken build.
- **Warning** — сильно рекомендуется: boundaries violations,
  inconsistent shapes, отсутствие auth-guard.
- **Info** — стилистика, naming, мелкие улучшения.

Каждый пункт — файл:строка + рекомендация. Без расплывчатых
комментариев.

## После review

- Critical — обратно автору с handoff-спекой.
- Warning / Info — в ответе reviewer'а; merge на усмотрение лида.
