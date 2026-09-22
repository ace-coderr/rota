"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";

import type { Deployment } from "./deployments";
import { ROTA_ABI } from "./rota";

/**
 * The rotation history, rebuilt from contract state.
 *
 * Event scans cannot be the source of truth here. Arc adds roughly 170,000
 * blocks a day and every provider caps eth_getLogs by range — the public RPC
 * refuses anything much above 5,000 blocks — so a scan from the deploy block
 * is guaranteed to break as the chain grows, taking the public record with it.
 *
 * Contract state has no such limit. `getMembers` and `getCircle` are two
 * constant-cost calls that work on any RPC with no key, and between them they
 * say everything that actually happened: turn i paid members[i] everyone
 * else's share, and
 * cycleIndex says how many turns are done. Logs are used only to decorate that
 * with a transaction link, and are allowed to fail.
 */
export type Turn = {
  /** 0-based cycle index, as the contract counts them. */
  index: number;
  recipient: Address;
  amount: bigint;
  /** Only present when the log for this turn was found. */
  hash?: `0x${string}`;
  timestamp?: bigint;
};

/** Primary source. Derived purely from state, so this never fails. */
export function turnsFromState(
  members: readonly Address[] | undefined,
  cycleIndex: number,
  contribution: bigint,
): Turn[] {
  if (!members || members.length === 0) return [];

  // Everyone else's share, paid straight to whoever's turn it is.
  const payout = contribution * BigInt(Math.max(0, members.length - 1));
  const completed = Math.max(0, Math.min(cycleIndex, members.length));

  return Array.from({ length: completed }, (_, index) => ({
    index,
    recipient: members[index],
    amount: payout,
  }));
}

/** The schedule, which is what lets us find a turn without scanning for it. */
export type Schedule = {
  period: bigint;
  nextDueAt: bigint;
  cycleIndex: number;
};

/** Arc produces a block every ~0.5s, so two blocks per second. */
const BLOCKS_PER_SECOND = 2n;

/** Window small enough for the public RPC, which rejects much above this. */
const WINDOW = 5_000n;

/** A turn cannot have settled before it was due, but our estimate can overshoot. */
const BACK_OFF_BLOCKS = 500n;

/** Per turn, and overall, so a long circle cannot hang the page. */
const MAX_WINDOWS_PER_TURN = 3;
const MAX_TOTAL_RANGE_CALLS = 30;
const MAX_POINT_LOOKUPS = 45;

export type DisbursementLinks = {
  byIndex: Record<number, { hash: `0x${string}`; timestamp?: bigint }>;
  complete: boolean;
  calls: number;
};

/**
 * Converts a timestamp to a block number.
 *
 * A linear estimate from the head block gets close, then each point lookup
 * corrects it by the observed drift — which converges quickly because the
 * block rate is known and steady. Point lookups are not range queries, so no
 * provider caps them.
 */
async function blockAtTime(
  client: PublicClient,
  targetTs: bigint,
  head: bigint,
  headTs: bigint,
  spendLookup: () => boolean,
): Promise<bigint> {
  const clamp = (n: bigint) => (n < 0n ? 0n : n > head ? head : n);

  let guess = clamp(head - (headTs - targetTs) * BLOCKS_PER_SECOND);

  for (let step = 0; step < 4; step++) {
    if (!spendLookup()) break;

    let observed: bigint;
    try {
      observed = (await client.getBlock({ blockNumber: guess })).timestamp;
    } catch {
      break;
    }

    const drift = observed - targetTs;
    if (drift >= -2n && drift <= 2n) break;

    const next = clamp(guess - drift * BLOCKS_PER_SECOND);
    if (next === guess) break;
    guess = next;
  }

  return guess;
}

/**
 * Best-effort transaction links for turns we already know happened.
 *
 * Rather than sweeping forward from the deploy block — which grows without
 * bound and eventually exceeds any budget — each turn is looked up where it
 * must be. The schedule says when turn i fell due, the block rate says roughly
 * where that is, and `disburse` can only have run at or after that moment, so
 * a short forward scan from there finds it.
 *
 * Deliberately cannot reject: a refused range, a missing turn after a late
 * resync, or an exhausted budget yields fewer links rather than an error.
 */
