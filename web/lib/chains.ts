import { defineChain } from "viem";

/**
 * Arc's native gas token is represented with 18 decimals at the protocol level.
 * The `nativeCurrency` block below is chain metadata required by viem — it is
 * not a balance source. Rota never reads or writes the native balance; every
 * amount in this app goes through the 6-decimal USDC ERC-20 in `lib/usdc.ts`.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

/**
 * Arc mainnet is configured from the environment only — its chain id and RPC
 * URL are never hardcoded here. Set NEXT_PUBLIC_ARC_MAINNET_CHAIN_ID and
 * NEXT_PUBLIC_ARC_MAINNET_RPC_URL to enable it.
 */
const mainnetChainId = process.env.NEXT_PUBLIC_ARC_MAINNET_CHAIN_ID;
const mainnetRpcUrl = process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL;

export const arcMainnet =
  mainnetChainId && mainnetRpcUrl
    ? defineChain({
        id: Number(mainnetChainId),
        name: "Arc",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: {
          default: { http: [mainnetRpcUrl] },
        },
        blockExplorers: {
          default: { name: "Arcscan", url: "https://arcscan.app" },
        },
      })
    : undefined;
