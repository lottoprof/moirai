# Decisions (manifest)

Индекс архитектурных решений проекта **moirai**.
Полные записи (Контекст / Решение / Альтернативы / Причина) живут
в `decisions_archive.md` и читаются по требованию.

**Правило ведения:** новое решение — 1 строка сюда + полное тело
в archive. Перед работой в затронутой зоне — `grep` по дате/заголовку
в archive, потом действие.

## 2026-05

- **2026-05-08** — Стек проекта: Astro 5 (TS) + `@astrojs/cloudflare`
  adapter + Cloudflare Pages; публичный SEO-слой = vanilla JS +
  CSS-only анимации; защищённая зона (ЛК) = Astro islands +
  Vidstack; деплой и dev — через wrangler.
