"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { ERC20_ABI, USDC_ADDRESS } from "./usdc";
import { ROTA_ABI, ROTA_ADDRESS } from "./rota";

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
  const { address } = useAccount();

  const enabled = Boolean(ROTA_ADDRESS) && circleId !== undefined;

  const query = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: ROTA_ADDRESS,
        abi: ROTA_ABI,
        functionName: "getCircle",
        args: [circleId!],
      },
      {
        address: ROTA_ADDRESS,
        abi: ROTA_ABI,
        functionName: "getMembers",
        args: [circleId!],
      },
      {
        address: ROTA_ADDRESS,
        abi: ROTA_ABI,
        functionName: "previewRound",
        args: [circleId!],
      },
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "decimals",
      },
    ],
    query: { enabled },
  });

  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && ROTA_ADDRESS ? [address, ROTA_ADDRESS] : undefined,
    query: { enabled: Boolean(address && ROTA_ADDRESS) },
  });

  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const [raw, members, preview, decimals] = query.data ?? [];

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
    await Promise.all([query.refetch(), allowance.refetch(), balance.refetch()]);
  };

  return {
    circle,
    members: members as Address[] | undefined,
    preview: preview as readonly MemberStatus[] | undefined,
    decimals: decimals as number | undefined,
    myAllowance: allowance.data as bigint | undefined,
    myBalance: balance.data as bigint | undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetchAll,
  };
}
