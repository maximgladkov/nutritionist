// Preloaded before API integration tests. It pins every external service to safe values
// before app code reads .env.local (dotenv never overrides variables that are already set).
const url = process.env.API_TEST_DATABASE_URL ?? "postgresql://postgres:test@localhost:54329/nutritionist_test";
const host = new URL(url).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error(`API tests only run against a local database, got ${host}`);
}

Object.assign(process.env, {
  AUTH_RESEND_KEY: "",
  AUTH_SECRET: "api-test-secret-not-for-production",
  BLOB_READ_WRITE_TOKEN: "",
  DATABASE_URL: url,
  NODE_ENV: "test",
  PRISMA_ACCELERATE_URL: "",
  PRISMA_DATABASE_URL: "",
  TELEGRAM_BOT_TOKEN: "",
  WHATSAPP_ACCESS_TOKEN: "",
});
