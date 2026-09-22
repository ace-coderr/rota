// This import makes the build fail if any client component ever pulls this
// file in. CIRCLE_API_KEY must never reach a browser: it can act on every
// user in the project, and Rota's whole claim is that nobody but the member
// can move their money.
import "server-only";

import {
  Blockchain,
  initiateUserControlledWalletsClient,
} from "@circle-fin/user-controlled-wallets";

/** Arc testnet and mainnet, as Circle names them. */
export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_MAINNET_CHAIN_ID = 5042;

/**
 * Circle supports Arc mainnet for user-controlled wallets — the supported
 * blockchains table lists "Arc (ARC / ARC-TESTNET)" with EOA and SCA under
 * User-controlled, and the SDK ships both enum values.
 */
export function circleBlockchain(chainId: number): Blockchain {
  switch (chainId) {
    case ARC_MAINNET_CHAIN_ID:
      return Blockchain.Arc;
    case ARC_TESTNET_CHAIN_ID:
      return Blockchain.ArcTestnet;
    default:
      throw new Error(`No Circle blockchain for chain ${chainId}`);
  }
}

let client: ReturnType<typeof initiateUserControlledWalletsClient> | undefined;

export function circle() {
  const apiKey = process.env.CIRCLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "CIRCLE_API_KEY is not set. It is a server-only secret; never expose it to the browser.",
    );
  }
  client ??= initiateUserControlledWalletsClient({ apiKey });
  return client;
}

/** Circle's errors carry useful codes; never leak the raw error to a client. */
export function circleError(error: unknown) {
  const err = error as { response?: { data?: { code?: number; message?: string } } };
  const code = err?.response?.data?.code;
  return {
    code: typeof code === "number" ? code : undefined,
    message: err?.response?.data?.message ?? "Circle request failed",
  };
}
