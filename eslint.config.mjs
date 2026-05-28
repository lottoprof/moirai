// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default [
  {
    ignores: [
      "dist/**",
      ".astro/**",
      ".wrangler/**",
      "node_modules/**",
      "worker-configuration.d.ts",
      // Build/seed/sync скрипты — Node ESM utilities, не в bundle.
      // Не покрываются tsconfig.eslint.json, лучше не пускать в type-aware lint.
      "scripts/**/*.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...astro.configs.recommended,
  //
  // .astro файлы: отключаем type-aware правила typescript-eslint.
  // Причины:
  //   1. JSX-выражения внутри template eslint-plugin-astro парсит
  //      как отдельные виртуальные TS-файлы вне tsconfig.eslint.json
  //      project — type-aware правила падают.
  //   2. <script> блоки в .astro тоже виртуальные файлы.
  // В .ts файлах строгие правила сохраняются.
  //
  // Виртуальные TS из <script> имеют путь Component.astro/1_1.ts —
  // обычный glob ".astro" их не ловит, расширяем ".astro/*.ts".
  //
  {
    files: ["**/*.astro", "**/*.astro/*.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
];
