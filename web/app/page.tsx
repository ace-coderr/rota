"use client";

import { formatUnits } from "viem";
import {
  useAccount,
  useBlockNumber,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
} from "wagmi";

import { ERC20_ABI, USDC_ADDRESS, USDC_DECIMALS } from "@/lib/usdc";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-black/10 py-2 dark:border-white/15">
      <span className="text-sm text-black/60 dark:text-white/60">{label}</span>
      <span className="font-mono text-sm break-all">{value}</span>
    </div>
  );
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  // USDC is read through the ERC-20 interface only. The native balance is
  // never queried here.
  const { data: decimals } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const resolvedDecimals = Number(decimals ?? USDC_DECIMALS);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Rota</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          USDC payments on Arc
        </p>
      </header>

      <section>
        <Row label="chain id" value={String(chainId)} />
        <Row label="latest block" value={blockNumber ? String(blockNumber) : "…"} />
        <Row label="usdc" value={USDC_ADDRESS} />
        <Row
          label="usdc decimals"
          value={decimals === undefined ? "…" : String(decimals)}
        />
        <Row
          label="usdc balance"
          value={
            !isConnected
              ? "connect a wallet"
              : balance === undefined
                ? "…"
                : `${formatUnits(balance, resolvedDecimals)} USDC`
          }
        />
      </section>

      <div className="flex flex-wrap gap-2">
        {isConnected ? (
          <>
            <span className="font-mono text-sm break-all">{address}</span>
            <button
              type="button"
              onClick={() => disconnect()}
              className="rounded-full border border-black/15 px-4 py-1.5 text-sm transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Disconnect
            </button>
          </>
        ) : (
          connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              onClick={() => connect({ connector })}
              disabled={isPending}
              className="rounded-full bg-foreground px-4 py-1.5 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Connect {connector.name}
            </button>
          ))
        )}
      </div>
    </main>
  );
}
