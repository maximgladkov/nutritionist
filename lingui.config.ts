import { defineConfig } from "@lingui/cli";

export default defineConfig({
  catalogs: [
    {
      exclude: ["**/*.test.ts", "**/node_modules/**", "app/admin/**"],
      include: ["app", "lib"],
      path: "<rootDir>/locales/{locale}/messages",
    },
  ],
  compileNamespace: "ts",
  // The web app isn't in Spanish, German, French, Italian or Portuguese yet; those catalogs fall back to English.
  fallbackLocales: { default: "en" },
  locales: ["en", "ru", "es", "de", "fr", "it", "pt"],
  sourceLocale: "en",
});
