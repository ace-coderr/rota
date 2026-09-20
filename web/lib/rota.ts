import type { Address } from "viem";

import { ROTA_ABI } from "./rota-abi";

export { ROTA_ABI };

/**
 * Deployed Rota address on Arc testnet. Set NEXT_PUBLIC_ROTA_ADDRESS in
 * web/.env.local (see web/.env.example).
 */
export const ROTA_ADDRESS = process.env.NEXT_PUBLIC_ROTA_ADDRESS as
  | Address
  | undefined;

/**
 * Block Rota was deployed in. Used as the lower bound when scanning for
 * Disbursed events, so the proof page does not ask the RPC for the full
 * history of the chain.
 */
export const ROTA_DEPLOY_BLOCK = process.env.NEXT_PUBLIC_ROTA_DEPLOY_BLOCK
  ? BigInt(process.env.NEXT_PUBLIC_ROTA_DEPLOY_BLOCK)
  : 0n;

export const isConfigured = Boolean(ROTA_ADDRESS);
