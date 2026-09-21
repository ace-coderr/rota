import type { Address, Chain } from "viem";

import { arcMainnet, arcTestnet } from "./chains";

/**
 * Where Rota lives, per chain.
 *
 * Testnet and mainnet are separate deployments of the same contract, and the
 * app follows whichever chain the wallet is on rather than guessing. A chain
 * with no configured address simply is not offered.
 */
export type Deployment = {
  chain: Chain;
  rota: Address;
  /** Lower bound for event scans, so the proof page never asks for all time. */
  deployBlock: bigint;
  explorer: string;
  isTestnet: boolean;
  /** What to call it in front of a person. */
  label: string;
};

function build(
  chain: Chain | undefined,
  address: string | undefined,
  block: string | undefined,
  label: string,
  isTestnet: boolean,
): Deployment | undefined {
  if (!chain || !address) return undefined;
  return {
    chain,
    rota: address as Address,
    deployBlock: block ? BigInt(block) : 0n,
    explorer: chain.blockExplorers?.default.url ?? "",
    isTestnet,
    label,
  };
}

export const testnetDeployment = build(
  arcTestnet,
  process.env.NEXT_PUBLIC_ROTA_ADDRESS,
  process.env.NEXT_PUBLIC_ROTA_DEPLOY_BLOCK,
  "Arc testnet",
  true,
);

export const mainnetDeployment = build(
  arcMainnet,
  process.env.NEXT_PUBLIC_ROTA_ADDRESS_MAINNET,
  process.env.NEXT_PUBLIC_ROTA_DEPLOY_BLOCK_MAINNET,
  "Arc",
  false,
);

/** Mainnet first, so a connected wallet on mainnet is the ordinary case. */
export const DEPLOYMENTS: Deployment[] = [
  mainnetDeployment,
  testnetDeployment,
].filter((d): d is Deployment => Boolean(d));

/**
 * What to show someone who has not connected a wallet. Real money is the
 * default once it exists; testnet is the fallback while it does not.
 */
export const DEFAULT_DEPLOYMENT: Deployment | undefined =
  mainnetDeployment ?? testnetDeployment;

export function deploymentFor(chainId: number | undefined) {
  if (chainId === undefined) return DEFAULT_DEPLOYMENT;
  return DEPLOYMENTS.find((d) => d.chain.id === chainId);
}

export const SUPPORTED_CHAIN_IDS = DEPLOYMENTS.map((d) => d.chain.id);
