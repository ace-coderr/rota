"use client";

import { useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { deploymentFor } from "./deployments";
import { balanceForRound } from "./money";
import { ROTA_ABI } from "./rota";

/**
 * Every circle the connected address is in, found without an invite link.
 *
 * All contract state, no log scanning — the same rule the proof page follows
 * and for the same reason: Arc adds ~170,000 blocks a day and every provider
 * caps eth_getLogs by range, so anything built on a sweep from the deploy
 * block is guaranteed to break as the chain grows. `circleCount`, `getCircle`
 * and `getMembers` are constant-cost calls that work on any RPC with no key.
 *
 * The cost of that choice is honest: there is no index of "circles containing
 * this address", so finding them means reading circles and checking. That is
 * two calls each, which is why this pages rather than reading everything.
 */
export const SCAN_PAGE = 40;

export type CircleStanding =
  | "needs-join"
  | "waiting-to-start"
  | "running"
  | "complete";

/**
 * Where a circle sits, from this member's point of view.
 *
 * Pure so it can be tested directly: the ordering of the list depends on it,
 * and a circle sorted into the wrong bucket is a circle someone does not
 * realise is waiting for them.
 */
export function classify({
  started,
  cycleIndex,
  memberCount,
  joined,
}: {
  started: boolean;
  cycleIndex: number;
  memberCount: number;
  joined: boolean;
}): CircleStanding {
  // A circle that never started has cycleIndex 0 and at least two members, so
  // this cannot catch one by accident.
  if (memberCount > 0 && cycleIndex >= memberCount) return "complete";
  if (started) return "running";
  return joined ? "waiting-to-start" : "needs-join";
}

/**
 * What to put at the top.
 *
 * Anything needing this person comes first. "Waiting to start" sits BELOW
 * running rather than next to its sibling state, because there is nothing to
 * do in it — they have joined and the circle is waiting on other people. A
 * list sorted by lifecycle stage would bury the one circle that needs them
 * under four that do not.
 */
export const STANDING_RANK: Record<CircleStanding, number> = {
  "needs-join": 0,
  running: 1,
  "waiting-to-start": 2,
  complete: 3,
};

export type MyCircle = {
  id: bigint;
  contribution: bigint;
  period: bigint;
  nextDueAt: bigint;
  cycleIndex: number;
  started: boolean;
  members: readonly Address[];
  myIndex: number;
  joined: boolean;
  standing: CircleStanding;
  /** Whoever is being paid this round, if the circle is still running. */
  recipient?: Address;
  isMyTurn: boolean;
  /** Leaves this wallet at the next settlement. Zero on their own turn. */
  paysNext: bigint;
  /** Arrives instead, when it is their turn. */
  receives: bigint;
};

type RawCircle = readonly [bigint, bigint, bigint, number, boolean, bigint];

export function useMyCircles(you: Address | undefined, chainId: number | undefined) {
  const deployment = deploymentFor(chainId);
  const rota = deployment?.rota;
  const readChainId = deployment?.chain.id;

  const [pages, setPages] = useState(1);

  const countQuery = useReadContract({
    address: rota,
    abi: ROTA_ABI,
    functionName: "circleCount",
    chainId: readChainId,
    query: { enabled: Boolean(rota) },
  });

  const total =
    countQuery.data !== undefined ? Number(countQuery.data as bigint) : undefined;
  const scanned = total === undefined ? 0 : Math.min(total, pages * SCAN_PAGE);

  /* Newest first. A circle someone is still in is far likelier to be a recent
     one, so the first page is the one most likely to hold their answer. */
  const ids = useMemo(
    () =>
      total === undefined
        ? []
        : Array.from({ length: scanned }, (_, i) => BigInt(total - 1 - i)),
    [total, scanned],
  );

  /*
   * allowFailure, deliberately. A scan is a list, and one RPC hiccup on one
   * circle should cost that row rather than the page — the alternative is a
   * member who cannot reach ANY of their circles because an unrelated one
   * failed to read.
   */
  const details = useReadContracts({
    allowFailure: true,
    contracts: ids.flatMap((id) => [
      {
        address: rota,
        abi: ROTA_ABI,
        functionName: "getCircle" as const,
        args: [id] as const,
        chainId: readChainId,
      },
      {
        address: rota,
        abi: ROTA_ABI,
        functionName: "getMembers" as const,
        args: [id] as const,
        chainId: readChainId,
      },
    ]),
    query: { enabled: Boolean(rota) && ids.length > 0 },
  });

  /** The ones this address is actually in, before consent is known. */
  const mine = useMemo(() => {
    if (!details.data || !you) return [];
    const out: { id: bigint; raw: RawCircle; members: readonly Address[]; myIndex: number }[] =
      [];

    ids.forEach((id, index) => {
      const circle = details.data![index * 2];
      const members = details.data![index * 2 + 1];
      if (circle?.status !== "success" || members?.status !== "success") return;

      const list = members.result as readonly Address[];
      const myIndex = list.findIndex(
        (m) => m.toLowerCase() === you.toLowerCase(),
      );
      if (myIndex < 0) return;

      out.push({ id, raw: circle.result as RawCircle, members: list, myIndex });
    });
    return out;
  }, [details.data, ids, you]);

  /* Consent is per circle and is not implied by membership — the whole reason
     join() exists. Only asked for circles this address is in. */
  const joined = useReadContracts({
    allowFailure: true,
    contracts: mine.map((entry) => ({
      address: rota,
      abi: ROTA_ABI,
      functionName: "hasJoined" as const,
      args: [entry.id, you!] as const,
      chainId: readChainId,
    })),
    query: { enabled: Boolean(rota && you) && mine.length > 0 },
  });

  const circles: MyCircle[] = useMemo(() => {
    const built = mine.map((entry, index) => {
      const [contribution, period, nextDueAt, cycleIndex, started, memberCount] =
        entry.raw;
      const result = joined.data?.[index];
      const hasJoined =
        result?.status === "success" ? Boolean(result.result) : false;

      const count = Number(memberCount);
      const standing = classify({
        started,
        cycleIndex: Number(cycleIndex),
        memberCount: count,
        joined: hasJoined,
      });
      /*
       * Whoever sits at members[cycleIndex] is next to be paid — that is true
       * before the circle starts as well as after it. Reading it as a running
       * circle's property told the person first in the rotation that they
       * owed "nothing", which is true and useless: what they wanted to know
       * is that the first payout is theirs.
       */
      const isMyTurn =
        standing !== "complete" && entry.myIndex === Number(cycleIndex);

      return {
        id: entry.id,
        contribution,
        period,
        nextDueAt,
        cycleIndex: Number(cycleIndex),
        started,
        members: entry.members,
        myIndex: entry.myIndex,
        joined: hasJoined,
        standing,
        recipient:
          standing === "complete" ? undefined : entry.members[Number(cycleIndex)],
        isMyTurn,
        paysNext:
          standing === "complete"
            ? 0n
            : balanceForRound(contribution, entry.myIndex, Number(cycleIndex)),
        receives: isMyTurn ? contribution * BigInt(Math.max(0, count - 1)) : 0n,
      } satisfies MyCircle;
    });

    return built.sort(
      (a, b) =>
        STANDING_RANK[a.standing] - STANDING_RANK[b.standing] ||
        // Newest first inside a bucket, which is also most-recently-joined.
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
  }, [mine, joined.data]);

  return {
    circles,
    total,
    scanned,
    /** True while more circles exist than have been looked at. */
    more: total !== undefined && scanned < total,
    loadMore: () => setPages((n) => n + 1),
    isLoading:
      countQuery.isLoading ||
      (ids.length > 0 && details.isLoading) ||
      (mine.length > 0 && joined.isLoading),
    deployment,
  };
}
