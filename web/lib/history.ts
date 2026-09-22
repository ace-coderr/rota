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
 * refuses anything over about 5,000 blocks — so a scan from the deploy block
 * is guaranteed to break as the chain grows, taking the public record with it.
 *
 * Contract state has no such limit. `getMembers` and `getCircle` are two
 * constant-cost calls that work on any RPC with no key, and between them they
 * say everything that actually happened: turn i paid members[i] the pot, and
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

  const pot = contribution * BigInt(Math.max(0, members.length - 1));
  const completed = Math.max(0, Math.min(cycleIndex, members.length));

  return Array.from({ length: completed }, (_, index) => ({
    index,
    recipient: members[index],
    amount: pot,
  }));
}

/** Window small enough for the public RPC, which rejects much above this. */
const WINDOW = 5_000n;

/** Hard ceiling on range queries, so a long-lived circle cannot hang the page. */
const MAX_RANGE_CALLS = 24;

/** Block timestamps are cheap point lookups, but still worth bounding. */
const MAX_BLOCK_LOOKUPS = 25;

export type DisbursementLinks = {
  byIndex: Record<number, { hash: `0x${string}`; timestamp?: bigint }>;
  /** True when a link was found for every completed turn. */
  complete: boolean;
  /** How many range queries were spent. */
  calls: number;
};

/**
 * Best-effort transaction links for turns we already know happened.
 *
 * Deliberately cannot reject: a provider that refuses the range, or a circle
 * old enough to exhaust the call budget, yields fewer links rather than an
 * error. The caller shows the history either way.
 */
export function useDisbursementLinks(
  deployment: Deployment | undefined,
  circleId: bigint | undefined,
  expected: number,
) {
  const publicClient = usePublicClient({ chainId: deployment?.chain.id });

  return useQuery<DisbursementLinks>({
    queryKey: [
      "disbursed-links",
      deployment?.chain.id,
      deployment?.rota,
      circleId?.toString(),
      expected,
    ],
    enabled:
      Boolean(publicClient && deployment) &&
      circleId !== undefined &&
      expected > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const client = publicClient as PublicClient;
      const byIndex: DisbursementLinks["byIndex"] = {};
      let calls = 0;

      try {
        const head = await client.getBlockNumber();
        let from = deployment!.deployBlock;
        const blocks = new Map<number, bigint>();

        while (from <= head && calls < MAX_RANGE_CALLS) {
          const end = from + WINDOW - 1n;
          const to = end > head ? head : end;

          const logs = await client.getContractEvents({
            address: deployment!.rota,
            abi: ROTA_ABI,
            eventName: "Disbursed",
            args: { circleId },
            fromBlock: from,
            toBlock: to,
          });
          calls++;

          for (const log of logs) {
            byIndex[Number(log.args.cycleIndex)] = {
              hash: log.transactionHash,
              timestamp: undefined,
            };
            blocks.set(Number(log.args.cycleIndex), log.blockNumber);
          }

          // Every turn accounted for: no reason to keep scanning.
          if (Object.keys(byIndex).length >= expected) break;
          from = to + 1n;
        }

        // Timestamps are point lookups, so the range cap does not apply.
        let lookups = 0;
        for (const [index, blockNumber] of blocks) {
          if (lookups >= MAX_BLOCK_LOOKUPS) break;
          try {
            const block = await client.getBlock({ blockNumber });
            byIndex[index].timestamp = block.timestamp;
            lookups++;
          } catch {
            // A missing timestamp just means that turn shows without a date.
          }
        }
      } catch {
        // Range refused, rate limited, offline — whatever the reason, the
        // history still renders from state. Return what was gathered.
      }

      return {
        byIndex,
        complete: Object.keys(byIndex).length >= expected,
        calls,
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
