#!/usr/bin/env node
/**
 * Read-only cutover preview smoke checks.
 * Requires CUTOVER_BASE_URL and checks only isolated cutover endpoints.
 * Does not submit passwords, write predictions, or change production.
 */
const base = process.env.CUTOVER_BASE_URL;
if (!base) throw new Error("Set CUTOVER_BASE_URL to the isolated preview origin");
const url = new URL(base);
if (url.protocol !== "https:") throw new Error("Preview must use HTTPS");
if (!process.env.CUTOVER_ALLOW_CUSTOM_HOST &&
    !url.hostname.endsWith(".containers.yandexcloud.net")) {
  throw new Error("Refusing non-Yandex preview host");
}
const checks = [
  { path: "/cutover-participant", statuses: [200], content: "text/html" },
  { path: "/api/cutover/participants", statuses: [200], content: "application/json" },
  { path: "/api/cutover/session", statuses: [401], content: "application/json" },
  { path: "/api/cutover/my-predictions", statuses: [401], content: "application/json" }
];
let failed = false;
for (const check of checks) {
  const target = new URL(check.path, url);
  const response = await fetch(target, { redirect: "manual", headers: { "Cache-Control": "no-store" } });
  const type = response.headers.get("content-type") || "";
  const ok = check.statuses.includes(response.status) && type.includes(check.content);
  console.log(`${ok ? "PASS" : "FAIL"} ${check.path}: HTTP ${response.status}, ${type}`);
  if (!ok) failed = true;
  if (check.path.startsWith("/api/")) {
    const cache = response.headers.get("cache-control") || "";
    if (!cache.includes("no-store")) {
      console.error(`FAIL ${check.path}: missing no-store`);
      failed = true;
    }
  }
}
if (failed) process.exitCode = 1;
