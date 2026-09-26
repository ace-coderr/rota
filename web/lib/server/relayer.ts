// Holds a private key. This import makes the build fail if any client
// component ever pulls this file in.
import "server-only";

import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ERC20_ABI, USDC_ADDRESS } from "../usdc";

/**
 * The wallet that pays gas so nobody has to press anything.
 *
 * WHAT IT CAN DO: call `disburse(circleId)`, which is permissionless — the
 * same call the pay button makes, available to any address on the chain.
 *
 * WHAT IT CANNOT DO: anything else. Rota has no owner, no admin role and no
 * pause; `disburse` always pays `members[cycleIndex]` and never the caller;
 * and no member has ever granted this address an ERC-20 allowance, so it has
 * no way to move anyone's USDC directly either. Its only privilege is that it
 * is awake at the right time. See contracts/test/Relayer.t.ts, which proves
 * each of those.
 *
 * Its balance is read through the USDC ERC-20 at 6 decimals, never through the
 * 18-decimal native balance — the same rule as everywhere else in this app,
 * and it holds here because on Arc `balanceOf(x)` is the same money that pays
 * for gas.
 */
export const RELAYER_ENV = "RELAYER_PRIVATE_KEY";

/** Below this, the relayer is close to not being able to pay for a round. */
const DEFAULT_MIN_USDC = 1;

export type RelayerFunding = {
  address: Address;
  /** Raw, 6-decimal USDC. */
  balance: bigint;
  decimals: number;
  /** Formatted for a person. */
  formatted: string;
  low: boolean;
  minimum: string;
};

function requireKey(): `0x${string}` {
  const raw = process.env[RELAYER_ENV]?.trim();
  if (!raw) {
    throw new Error(
      `${RELAYER_ENV} is not set. It is a server-only secret — never NEXT_PUBLIC_.`,
    );
  }
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`${RELAYER_ENV} is not a 32-byte hex private key.`);
  }
  return key as `0x${string}`;
}

export function relayerConfigured() {
  return Boolean(process.env[RELAYER_ENV]?.trim());
}

/**
 * The relayer's address.
 *
 * Derived from the key rather than read from a second variable. An address and
 * a key that are configured separately can drift apart, and the failure is
 * silent: the UI would attribute rounds to an address that never paid for one.
 */
export function relayerAddress(): Address {
  return privateKeyToAccount(requireKey()).address;
}

/**
 * Batched over JSON-RPC rather than multicall3, which is a contract that may
 * or may not be deployed on a given chain. Batching is a transport feature and
 * needs nothing on chain.
 */
export function readClient(chain: Chain): PublicClient {
  return createPublicClient({
    chain,
    transport: http(undefined, { batch: true }),
  }) as PublicClient;
}

export function sendClient(chain: Chain): WalletClient {
  return createWalletClient({
    account: privateKeyToAccount(requireKey()),
    chain,
    transport: http(),
  });
}

/** What the relayer has left, and whether that is enough to keep going. */
export async function relayerFunding(
  client: PublicClient,
  address: Address,
): Promise<RelayerFunding> {
  const [decimals, balance] = await Promise.all([
    client.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "decimals",
    }) as Promise<number>,
    client.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    }) as Promise<bigint>,
  ]);

  const minimum = Number(
    process.env.RELAYER_MIN_USDC ?? String(DEFAULT_MIN_USDC),
  );
  const held = Number(formatUnits(balance, decimals));

  return {
    address,
    balance,
    decimals,
    formatted: held.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }),
    low: held < minimum,
    minimum: minimum.toFixed(2),
  };
}

/** One member's readiness, as `previewRound` reports it. */
export type RoundStatus = {
  member: Address;
  allowance: bigint;
  balance: bigint;
  joined: boolean;
  ready: boolean;
};

export type RoundVerdict =
  | { send: true }
  | { send: false; reason: string; waitingOn: Address[] };

/**
 * Whether this round can be settled, and if not, who everyone is waiting for.
 *
 * Pure, and separated from the route on purpose: this is the rule the whole
 * feature turns on. A relayer that sends a doomed transaction burns gas, tells
 * the members nothing, and looks exactly like a relayer that is broken — so
 * the one decision that must never be wrong is the one that is hardest to
 * observe in production. Here it can be tested directly.
 *
 * `ready` is the contract's own judgement, so this never re-implements the
 * arithmetic; it only sorts the unready into the two things a person can
 * actually do something about.
 */
export function verdictFor(statuses: readonly RoundStatus[]): RoundVerdict {
  if (statuses.length === 0) {
    return { send: false, reason: "No such circle.", waitingOn: [] };
  }

  const notReady = statuses.filter((s) => !s.ready);
  if (notReady.length === 0) return { send: true };

  const notJoined = notReady.filter((s) => !s.joined).map((s) => s.member);
  const short = notReady.filter((s) => s.joined).map((s) => s.member);

  return {
    send: false,
    reason:
      notJoined.length > 0 && short.length > 0
        ? "Some members have not joined and others are short."
        : notJoined.length > 0
          ? "Not everyone has joined yet."
          : "Someone does not have enough to cover this round.",
    waitingOn: [...notJoined, ...short],
  };
}
