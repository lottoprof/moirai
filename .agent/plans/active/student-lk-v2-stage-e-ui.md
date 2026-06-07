# Student LK v2 — Stage E: UI overhaul

> Spec: `docs/student-lk-v2-spec.md` § 8 Stage E + § 5.
> Depends on: Stage A, B.

## Чеклист

- [ ] **E1** — Phosphor Thin icons (10 files в `src/components/icons/`):
  Lock, Check, CheckCircle, ArrowLeft, ArrowRight, CaretLeft, CaretRight,
  List, X, Play.
- [ ] **E2** — Заменить Unicode emoji (D7) в `ModuleCard`, `dashboard/index.astro`,
  `dashboard/modules/[slug].astro` на SVG icons.
- [ ] **E3** — `ConfirmModal.astro` — generic confirm modal (typing-required
  для GDPR delete + presentation exit + override warning).
- [ ] **E4** — `MarkdownContent.astro` + YouTube extension
  (`src/lib/markdown/extensions/youtube.ts`) — Vanilla JS lite-load.
- [ ] **E5** — `ModulesDrawer.astro` — module list sidebar.
  - Permanent sidebar на desktop ≥1024.
  - Overlay через hamburger на mobile/tablet.
  - Edge swipe gesture для mobile.
  - localStorage persistence.
  - Update `DashboardLayout` для drawer slot.
- [ ] **E6** — `ModuleTabs.astro` + integration в module page:
  - 3 tabs (Presentation / Workbook / Homework).
  - URL state `?tab=` через replaceState.
  - Mobile swipe between tabs.
  - Sticky на desktop.
- [ ] **E7** — Presentation mode page `/dashboard/modules/[slug]/present`:
  - `PresentationLayout.astro` без dashboard nav/drawer/tabs.
  - Title sticky-translate-out при scroll.
  - Keyboard: ←/→ prev/next module, Esc + confirm exit, F fullscreen.
  - Large typography (clamp 48-64 H1, 22-24 body).
- [ ] **E8** — `DashboardNav.astro` cleanup:
  - Убрать "Modules" link (drawer заменяет).
  - Hamburger button → toggle drawer на mobile.
- [ ] **V** — verify typecheck + lint + build.

## Не входит

- Light theme (deferred stage10).
- Slide-by-slide presentation (Future migrations).
- Vimeo embed (Future migrations).

## Critical files (estimated)

- `src/components/icons/*.astro` (10 new)
- `src/components/shared/MarkdownContent.astro` (new)
- `src/components/shared/ConfirmModal.astro` (new)
- `src/components/dashboard/ModulesDrawer.astro` (new)
- `src/components/dashboard/ModuleTabs.astro` (new)
- `src/layouts/dashboard/PresentationLayout.astro` (new)
- `src/pages/[locale]/dashboard/modules/[slug]/present.astro` (new)
- `src/lib/markdown/extensions/youtube.ts` (new)
- Update: `src/layouts/dashboard/Layout.astro`, `DashboardNav.astro`,
  `ModuleCard.astro`, `dashboard/index.astro`, `dashboard/modules/[slug].astro`.
