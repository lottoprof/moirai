// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://moirai.film",
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ru"],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
});
