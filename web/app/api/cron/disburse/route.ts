import type { Address, Chain, PublicClient } from "viem";

import { DEPLOYMENTS, type Deployment } from "@/lib/deployments";
import { ROTA_ABI } from "@/lib/rota";
import {
  RELAYER_ENV,
  readClient,
  relayerAddress,
  relayerConfigured,
  relayerFunding,
  sendClient,
  verdictFor,
  type RelayerFunding,
  type RoundStatus,
} from "@/lib/server/relayer";

/**
 * Pays out every circle that has come due, so no member has to press anything.
 *
 * The rule this route is built around: NEVER SEND A TRANSACTION THAT WILL
 * REVERT. A reverting disburse costs the relayer gas, tells the members
 * nothing, and — because it looks identical to a relayer that is simply
 * broken — makes the one real failure mode impossible to diagnose. So every
 * circle is checked twice before anything is signed: `previewRound` for who is
 * short or has not joined, then a simulation of the exact call, which catches
 * everything else (not due yet, already settled by a member a second ago, a
 * compliance hold on the token).
 *
 * The relayer has no power a member does not have. `disburse` is
 * permissionless and always pays `members[cycleIndex]`, so the worst this
 * route can do is pay the right person at the right time, earlier than someone
 * would have got round to it.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Circles are never deleted, so this list only grows. Reading all of them is
 * fine at the scale Rota is at and is not fine forever; the cap keeps one run
 * bounded and the report says when it bit, rather than the run quietly getting
 * slower until it times out.
 */
const MAX_CIRCLES_SCANNED = 250;

/** A cron run is not the place to discover a function timeout. */
const MAX_SENDS_PER_RUN = 8;
const TIME_BUDGET_MS = 45_000;

type Outcome =
  | { state: "paid"; hash: `0x${string}`; recipient: Address; cycle: number }
  | { state: "blocked"; reason: string; waitingOn: Address[] }
  | { state: "skipped"; reason: string };

type CircleReport = Outcome & { chainId: number; circleId: string };

type ChainReport = {
  chainId: number;
  label: string;
  relayer: Omit<RelayerFunding, "balance"> & { balance: string };
  circlesScanned: number;
  due: number;
  capped: boolean;
  circles: CircleReport[];
  error?: string;
};

/**
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 *
 * Fails CLOSED. Without a secret this endpoint would let anyone on the
 * internet spend the relayer's gas budget on repeated runs, and although each
 * run can only pay the right person, an attacker could still drain the gas
 * that the next legitimate round needs.
 */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Everything the preflight needs about one circle, in one batched round trip. */
async function inspect(
  client: PublicClient,
  rota: Address,
  circleId: bigint,
) {
  const [circle, members] = await Promise.all([
    client.readContract({
      address: rota,
      abi: ROTA_ABI,
      functionName: "getCircle",
      args: [circleId],
    }) as Promise<[bigint, bigint, bigint, number, boolean, bigint]>,
    client.readContract({
      address: rota,
      abi: ROTA_ABI,
      functionName: "getMembers",
      args: [circleId],
    }) as Promise<readonly Address[]>,
  ]);

  const [, , nextDueAt, cycleIndex, started] = circle;
  return { nextDueAt, cycleIndex, started, members };
}

