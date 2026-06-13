/*
 * src/lib/markdown/extensions/youtube.ts
 *
 * Marked extension — auto-detect YouTube URLs в одиночных параграфах
 * и заменяет на lite-load embed (Student LK v2 Stage E/E4 + Q6).
 *
 * Detection: параграф состоит ИЗ ТОЛЬКО URL (один URL на строке, без
 * другого текста) → заменяем. Inline ссылки `[text](url)` остаются <a>.
 *
 * URL форматы:
 *   https://www.youtube.com/watch?v=<id>
 *   https://youtube.com/watch?v=<id>
 *   https://youtu.be/<id>
 *   https://www.youtube.com/embed/<id>
 *
 * Optional ?t=<sec> → ?start=<sec> в iframe.
 *
 * Output HTML — lite-load placeholder:
 *   <div class="yt-embed" data-video-id="<id>" data-start="<sec>">
 *     <img src="https://img.youtube.com/vi/<id>/maxresdefault.jpg" alt="" loading="lazy">
 *     <button class="yt-embed__play" aria-label="Play">[svg]</button>
 *   </div>
 *
 * Vanilla JS на странице swap'ит div на iframe при клике (см.
 * MarkdownContent.astro).
 *
 * Spec: docs/student-lk-v2-spec.md § 5.7.
 */

import type { MarkedExtension, Tokens } from 'marked';

const YT_REGEX = /^https?:\/\/(?:(?:www\.)?youtube\.com\/watch\?v=|youtu\.be\/|(?:www\.)?youtube\.com\/embed\/)([A-Za-z0-9_-]{11})(?:[&?]t=(\d+))?/;

function parseYouTubeUrl(text: string): { id: string; start: number | null } | null {
  const trimmed = text.trim();
  const m = YT_REGEX.exec(trimmed);
  if (!m) return null;
  return {
    id: m[1],
    start: m[2] ? Number.parseInt(m[2], 10) : null,
  };
}

/**
 * Marked extension для auto-detect YT в:
 *   1. Standalone paragraph URL — конвертится в lite-load poster
 *      (.yt-embed div, click swap на iframe in-place).
 *   2. Markdown link `[text](yt-url)` — конвертится в .yt-link,
 *      click открывает modal lightbox с iframe (preserves текст ссылки
 *      и окружающее форматирование списка/параграфа).
 *
 * Применяется на rendering уровне — заменяет HTML output обоих
 * paragraph и link tokens.
 */
export const youtubeExtension: MarkedExtension = {
  renderer: {
    paragraph(token: Tokens.Paragraph) {
      // Если paragraph содержит только text token с URL — convert
      // в poster-embed (большой блок).
      const tokens = token.tokens;
      if (tokens.length === 1 && tokens[0].type === 'text') {
        const inner = tokens[0] as { text?: string };
        const text = typeof inner.text === 'string' ? inner.text : '';
        const parsed = parseYouTubeUrl(text);
        if (parsed) {
          const startAttr = parsed.start != null ? ` data-start="${String(parsed.start)}"` : '';
          return `<div class="yt-embed" data-video-id="${parsed.id}"${startAttr}>
  <img src="https://img.youtube.com/vi/${parsed.id}/maxresdefault.jpg" alt="" loading="lazy">
  <button class="yt-embed__play" aria-label="Play video" type="button">
    <svg width="48" height="48" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M72 39.88a8 8 0 0 1 12.06-6.92l134 87.91a8 8 0 0 1 0 14.27l-134 87.91A8 8 0 0 1 72 216.12Z"/>
    </svg>
  </button>
</div>\n`;
        }
      }
      return false;
    },
    link(token: Tokens.Link) {
      // `[text](yt-url)` → modal-trigger link (visual = обычная ссылка,
      // click = открыть lightbox в текущей странице, не уходить с moirai).
      const parsed = parseYouTubeUrl(token.href);
      if (!parsed) return false;
      const startAttr = parsed.start != null ? ` data-yt-start="${String(parsed.start)}"` : '';
      // Render children (например inline strong / em внутри текста ссылки)
      let inner = '';
      for (const t of token.tokens) {
        const tt = t as { type: string; text?: string; raw?: string };
        inner += (tt.text ?? tt.raw ?? '');
      }
      if (!inner) inner = token.text || token.href;
      // escape HTML в inner для безопасности
      const esc = inner
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return `<a class="yt-link" data-yt-id="${parsed.id}"${startAttr} href="${token.href}" target="_blank" rel="noopener">${esc}</a>`;
    },
  },
};
