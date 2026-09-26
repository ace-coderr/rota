"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import type { Address } from "viem";

import { deploymentFor } from "./deployments";

export type Relayer =
  | { configured: false }
  | {
      configured: true;
      address: Address;
      chainId?: number;
      /** Formatted USDC. Absent when the balance read failed. */
      usdc?: string;
      low?: boolean;
      minimum?: string;
    };

/**
 * Who pays for automatic rounds on this chain.
 *
 * Never allowed to fail loudly: a circle works whether or not a relayer
 * exists, so a failed fetch here resolves to "not configured" and the page
 * falls back to describing the manual button. The one thing that must not
 * happen is a page that cannot be read because the optional convenience
 * layer is down.
 */
export function useRelayer() {
  const { chainId } = useAccount();
  const deployment = deploymentFor(chainId);

  return useQuery<Relayer>({
    queryKey: ["relayer", deployment?.chain.id],
    // Nothing here changes minute to minute except the balance, and the
    // balance is advisory.
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const query = deployment ? `?chainId=${deployment.chain.id}` : "";
      try {
        const response = await fetch(`/api/relayer${query}`);
        if (!response.ok) return { configured: false };
        return (await response.json()) as Relayer;
      } catch {
        return { configured: false };
      }
    },
  });
}