async function runChain(
  deployment: Deployment,
  now: bigint,
  startedAt: number,
): Promise<ChainReport> {
  const client = readClient(deployment.chain as Chain);
  const address = relayerAddress();
  const funding = await relayerFunding(client, address);

  // One line per chain per run, greppable. The balance is the thing that
  // silently runs out, and it runs out between runs rather than during one.
  console.log(
    "[cron] relayer",
    JSON.stringify({
      chainId: deployment.chain.id,
      network: deployment.network,
      relayer: address,
      usdc: funding.formatted,
      low: funding.low,
      minimum: funding.minimum,
    }),
  );
  if (funding.low) {
    console.warn(
      `[cron] relayer is low: ${funding.formatted} USDC on ${deployment.label}, ` +
        `below the ${funding.minimum} USDC minimum. Top up ${address} or rounds will stop paying themselves.`,
    );
  }

  const report: ChainReport = {
    chainId: deployment.chain.id,
    label: deployment.label,
    relayer: { ...funding, balance: funding.balance.toString() },
    circlesScanned: 0,
    due: 0,
    capped: false,
    circles: [],
  };

  const count = (await client.readContract({
    address: deployment.rota,
    abi: ROTA_ABI,
    functionName: "circleCount",
  })) as bigint;

  const total = Number(count);
  const scan = Math.min(total, MAX_CIRCLES_SCANNED);
  report.capped = total > scan;
  report.circlesScanned = scan;

  // Newest first: a circle that is still running is far likelier to be a
  // recent one, and if the cap ever bites it should bite the finished ones.
  const ids = Array.from({ length: scan }, (_, i) => BigInt(total - 1 - i));

  const inspected = await Promise.all(
    ids.map(async (id) => {
      try {
        return { id, ...(await inspect(client, deployment.rota, id)) };
      } catch {
        return undefined;
      }
    }),
  );

  const dueNow = inspected.filter(
    (c) =>
      c !== undefined &&
      c.started &&
      c.members.length > 0 &&
      c.cycleIndex < c.members.length &&
      c.nextDueAt <= now,
  ) as NonNullable<(typeof inspected)[number]>[];

  report.due = dueNow.length;

  let sent = 0;
  for (const circle of dueNow) {
    const base = {
      chainId: deployment.chain.id,
      circleId: circle.id.toString(),
    };

    if (sent >= MAX_SENDS_PER_RUN || Date.now() - startedAt > TIME_BUDGET_MS) {
      report.circles.push({
        ...base,
        state: "skipped",
        reason: "Left for the next run: this one hit its send or time budget.",
      });
      continue;
    }

    /*
     * First check: who is not ready, and why, in the contract's own words.
     * This is the same view the circle page renders, so the reason the
     * scheduler gives and the reason a member reads are one fact, not two
     * that can disagree.
     */
    let statuses: readonly RoundStatus[];
    try {
      statuses = (await client.readContract({
        address: deployment.rota,
        abi: ROTA_ABI,
        functionName: "previewRound",
        args: [circle.id],
      })) as readonly RoundStatus[];
    } catch (error) {
      report.circles.push({
        ...base,
        state: "skipped",
        reason: `Could not read previewRound: ${(error as Error).message.slice(0, 120)}`,
      });
      continue;
    }

    const verdict = verdictFor(statuses);
    if (!verdict.send) {
      report.circles.push({
        ...base,
        state: "blocked",
        reason: verdict.reason,
        waitingOn: verdict.waitingOn,
      });
      console.log("[cron] blocked", JSON.stringify({ ...base, ...verdict }));
      continue;
    }

    /*
     * Second check: the call itself, against current state. previewRound
     * cannot see everything — the round may have been settled by a member
     * between the read above and now, the token may be paused, a member may
     * have been blocklisted. A simulation costs nothing and is the difference
     * between "did not send" and "sent and lost the gas".
     */
    try {
      await client.simulateContract({
        address: deployment.rota,
        abi: ROTA_ABI,
        functionName: "disburse",
        args: [circle.id],
        account: address,
      });
    } catch (error) {
      report.circles.push({
        ...base,
        state: "skipped",
        reason: `Would have reverted, so nothing was sent: ${
          (error as Error).message.split("\n")[0].slice(0, 160)
        }`,
      });
      continue;
    }

    try {
      const wallet = sendClient(deployment.chain as Chain);
      const hash = await wallet.writeContract({
        address: deployment.rota,
        abi: ROTA_ABI,
        functionName: "disburse",
        args: [circle.id],
        chain: deployment.chain as Chain,
        account: wallet.account!,
      });
      await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      sent++;

      report.circles.push({
        ...base,
        state: "paid",
        hash,
        recipient: circle.members[circle.cycleIndex],
        cycle: circle.cycleIndex,
      });
      console.log(
        "[cron] paid",
        JSON.stringify({ ...base, hash, cycle: circle.cycleIndex }),
      );
    } catch (error) {
      report.circles.push({
        ...base,
        state: "skipped",
        reason: `Send failed: ${(error as Error).message.split("\n")[0].slice(0, 160)}`,
      });
      console.error("[cron] send failed", JSON.stringify(base), error);
    }
  }

  return report;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    // Deliberately terse: an unauthenticated caller learns nothing about
    // whether a relayer exists or what it is holding.
    return Response.json({ message: "Not found" }, { status: 404 });
  }

  if (!relayerConfigured()) {
    console.error(`[cron] ${RELAYER_ENV} is not set; no round can be paid.`);
    return Response.json(
      {
        ok: false,
        message: `${RELAYER_ENV} is not set. Circles still work — members can pay their own round from the circle page.`,
      },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  const now = BigInt(Math.floor(startedAt / 1000));

  const chains: ChainReport[] = [];
  for (const deployment of DEPLOYMENTS) {
    try {
      chains.push(await runChain(deployment, now, startedAt));
    } catch (error) {
      console.error(
        "[cron] chain failed",
        JSON.stringify({ chainId: deployment.chain.id }),
        error,
      );
      chains.push({
        chainId: deployment.chain.id,
        label: deployment.label,
        relayer: {
          address: "0x" as Address,
          balance: "0",
          decimals: 6,
          formatted: "—",
          low: false,
          minimum: "—",
        },
        circlesScanned: 0,
        due: 0,
        capped: false,
        circles: [],
        error: (error as Error).message.slice(0, 200),
      });
    }
  }

  const paid = chains.flatMap((c) => c.circles).filter((c) => c.state === "paid");
  console.log(
    "[cron] run complete",
    JSON.stringify({
      ms: Date.now() - startedAt,
      chains: chains.length,
      due: chains.reduce((n, c) => n + c.due, 0),
      paid: paid.length,
    }),
  );

  return Response.json({ ok: true, ms: Date.now() - startedAt, chains });
}
