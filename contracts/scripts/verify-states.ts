/*
 * Creates one testnet circle so the join and start button states exist on
 * screen, and then joins it from all three members.
 *
 * Testnet only, and deliberately not parameterised for anything else.
 *
 * Sizing matters here and is not arbitrary. A USDC allowance is one value per
 * spender, shared by every circle a member is in. So:
 *
 *   - the contribution has to be LARGER than the members' current allowances
 *     (0.01–0.02 USDC), or they read as already joined and the join button
 *     never appears;
 *   - joining must only ever RAISE an allowance, or circles 1 and 2 stop
 *     reading as ready and this verification damages the state it is
 *     verifying.
 *
 * 0.5 USDC per round satisfies both: the join approves 1.0 USDC, which is far
 * above what the existing circles need per round.
 *
 * Readiness is allowance AND balance, so members 2 and 3 also have to be able
 * to cover a round before the circle reads as startable — hence `fund`.
 *
 *   node --experimental-strip-types scripts/verify-states.ts create
 *   node --experimental-strip-types scripts/verify-states.ts approve
 *   node --experimental-strip-types scripts/verify-states.ts fund
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  erc20Abi,
  http,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ROTA_ABI } from "../../web/lib/rota-abi.ts";

const ROTA = "0x86Fc49612A3A7832865CCd65a5d7A5f689a5a808" as Address;
const USDC = "0x3600000000000000000000000000000000000000" as Address;
const RPC = "https://rpc.testnet.arc.network";
const EXPLORER = "https://explorer.testnet.arc.io";

/** 0.50 USDC a round, three members, so joining approves 1.00 USDC. */
const CONTRIBUTION = 500_000n;
const PERIOD = 3600n;

const envPath = join(import.meta.dirname, "..", "..", ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

const rawKey = env.PRIVATE_KEY;
if (!rawKey) throw new Error("PRIVATE_KEY missing from .env");
const key = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;

const chain = {
  id: 5042002,
  name: "Arc testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

/** Same derivation as scripts/e2e.ts, so this reuses the funded accounts. */
const derive = (index: number): Hex =>
  keccak256(encodePacked(["bytes32", "uint256"], [key, BigInt(index)]));

const accounts = [privateKeyToAccount(key), privateKeyToAccount(derive(1)), privateKeyToAccount(derive(2))];
const wallets = accounts.map((account) => createWalletClient({ account, chain, transport: http() }));
const addresses = accounts.map((a) => a.address);
const OWED = CONTRIBUTION * BigInt(addresses.length - 1);

const pub = createPublicClient({ chain, transport: http() });

async function confirm(label: string, hash: Hex) {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${label}: ${receipt.status}  ${EXPLORER}/tx/${hash}`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
}

const mode = process.argv[2];

if (mode === "create") {
  const chainId = await pub.getChainId();
  if (chainId !== chain.id) throw new Error(`refusing: connected to chain ${chainId}, not Arc testnet`);
  console.log("members:");
  for (const a of addresses) console.log(`  ${a}`);
  const hash = await wallets[0].writeContract({
    address: ROTA,
    abi: ROTA_ABI,
    functionName: "createCircle",
    args: [addresses, CONTRIBUTION, PERIOD],
  });
  await confirm("createCircle", hash);
  const count = await pub.readContract({ address: ROTA, abi: ROTA_ABI, functionName: "circleCount" });
  console.log(`circle id: ${count}`);
} else if (mode === "approve") {
  for (let i = 0; i < wallets.length; i++) {
    const before = (await pub.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "allowance",
      args: [addresses[i], ROTA],
    })) as bigint;
    if (before >= OWED) {
      console.log(`  ${addresses[i]}: already ${before}, skipping`);
      continue;
    }
    console.log(`  ${addresses[i]}: ${before} -> ${OWED}`);
    const hash = await wallets[i].writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [ROTA, OWED],
    });
    await confirm(`approve[${i}]`, hash);
  }
} else if (mode === "fund") {
  /*
   * On Arc, USDC is the native coin, so this same balance pays the gas. Top
   * members 2 and 3 up to a round plus a margin, from member 1.
   */
  const TARGET = CONTRIBUTION + 100_000n;
  for (let i = 1; i < addresses.length; i++) {
    const have = (await pub.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [addresses[i]],
    })) as bigint;
    if (have >= TARGET) {
      console.log(`  ${addresses[i]}: already ${have}, skipping`);
      continue;
    }
    const top = TARGET - have;
    console.log(`  ${addresses[i]}: ${have} + ${top} -> ${TARGET}`);
    const hash = await wallets[0].writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [addresses[i], top],
    });
    await confirm(`fund[${i}]`, hash);
  }
} else {
  throw new Error("usage: verify-states.ts create | approve | fund");
}
