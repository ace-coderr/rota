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
  src.indexOf("export function completedTotals"),
);
// The figures on a finished row. Bounded explicitly rather than left to run on
// from the slice above, which it silently did at first — it still passed,
// because the extra code happened to be valid, which is the kind of accident
// that only stops being one when somebody adds a line between them.
const totals = src.slice(
  src.indexOf("export function completedTotals"),
  src.indexOf("export type MyCircle"),
);

const dir = mkdtempSync(join(tmpdir(), "circles-"));
const file = join(dir, "sort.ts");
writeFileSync(
  file,
  `${classify.replace(/: CircleStanding/g, "").replace(/\{\s*started,\s*cycleIndex,\s*memberCount,\s*joined,\s*\}: \{[^}]*\}/s, "{ started, cycleIndex, memberCount, joined }")}\n` +
    `${rank.replace(/: Record<CircleStanding, number>/, "")}\n` +
    `${totals}\n`,
);
const {
  classify: classifyFn,
  STANDING_RANK,
  completedTotals,
  lastRoundDueAt,
} = await import(pathToFileURL(file).href);

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

/*
 * The one line a finished row shows.
 *
 * It is the only number on that row and nobody can check it against anything
 * — the circle is over and the rows that made it up are not on the page. If
 * it were wrong it would look exactly as authoritative as if it were right.
 */
const totalCases = [
  // 3 people at 0.02: each pays in the two rounds they are not the recipient.
  { contribution: 20_000n, members: 3, want: 40_000n },
  { contribution: 50_000n, members: 2, want: 50_000n },
  // Circle 2 on mainnet, which is the example in the README.
  { contribution: 50_000n, members: 3, want: 100_000n },
  { contribution: 1_000_000n, members: 20, want: 19_000_000n },
  // Degenerate, and must not go negative or throw.
  { contribution: 50_000n, members: 1, want: 0n },
  { contribution: 50_000n, members: 0, want: 0n },
];

const totalRows = totalCases.map((c) => {
  const { putIn, received } = completedTotals(c.contribution, c.members);
  // Put in and received have to agree: a finished circle nets to zero, and a
  // row claiming otherwise would be reporting a bug in the contract that is
  // not there.
  const ok = putIn === c.want && received === c.want;
  if (!ok) bad++;
  return {
    case: `${c.members} × ${c.contribution}`,
    want: c.want.toString(),
    putIn: putIn.toString(),
    received: received.toString(),
    ok,
  };
});
console.log("\nfinished-row totals");
console.table(totalRows);

// The date is the LAST ROUND'S DUE TIME, one period back from where the
// schedule ended up — not when it settled, which only the logs know.
const due = [
  { nextDueAt: 1_790_196_904n, period: 60n, want: 1_790_196_844n },
  // Never started, or a period larger than the whole timestamp: no date.
  { nextDueAt: 0n, period: 3600n, want: 0n },
  { nextDueAt: 100n, period: 3600n, want: 0n },
];
for (const c of due) {
  const got = lastRoundDueAt(c.nextDueAt, c.period);
  if (got !== c.want) {
    bad++;
    console.log(`lastRoundDueAt(${c.nextDueAt}, ${c.period}) = ${got}, want ${c.want}`);
  }
}
console.log(`lastRoundDueAt: ${due.length} cases checked`);

console.log(bad === 0 ? "\nPASS" : `\n${bad} WRONG`);
process.exit(bad === 0 ? 0 : 1);
