"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { DEFAULT_DEPLOYMENT } from "@/lib/deployments";
import { CircleWalletProvider } from "@/lib/wallet/circle";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/wallet/chains-ids";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <CircleWalletProvider
          chainId={DEFAULT_DEPLOYMENT?.chain.id ?? ARC_TESTNET_CHAIN_ID}
        >
          {children}
        </CircleWalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