export function useDisbursementLinks(
  deployment: Deployment | undefined,
  circleId: bigint | undefined,
  turns: Turn[],
  schedule: Schedule | undefined,
) {
  const publicClient = usePublicClient({ chainId: deployment?.chain.id });
  const expected = turns.length;

  return useQuery<DisbursementLinks>({
    queryKey: [
      "disbursed-links",
      deployment?.chain.id,
      deployment?.rota,
      circleId?.toString(),
      expected,
      schedule?.nextDueAt.toString(),
    ],
    enabled:
      Boolean(publicClient && deployment && schedule) &&
      circleId !== undefined &&
      expected > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const client = publicClient as PublicClient;
      const byIndex: DisbursementLinks["byIndex"] = {};
      const blocks = new Map<number, bigint>();
      let rangeCalls = 0;
      let lookups = 0;

      const spendLookup = () => {
        if (lookups >= MAX_POINT_LOOKUPS) return false;
        lookups++;
        return true;
      };

      try {
        const head = await client.getBlock();
        const headNumber = head.number!;
        const headTs = head.timestamp;

        const { period, nextDueAt, cycleIndex } = schedule!;

        for (const turn of turns) {
          if (byIndex[turn.index]) continue;
          if (rangeCalls >= MAX_TOTAL_RANGE_CALLS) break;

          /**
           * When this turn fell due. The schedule accumulates, so turn i was
           * due `cycleIndex - i` periods before the next one — unless a
           * disburse ran a whole period late and resynced the schedule to
           * now, in which case earlier turns estimate too late and are simply
           * not found. Those fall back to the explorer link.
           */
          const dueAt = nextDueAt - BigInt(cycleIndex - turn.index) * period;

          const dueBlock = await blockAtTime(
            client,
            dueAt,
            headNumber,
            headTs,
            spendLookup,
          );

          let from =
            dueBlock > BACK_OFF_BLOCKS ? dueBlock - BACK_OFF_BLOCKS : 0n;

          for (
            let window = 0;
            window < MAX_WINDOWS_PER_TURN &&
            from <= headNumber &&
            rangeCalls < MAX_TOTAL_RANGE_CALLS;
            window++
          ) {
            const end = from + WINDOW - 1n;
            const to = end > headNumber ? headNumber : end;

            const logs = await client.getContractEvents({
              address: deployment!.rota,
              abi: ROTA_ABI,
              eventName: "Disbursed",
              args: { circleId },
              fromBlock: from,
              toBlock: to,
            });
            rangeCalls++;

            // Keep every log this window turned up, not just the one we came
            // for: with a short period, one window covers several turns.
            for (const log of logs) {
              const index = Number(log.args.cycleIndex);
              byIndex[index] = { hash: log.transactionHash };
              blocks.set(index, log.blockNumber);
            }

            if (byIndex[turn.index]) break;
            from = to + 1n;
          }
        }

        for (const [index, blockNumber] of blocks) {
          if (!spendLookup()) break;
          try {
            byIndex[index].timestamp = (
              await client.getBlock({ blockNumber })
            ).timestamp;
          } catch {
            // A missing timestamp just means that turn shows without a date.
          }
        }
      } catch {
        // Whatever the reason, the history still renders from state.
      }

      return {
        byIndex,
        complete: Object.keys(byIndex).length >= expected,
        calls: rangeCalls,
      };
    },
  });
}

/** Merges best-effort links into the state-derived turns. */
export function withLinks(
  turns: Turn[],
  links: DisbursementLinks | undefined,
): Turn[] {
  if (!links) return turns;
  return turns.map((turn) => {
    const found = links.byIndex[turn.index];
    return found ? { ...turn, hash: found.hash, timestamp: found.timestamp } : turn;
  });
}
