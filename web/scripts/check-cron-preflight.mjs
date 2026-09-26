/*
 * The rule the automatic payouts turn on: never send a transaction that will
 * revert.
 *
 * A doomed disburse costs the relayer gas, tells the members nothing, and is
 * indistinguishable from a relayer that is simply broken — so the decision has
 * to be right every time, and in production it is nearly unobservable: the
 * evidence of a correct decision is a transaction that does not exist.
 *
 * Run from web/:  npm run check:cron
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// `server-only` throws outside a server component, and the rest of the module
// pulls in viem. Lift out just the pure function, the way check:wallet does.
const src = readFileSync("lib/server/relayer.ts", "utf8");
const start = src.indexOf("export function verdictFor");
const body = src.slice(start).replace(/:\s*RoundVerdict/, "").replace(
  /\(statuses: readonly RoundStatus\[\]\)/,
  "(statuses)",
);

const dir = mkdtempSync(join(tmpdir(), "cron-"));
const file = join(dir, "verdict.mjs");
writeFileSync(file, body);
const { verdictFor } = await import(pathToFileURL(file).href);

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const C = "0xcccc000000000000000000000000000000000003";

const member = (address, over = {}) => ({
  member: address,
  allowance: 100n,
  balance: 100n,
  joined: true,
  ready: true,
  ...over,
});

const cases = [
  {
    name: "everyone ready — send",
    statuses: [member(A), member(B), member(C)],
    send: true,
    waiting: [],
  },
  {
    name: "one has not joined — hold, and name them",
    statuses: [member(A), member(B, { joined: false, ready: false }), member(C)],
    send: false,
    waiting: [B],
  },
  {
    name: "one joined but short — hold, and name them",
    statuses: [member(A), member(B), member(C, { balance: 0n, ready: false })],
    send: false,
    waiting: [C],
  },
  {
    name: "one withdrew their permission — hold (allowance gone, still joined)",
    statuses: [member(A, { allowance: 0n, ready: false }), member(B), member(C)],
    send: false,
    waiting: [A],
  },
  {
    name: "one missing and one short — hold, and name both",
    statuses: [
      member(A, { joined: false, ready: false }),
      member(B),
      member(C, { balance: 0n, ready: false }),
    ],
    send: false,
    waiting: [A, C],
  },
  {
    name: "unknown circle (no members) — hold, never send",
    statuses: [],
    send: false,
    waiting: [],
  },
  {
    name: "the recipient pays nothing and is ready even at zero balance",
    statuses: [member(A, { balance: 0n, allowance: 0n }), member(B), member(C)],
    send: true,
    waiting: [],
  },
];

let bad = 0;
const rows = cases.map((c) => {
  const got = verdictFor(c.statuses);
  const waiting = got.send ? [] : got.waitingOn;
  const ok =
    got.send === c.send &&
    waiting.length === c.waiting.length &&
    waiting.every((w, i) => w === c.waiting[i]);
  if (!ok) bad++;
  return {
    case: c.name,
    "want send": c.send,
    "got send": got.send,
    "waiting on": waiting.map((w) => w.slice(0, 6)).join(", ") || "—",
    ok,
  };
});

console.table(rows);

// The property that matters most, stated on its own: a single unready member
// is always enough to stop a send, whatever else is true of the round.
const anyUnreadyHolds = [
  [{ ...member(A), ready: false }],
  [member(A), { ...member(B), ready: false }],
  [member(A), member(B), { ...member(C), ready: false, joined: false }],
].every((statuses) => verdictFor(statuses).send === false);

console.log(
  `\nany unready member stops the send: ${anyUnreadyHolds ? "yes" : "NO"}`,
);
if (!anyUnreadyHolds) bad++;

console.log(bad === 0 ? "\nPASS" : `\n${bad} WRONG`);
process.exit(bad === 0 ? 0 : 1);
