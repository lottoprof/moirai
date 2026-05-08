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
  {
    /*
     * Внутри .astro templates type-flow от typescript-eslint не
     * полный (eslint-plugin-astro парсит JSX-выражения отдельно).
     * Расслабляем `no-unsafe-*` правила специально для шаблонов.
     * В .ts файлах строгие правила сохраняются.
     */
    files: ["**/*.astro"],
    rules: {
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
];
