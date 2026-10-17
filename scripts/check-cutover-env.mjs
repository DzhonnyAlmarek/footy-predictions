#!/usr/bin/env node
// Offline guard for the future production deployment. No database connections or writes.
const errors = [];
const requireValue = (key) => {
  const value = process.env[key]?.trim();
  if (!value) errors.push(key + " is required");
  return value || "";
};
const target = requireValue("DEPLOY_TARGET");
if (target !== "yandex-neon-production") errors.push("DEPLOY_TARGET must equal yandex-neon-production");
const databaseUrl = requireValue("DATABASE_URL");
let db;
try {
  db = new URL(databaseUrl);
  if (db.protocol !== "postgres:" && db.protocol !== "postgresql:") errors.push("DATABASE_URL must be PostgreSQL");
  if (!db.hostname.endsWith(".neon.tech")) errors.push("DATABASE_URL must use Neon");
  if (db.hostname.startsWith("ep-holy-smoke-b1y4pzhn")) errors.push("DATABASE_URL points to the isolated TEST Neon endpoint");
  if (db.searchParams.get("sslmode") !== "require" && db.searchParams.get("sslmode") !== "verify-full") errors.push("DATABASE_URL must require TLS");
} catch { errors.push("DATABASE_URL is not a valid URL"); }
const origin = requireValue("APP_ORIGIN");
try {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) errors.push("APP_ORIGIN must be an HTTPS origin");
  if (url.origin === "https://bbadj1vr2rcdeh9k8tna.containers.yandexcloud.net") errors.push("APP_ORIGIN must not be the existing test container");
} catch { errors.push("APP_ORIGIN is not a valid URL"); }
if ((process.env.PARTICIPANT_RATE_PEPPER || "").length < 32) errors.push("PARTICIPANT_RATE_PEPPER must contain at least 32 characters");
for (const key of ["ENABLE_NEON_TEST_ADMIN","ENABLE_NEON_TEST_CALENDAR_WRITES","ENABLE_NEON_TEST_CALENDAR_DRAFT_LINKS","ENABLE_NEON_TEST_STAGE_TOUR_WRITES"]) {
  if (process.env[key] === "true") errors.push(key + " must not be enabled in production");
}
if (errors.length) {
  console.error("Production preflight FAILED:");
  errors.forEach((message) => console.error("- " + message));
  process.exitCode = 1;
} else {
  console.log("Production environment preflight passed (configuration only; database, application and migration NOT verified).");
}
