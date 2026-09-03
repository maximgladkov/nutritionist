import { defineConfig } from "@lingui/cli";

export default defineConfig({
  catalogs: [
    {
      exclude: ["**/*.test.ts", "**/node_modules/**"],
      include: ["app", "lib"],
      path: "<rootDir>/locales/{locale}/messages",
    },
  ],
  compileNamespace: "ts",
  locales: ["en", "ru"],
  sourceLocale: "en",
});
