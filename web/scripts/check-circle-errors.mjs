/*
 * Checks that Circle failures are classified into something a person can act
 * on, and that Circle's own error text never reaches the browser.
 *
 * Run from web/:  npm run check:errors
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// `server-only` throws outside a server component; strip that one import so
// the classifier itself can be exercised directly.
const src = readFileSync("lib/server/circle-errors.ts", "utf8").replace(
  'import "server-only";',
  "",
);
const dir = mkdtempSync(join(tmpdir(), "cls-"));
const file = join(dir, "circle-errors.ts");
writeFileSync(file, src);

const { circleFailure } = await import(pathToFileURL(file).href);

const cases = [
  ["bad api key", { response: { status: 401, data: { message: "Unauthorized" } } }, "config"],
  ["forbidden", { response: { status: 403, data: {} } }, "config"],
  ["wrong appId", { response: { status: 400, data: { message: "Invalid appId for this entity" } } }, "config"],
  ["no SMTP", { response: { status: 400, data: { message: "Email sender is not configured" } } }, "email_delivery"],
  ["rate limited", { response: { status: 429, data: {} } }, "rate_limited"],
  ["circle down", { response: { status: 503, data: {} } }, "upstream"],
  ["dns failure", new Error("fetch failed"), "network"],
  ["odd 400", { response: { status: 400, data: { message: "something else entirely" } } }, "unknown"],
];

const logs = [];
const realError = console.error;
console.error = (...a) => logs.push(a.join(" "));
let bad = 0;
const results = cases.map(([name, err, want]) => {
  const got = circleFailure("test", err);
  const ok = got.kind === want;
  if (!ok) bad++;
  return {
    name,
    want,
    got: got.kind,
    ok,
    ref: got.reference?.length ?? 0,
    message: got.message.slice(0, 44) + "…",
  };
});
console.error = realError;

console.table(results);
console.log("\nlogged lines:", logs.length, "(one per failure)");
console.log("sample log line:\n  " + (logs[0] ?? "").slice(0, 240));

// The safe message must never carry Circle's own text.
const leaked = cases.filter(([, err]) => {
  const raw = err?.response?.data?.message;
  if (!raw) return false;
  return results.some((r) => r.message.includes(raw.slice(0, 12)));
});
console.log("\nresponses leaking Circle's raw text:", leaked.length);
console.log(bad === 0 && leaked.length === 0 ? "\nPASS" : "\nFAIL");
process.exit(bad === 0 && leaked.length === 0 ? 0 : 1);
