# js-ts: lint

ESLint + (опционально) Prettier. Astro 5 поддерживает плагин
`eslint-plugin-astro` для `.astro` файлов.

## Команды

```bash
npm run lint               # eslint .
npm run lint -- --fix      # автофикс там, где можно
```

## Конфиг (типичный)

`eslint.config.js` (flat config, ESLint 9+):

```js
import astro from "eslint-plugin-astro";
import ts from "typescript-eslint";

export default [
  ...ts.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      // проектные правила
    }
  }
];
```

Список плагинов и зависимостей — в `package.json` (`devDependencies`).

## Правила (рекомендуемая базовая линия)

- TypeScript: `@typescript-eslint/no-explicit-any` warn,
  `no-unused-vars` error.
- Astro: правила из `astro/recommended`.
- Импорты: `import/order` или эквивалент, чтобы порядок был
  предсказуемый.
- Никаких глобальных дисэйблов через `// eslint-disable` без
  обоснования в комментарии.

## ESLint != type checker

Линтер не валидирует типы. Для типов — `npm run typecheck`
(см. `rules/quality-gates.md`).

## Игнор

`.eslintignore` или `ignores` в flat config:
- `dist/`
- `.astro/`
- `.wrangler/`
- `node_modules/`
- `worker-configuration.d.ts` (генерируется)

## Pitfalls

1. **`.astro` файлы не линтятся** — забыли установить
   `eslint-plugin-astro`. Без него `<script>` блоки и frontmatter
   не проверяются.
2. **`--fix` ломает форматирование** — конфликт ESLint и Prettier.
   Решение: либо использовать только Prettier для формата, либо
   `eslint-config-prettier` для отключения конфликтующих правил.
3. **Линтер не падает на `client:load` в публичном слое** — это
   архитектурное правило, ESLint его не проверяет. Reviewer-агент
   проверяет вручную (см. `agents/reviewer.md`).
