/*
 * Which circle goes to the top of /circles.
 *
 * The list's whole value is that a member opens it and immediately sees the
 * circle that is waiting for them. Get the bucket wrong and the one circle
 * needing them sits under four that do not — which is exactly the problem the
 * page exists to solve, failing silently.
 *
 * Only some of this can be seen against live data: the testnet circles cover
 * needs-join, waiting-to-start and complete, but there is no running circle to
 * look at, so `running` would otherwise ship unverified.
 *
 * Run from web/:  npm run check:circles
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Lift the two pure pieces out of the hook, which otherwise drags in React
// and wagmi. Same approach as check:wallet.
const src = readFileSync("lib/useMyCircles.ts", "utf8");
// Sliced at the export boundaries, not at comment text. A comment gets
// reworded far more often than an export gets renamed, and a slice that
// silently runs to the end of the file fails looking like a syntax error in
// the source rather than a bad boundary in here.
const classify = src.slice(
  src.indexOf("export function classify"),
  src.indexOf("export const STANDING_RANK"),
);
const rank = src.slice(
  src.indexOf("export const STANDING_RANK"),
  src.indexOf("export type MyCircle"),
);

const dir = mkdtempSync(join(tmpdir(), "circles-"));
const file = join(dir, "sort.ts");
writeFileSync(
  file,
  `${classify.replace(/: CircleStanding/g, "").replace(/\{\s*started,\s*cycleIndex,\s*memberCount,\s*joined,\s*\}: \{[^}]*\}/s, "{ started, cycleIndex, memberCount, joined }")}\n` +
    `${rank.replace(/: Record<CircleStanding, number>/, "")}\n`,
);
const { classify: classifyFn, STANDING_RANK } = await import(
  pathToFileURL(file).href
);

const cases = [
  {
    name: "invited, has not joined — top of the list",
    input: { started: false, cycleIndex: 0, memberCount: 3, joined: false },
    want: "needs-join",
  },
  {
    name: "joined, circle not started — waiting on other people",
    input: { started: false, cycleIndex: 0, memberCount: 3, joined: true },
    want: "waiting-to-start",
  },
  {
    name: "running, part way through",
    input: { started: true, cycleIndex: 1, memberCount: 3, joined: true },
    want: "running",
  },
  {
    name: "running, on the last round",
    input: { started: true, cycleIndex: 2, memberCount: 3, joined: true },
    want: "running",
  },
  {
    name: "every member paid — complete",
    input: { started: true, cycleIndex: 3, memberCount: 3, joined: true },
    want: "complete",
  },
  {
    name: "a never-started circle is never mistaken for complete",
    input: { started: false, cycleIndex: 0, memberCount: 2, joined: false },
    want: "needs-join",
  },
];

let bad = 0;
const rows = cases.map((c) => {
  const got = classifyFn(c.input);
  const ok = got === c.want;
  if (!ok) bad++;
  return { case: c.name, want: c.want, got, ok };
});
console.table(rows);

// The ordering itself: needs-you first, complete last, and "waiting to start"
// below "running" because there is nothing to do in it.
const order = ["needs-join", "running", "waiting-to-start", "complete"];
const sorted = [...order]
  .reverse()
  .sort((a, b) => STANDING_RANK[a] - STANDING_RANK[b]);
const orderOk = sorted.join(" < ") === order.join(" < ");
if (!orderOk) bad++;

console.log("\norder:", sorted.join("  <  "));
console.log(`needs-join is first:   ${sorted[0] === "needs-join" ? "yes" : "NO"}`);
console.log(`complete is last:      ${sorted.at(-1) === "complete" ? "yes" : "NO"}`);
console.log(
  `running above waiting: ${STANDING_RANK.running < STANDING_RANK["waiting-to-start"] ? "yes" : "NO"}`,
);

console.log(bad === 0 ? "\nPASS" : `\n${bad} WRONG`);
process.exit(bad === 0 ? 0 : 1);
