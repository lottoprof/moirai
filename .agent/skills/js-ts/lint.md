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

  // Type-aware линт серверного кода (no-floating-promises и т.п.)
  {
    files: ["src/pages/api/**/*.ts", "src/lib/server/**/*.ts", "src/middleware.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
    },
  },
];
```

Список плагинов и зависимостей — в `package.json` (`devDependencies`).

## tsconfig.eslint.json (обязательный артефакт)

Отдельный TypeScript-конфиг **только для type-aware ESLint** —
ускоряет линт и сужает зону анализа. Лежит в корне проекта рядом
с `tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.astro",
    "worker-configuration.d.ts"
  ]
}
```

Зачем отдельный, а не основной `tsconfig.json`:
- основной `tsconfig.json` (генерируется Astro) тащит widening
  настройки и может быть медленным для type-aware прогона на каждом
  изменении;
- здесь явно указаны нужные `types: ["@cloudflare/workers-types"]`,
  чтобы биндинги/`Env` корректно резолвились в линте;
- `include` минимальный: только то, что хотим проверять
  type-aware-правилами.

Подключается через `parserOptions.project` в flat-config (см. выше).

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
