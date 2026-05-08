---
name: vidstack
description: Use this skill when integrating Vidstack media player into the dashboard zone (ЛК) as an Astro island. Covers component placement, hydration directive choice, theme/icons import, source/poster handling, and SSR boundaries. Read before adding video/audio components to src/components/dashboard.
---

# Vidstack — Media Player Skill

## Зона действия

Vidstack используется **только в личном кабинете**
(`src/pages/[locale]/dashboard/**`, `src/components/dashboard/**`).
В публичном слое плеер запрещён по правилу `boundaries.md`. В
публичной галерее `/works` используется native `<video>`.

## Установка

```bash
pnpm add vidstack
```

Vidstack — Web Components + framework-обёртки. Под Astro работает в
двух режимах:

1. **Vanilla web components** — `<media-player>` напрямую в `.astro`
   с `client:idle` для гидрации.
2. **Через framework-интеграцию** (React/Svelte/Vue) — если в
   проекте принята одна из этих интеграций отдельным решением.

Дефолт для moirai — **vanilla web components**, чтобы не тащить
дополнительный фреймворк ради плеера.

## Базовая интеграция (vanilla web component)

```astro
---
// src/components/dashboard/Player.astro
---
<media-player
  title="Video"
  src="https://media.example/path.m3u8"
  poster="/posters/video.jpg"
  crossorigin
  playsinline
>
  <media-provider></media-provider>
  <media-video-layout></media-video-layout>
</media-player>

<script>
  // Загружаем плеер только на клиенте, в защищённой зоне
  import "vidstack/player";
  import "vidstack/player/ui";
  import "vidstack/player/styles/default/theme.css";
  import "vidstack/player/styles/default/layouts/video.css";
</script>
```

Astro автоматически:
- хостит и бандлит инлайн `<script>`;
- грузит CSS из `import` в скрипте.

## Использование в странице

```astro
---
// src/pages/[locale]/dashboard/modules/[id].astro
import DashboardLayout from "@/layouts/dashboard/DashboardLayout.astro";
import Player from "@/components/dashboard/Player.astro";

// серверная часть: проверка доступа, получение src/poster
const env = Astro.locals.runtime.env;
// const item = await fetchItem(env, Astro.params.id);
---
<DashboardLayout>
  <Player />
</DashboardLayout>
```

Если плеер вынесен в островной компонент на фреймворке (React/Svelte
и т.п.), гидрация — `client:idle` или `client:visible`.

## Источники видео

- HLS (`*.m3u8`) — Vidstack умеет нативно (с авто-fallback на
  hls.js, если браузер не поддерживает).
- DASH (`*.mpd`) — через dash.js, подключается опционально.
- Прогрессивный MP4 / WebM — нативно.

Источники подавать через атрибут `src` или массив `<source>`. Для
адаптивного стриминга держать манифест на R2 / стороннем CDN.

## Обработка событий (если нужно)

```html
<script>
  const player = document.querySelector("media-player");
  player.addEventListener("playing", () => { /* analytics */ });
  player.addEventListener("ended", () => { /* next item */ });
</script>
```

Аналитика — через API-эндпоинт (`fetch('/api/track', ...)`),
а не напрямую к биндингам (на клиенте они недоступны).

## SSR-граница

- `<media-player>` рендерится сервером как пустой web-component, до
  гидрации показывает poster (через CSS).
- Для критичных страниц (быстрая отдача first paint) — использовать
  `client:visible`, чтобы плеер гидрировался при появлении в viewport.

## Темы и иконки

Vidstack даёт две темы:
- `default` — нейтральный layout (импортируется выше).
- `plyr` — стиль Plyr.

Кастомизация — через CSS-переменные. См. документацию Vidstack для
полного списка.

## Pitfalls

1. **Импорт стилей вне scoped `<style>`** — глобальный CSS Vidstack
   может конфликтовать с публичными стилями. Использовать только в
   `app/`.
2. **Подключение в публичном слое** — нарушение boundaries.md. Если
   нужен публичный плеер — отдельное архитектурное решение в
   `decisions.md`.
3. **`crossorigin`** — обязателен для HLS с сабтайтлами / отдельными
   аудиодорожками.
4. **Bundle size** — Vidstack tree-shake-able, но layouts тащат
   заметный CSS. Не подключать в layouts/public.
