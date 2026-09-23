"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { ERC20_ABI, USDC_ADDRESS, USDC_ARC_ABI } from "./usdc";
import { ROTA_ABI } from "./rota";
import { deploymentFor } from "./deployments";

export type MemberStatus = {
  member: Address;
  allowance: bigint;
  balance: bigint;
  ready: boolean;
};

export type CircleState = {
  contribution: bigint;
  period: bigint;
  nextDueAt: bigint;
  cycleIndex: number;
  started: boolean;
  memberCount: bigint;
};

/**
 * USDC decimals, read from the predeploy. Every amount in this app is
 * formatted with this value; 6 is never hardcoded and the native balance is
 * never read.
 */
export function useUsdcDecimals() {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  });
}

/**
 * Everything the circle page needs, in one batch so a single refetch after a
 * transaction brings the whole page up to date.
 */
export function useCircle(circleId: bigint | undefined) {
  const { address, chainId } = useAccount();

  // Follow the wallet's chain; fall back to the default deployment when there
  // is no wallet, so the read-only views still work.
  const deployment = deploymentFor(chainId);
  const ROTA_ADDRESS = deployment?.rota;
  // Always name the chain. Without it the reads go to wagmi's default chain,
  // which may not be the one this contract is deployed on.
  const readChainId = deployment?.chain.id;

  const enabled = Boolean(ROTA_ADDRESS) && circleId !== undefined;

  const query = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: ROTA_ADDRESS,
        abi: ROTA_ABI,
        functionName: "getCircle",
        args: [circleId!],
        chainId: readChainId,
      },
      {
        address: ROTA_ADDRESS,
        abi: ROTA_ABI,
        functionName: "getMembers",
        args: [circleId!],
        chainId: readChainId,
      },
      {
        address: ROTA_ADDRESS,
        abi: ROTA_ABI,
        functionName: "previewRound",
        args: [circleId!],
        chainId: readChainId,
      },
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "decimals",
        chainId: readChainId,
      },
    ],
    query: { enabled },
  });

  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    chainId: readChainId,
    args: address && ROTA_ADDRESS ? [address, ROTA_ADDRESS] : undefined,
    query: { enabled: Boolean(address && ROTA_ADDRESS) },
  });

  /**
   * How many circles exist. Needed so a wrong circle number can say what the
   * right ones are — IDs are zero-based, so with four circles the valid range
   * is 0 to 3 and /circle/4 is the easiest mistake to make.
   *
   * Read independently of the circle itself: it has to answer even when the
   * id in the URL is not a number at all, which disables the reads above.
   */
  const circleCount = useReadContract({
    address: ROTA_ADDRESS,
    abi: ROTA_ABI,
    functionName: "circleCount",
    chainId: readChainId,
    query: { enabled: Boolean(ROTA_ADDRESS) },
  });

  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    chainId: readChainId,
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const [raw, members, preview, decimals] = query.data ?? [];

  const memberList = members as Address[] | undefined;

  /**
   * Protocol-level blocklist state, read straight from the predeploy.
   *
   * Rota is the `spender` on every transferFrom, so if Rota itself is blocked
   * no cycle can settle at all. Members are checked too: the token delegates
   * from/to compliance to the native coin authority, which surfaces as a
   * failed transfer rather than a named error, so knowing up front is the only
   * way to explain it before anyone signs.
   */
  const blocklist = useReadContracts({
    allowFailure: false,
    contracts: [
      ...(memberList ?? []).map((member) => ({
        address: USDC_ADDRESS,
        abi: USDC_ARC_ABI,
        functionName: "isBlacklisted" as const,
        args: [member] as const,
        chainId: readChainId,
      })),
      {
        address: USDC_ADDRESS,
        abi: USDC_ARC_ABI,
        functionName: "isBlacklisted" as const,
        args: [ROTA_ADDRESS!] as const,
        chainId: readChainId,
      },
    ],
    query: { enabled: Boolean(memberList?.length && ROTA_ADDRESS) },
  });

  const blocklistFlags = blocklist.data as boolean[] | undefined;
  const rotaBlocked = blocklistFlags
    ? blocklistFlags[blocklistFlags.length - 1]
    : undefined;
  const blockedMembers: Address[] =
    blocklistFlags && memberList
      ? memberList.filter((_, index) => blocklistFlags[index])
      : [];

  const circle: CircleState | undefined = raw
    ? {
        contribution: raw[0],
        period: raw[1],
        nextDueAt: raw[2],
        cycleIndex: raw[3],
        started: raw[4],
        memberCount: raw[5],
      }
    : undefined;

  /** Re-reads every value this page shows. Call after a tx confirms. */
  const refetchAll = async () => {
    await Promise.all([
      query.refetch(),
      allowance.refetch(),
      balance.refetch(),
      blocklist.refetch(),
      circleCount.refetch(),
    ]);
  };

  return {
    circle,
    members: memberList,
    blockedMembers,
    rotaBlocked,
    preview: preview as readonly MemberStatus[] | undefined,
    decimals: decimals as number | undefined,
    myAllowance: allowance.data as bigint | undefined,
    myBalance: balance.data as bigint | undefined,
    circleCount: circleCount.data as bigint | undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetchAll,
  };
}
