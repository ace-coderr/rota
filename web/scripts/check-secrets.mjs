/*
 * Proves no server-only secret reached the browser bundle.
 *
 * Next inlines NEXT_PUBLIC_* at build time and strips everything else, so the
 * rule is meant to hold by construction — but the failure is silent and total.
 * A relayer key in a client chunk is not a leak that degrades; it is every
 * circle's gas budget, published, permanently, to anyone who opens devtools.
 * `server-only` catches an import; this catches the value.
 *
 * Checks two things per secret: that its NAME never appears in a client chunk
 * (which would mean something is reading process.env there), and that its
 * VALUE never appears (which would mean it was inlined).
 *
 * Run from web/, after a build:  npm run check:secrets
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SECRETS = [
  "CIRCLE_API_KEY",
  "RELAYER_PRIVATE_KEY",
  "CRON_SECRET",
  // Contract deploy keys. They have no business in this app at all, but they
  // live in the same .env family and a stray import would be catastrophic.
  "PRIVATE_KEY",
  "MAINNET_PRIVATE_KEY",
];

const ROOT = ".next/static";

if (!existsSync(ROOT)) {
  console.error(`No ${ROOT}. Run \`npm run build\` first.`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(js|css|map)$/.test(entry)) out.push(path);
  }
  return out;
}

// Load whatever the developer actually has set, so the VALUE check is real
// rather than a check against a placeholder.
const env = {};
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (value) env[match[1]] ??= value;
  }
}

const files = walk(ROOT);
const rows = [];
let bad = 0;

for (const secret of SECRETS) {
  const value = env[secret];
  const byName = files.filter((f) => readFileSync(f, "utf8").includes(secret));
  const byValue =
    value && value.length >= 12
      ? files.filter((f) => readFileSync(f, "utf8").includes(value))
      : [];

  const ok = byName.length === 0 && byValue.length === 0;
  if (!ok) bad++;
  rows.push({
    secret,
    "set locally": value ? "yes" : "no",
    "name in bundle": byName.length,
    "value in bundle": byValue.length,
    ok,
  });
}

console.log(`scanned ${files.length} client files under ${ROOT}\n`);
console.table(rows);

if (bad > 0) {
  console.error(`\n${bad} SECRET(S) REACHED THE CLIENT BUNDLE`);
  process.exit(1);
}
console.log("\nPASS — no server-only secret appears in any client file.");
