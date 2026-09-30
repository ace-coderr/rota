/*
 * vercel.json, checked before Vercel checks it.
 *
 * A `comment` key in the cron entry failed a production deploy with
 * "`crons[0]` should NOT have additional property `comment`". Nothing in this
 * repo could have caught it: the file is read by Vercel's builder and never by
 * `next build`, so typecheck, lint and CI all passed a file that could not
 * deploy. The first sign was a red deployment.
 *
 * Note the trap, because it is why this vendors a contract rather than simply
 * running the published schema: the schema at openapi.vercel.sh sets
 * `additionalProperties: false` on 195 of its nodes and NOT on the cron item.
 * Validating against it as published would accept `comment` and the deploy
 * would still fail. The deploy validator is the stricter of the two, so it is
 * the one modelled here.
 *
 * Run from web/:  npm run check:vercel
 * Against another file (this script's own tests do that):
 *                 node scripts/check-vercel-json.mjs some/other.json
 * Re-check the vendored contract against the live schema:
 *                 npm run check:vercel -- --online
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// The contract, copied from https://openapi.vercel.sh/vercel.json on
// 2026-09-30. `--online` re-fetches and reports drift, so this snapshot going
// stale is a warning on demand rather than a silent wrong answer.
// ---------------------------------------------------------------------------
const SCHEMA_URL = "https://openapi.vercel.sh/vercel.json";

const ROOT_KEYS = [
  "$schema", "alias", "build", "buildCommand", "builds", "bulkRedirectsPath",
  "bunVersion", "cleanUrls", "crons", "devCommand", "env", "experimentalAtproto",
  "experimentalBYOC", "experimentalEnvironmentVariables",
  "experimentalServiceGroups", "experimentalServices", "experimentalServicesV2",
  "fluid", "framework", "functionFailoverRegions", "functions", "git", "github",
  "headers", "ignoreCommand", "images", "installCommand", "name",
  "outputDirectory", "passiveRegions", "proxy", "redirects", "regions",
  "relatedProjects", "rewrites", "routes", "schedules", "scope", "services",
  "skipMiddlewareRequestBody", "trailingSlash", "version", "wildcard",
];

const CRON = {
  maxItems: 100,
  required: ["path", "schedule"],
  // Exactly these two. Anything else is the thing that broke the deploy.
  allowed: ["path", "schedule"],
  path: { maxLength: 512 },
  schedule: { minLength: 9, maxLength: 256 },
};

const file = process.argv.slice(2).find((a) => a.endsWith(".json")) ?? "vercel.json";
const online = process.argv.includes("--online");

const problems = [];
const notes = [];
const fail = (message) => problems.push(message);

// --- parse -----------------------------------------------------------------
let config;
try {
  config = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Could not read ${file}: ${error.message}`);
  process.exit(1);
}

if (config === null || typeof config !== "object" || Array.isArray(config)) {
  fail(`${file} must be a JSON object.`);
  config = {};
}

// --- root ------------------------------------------------------------------
for (const key of Object.keys(config)) {
  if (!ROOT_KEYS.includes(key)) {
    fail(`Unknown top-level property \`${key}\` — Vercel rejects it at deploy.`);
  }
}

// --- crons -----------------------------------------------------------------
const crons = config.crons;
if (crons !== undefined) {
  if (!Array.isArray(crons)) {
    fail("`crons` must be an array.");
  } else {
    if (crons.length > CRON.maxItems) {
      fail(`${crons.length} crons; Vercel allows ${CRON.maxItems}.`);
    }

    crons.forEach((job, i) => {
      const at = `crons[${i}]`;
      if (job === null || typeof job !== "object" || Array.isArray(job)) {
        fail(`${at} must be an object.`);
        return;
      }

      for (const key of Object.keys(job)) {
        if (!CRON.allowed.includes(key)) {
          // Vercel's own wording, so a search for the deploy error lands here.
          fail(
            `${at} should NOT have additional property \`${key}\`. ` +
              `Only ${CRON.allowed.map((k) => `\`${k}\``).join(" and ")} are allowed — ` +
              `the explanation belongs in the README, where it cannot break a build.`,
          );
        }
      }
      for (const key of CRON.required) {
        if (typeof job[key] !== "string") fail(`${at} is missing \`${key}\`.`);
      }

      const { path, schedule } = job;

      if (typeof path === "string") {
        if (!path.startsWith("/")) {
          fail(`${at}.path must start with "/" — got "${path}".`);
        }
        if (path.length > CRON.path.maxLength) {
          fail(`${at}.path is longer than ${CRON.path.maxLength} characters.`);
        }
        // In no schema, and the one that actually bites: a cron pointing at a
        // route that does not exist deploys green and 404s every night,
        // silently, forever.
        const route = path.replace(/^\//, "").split("?")[0];
        const handler = ["ts", "tsx", "js", "mjs"]
          .map((ext) => join("app", route, `route.${ext}`))
          .find((candidate) => existsSync(candidate));
        if (handler) notes.push(`${at}.path → ${handler.replace(/\\/g, "/")}`);
        else fail(`${at}.path "${path}" has no route handler under app/.`);
      }

      if (typeof schedule === "string") {
        const { minLength, maxLength } = CRON.schedule;
        if (schedule.length < minLength || schedule.length > maxLength) {
          fail(`${at}.schedule must be ${minLength}–${maxLength} characters — "${schedule}" is ${schedule.length}.`);
        }
        const fields = schedule.trim().split(/\s+/);
        if (fields.length !== 5) {
          fail(
            `${at}.schedule needs 5 fields (minute hour dom month dow) — ` +
              `got ${fields.length}: "${schedule}".`,
          );
        } else {
          const [minute, hour] = fields;
          // Hobby runs cron once a day and refuses to deploy anything more
          // frequent. The hourly pass is .github/workflows/disburse.yml; this
          // file is the daily backstop, and has to stay deployable.
          const fixed = (f) => /^\d+$/.test(f);
          if (!fixed(minute) || !fixed(hour)) {
            fail(
              `${at}.schedule "${schedule}" runs more than once a day, and ` +
                `Vercel's Hobby plan allows one daily run. Pin the minute and the hour.`,
            );
          } else if (minute === "0" && hour === "0") {
            notes.push(`${at} runs at midnight UTC, when everyone else's cron does.`);
          }
        }
      }
    });
  }
}

// --- optional drift check --------------------------------------------------
if (online) {
  try {
    const response = await fetch(SCHEMA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const live = await response.json();

    const liveRoot = Object.keys(live.properties ?? {});
    const added = liveRoot.filter((k) => !ROOT_KEYS.includes(k));
    const gone = ROOT_KEYS.filter((k) => !liveRoot.includes(k));
    notes.push(
      added.length || gone.length
        ? `Root drifted: ${[...added.map((k) => `+${k}`), ...gone.map((k) => `-${k}`)].join(", ")}`
        : "Root properties match the live schema.",
    );

    const liveCron = Object.keys(live.properties?.crons?.items?.properties ?? {}).sort();
    notes.push(
      liveCron.join() === [...CRON.allowed].sort().join()
        ? "Cron item properties match the live schema."
        : `Cron item properties drifted: live = ${liveCron.join(", ")}.`,
    );
  } catch (error) {
    // Never a failure. A check that goes red because a CDN blinked is a check
    // people learn to ignore.
    notes.push(`Could not reach the live schema (${error.message}) — used the vendored copy.`);
  }
}

// --- report ----------------------------------------------------------------
console.log(file);
for (const note of notes) console.log(`  · ${note}`);
for (const problem of problems) console.log(`  ✗ ${problem}`);
console.log(problems.length === 0 ? "\nPASS" : `\n${problems.length} PROBLEM(S)`);
process.exit(problems.length === 0 ? 0 : 1);
