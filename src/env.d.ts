/// <reference types="astro/client" />

// `Env` declared globally в worker-configuration.d.ts (включён в
// tsconfig.json -> include). Триggle-slash path reference не нужен.

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  // Сейчас Locals = Runtime; middleware будет дополнять
  // (user, session) через declaration merging — поэтому interface,
  // а не type alias.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Locals extends Runtime {}
}
