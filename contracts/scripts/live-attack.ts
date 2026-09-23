/*
 * Runs the allowance-reuse attack against a LIVE deployment.
 *
 * The unit test proves the fix against a fresh in-memory contract. This proves
 * it against the bytecode that is actually on chain, with a real allowance
 * standing behind a real circle — which is the thing that was exploitable.
 *
 * Sends transactions. Testnet only; it refuses any other chain.
 *
 *   ROTA_ADDRESS=0x… node --experimental-strip-types scripts/live-attack.ts
 */
import { readFileSync } from "node:fs";
import { join as joinPath } from "node:path";

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

const ROTA = process.env.ROTA_ADDRESS as Address | undefined;
if (!ROTA) throw new Error("Set ROTA_ADDRESS to the deployed contract.");

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const RPC = "https://rpc.testnet.arc.network";
const EXPLORER = "https://explorer.testnet.arc.io";
const TESTNET_CHAIN_ID = 5042002;

/** Small enough to be cheap, large enough to be unambiguous in the logs. */
const CONTRIBUTION = 50_000n; // 0.05 USDC

const envPath = joinPath(import.meta.dirname, "..", "..", ".env");
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
  id: TESTNET_CHAIN_ID,
  name: "Arc testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const derive = (index: number): Hex =>
  keccak256(encodePacked(["bytes32", "uint256"], [key, BigInt(index)]));

/** victim is the deployer (it has balance); mallory is a derived account. */
const victimAccount = privateKeyToAccount(key);
const malloryAccount = privateKeyToAccount(derive(2));
const bystanderAccount = privateKeyToAccount(derive(1));

const victimW = createWalletClient({ account: victimAccount, chain, transport: http() });
const malloryW = createWalletClient({ account: malloryAccount, chain, transport: http() });

const victim = victimAccount.address;
const mallory = malloryAccount.address;
const bystander = bystanderAccount.address;

const pub = createPublicClient({ chain, transport: http() });

const usdcOf = (who: Address) =>
  pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
const allowanceOf = (who: Address) =>
  pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [who, ROTA] }) as Promise<bigint>;
const fmt = (v: bigint) => `${Number(v) / 1e6} USDC`;

async function send(label: string, hash: Hex) {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${label}: ${receipt.status} — ${EXPLORER}/tx/${hash}`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return receipt;
}

const chainId = await pub.getChainId();
if (chainId !== TESTNET_CHAIN_ID) {
  throw new Error(`refusing: connected to chain ${chainId}, not Arc testnet`);
}

console.log(`rota:     ${ROTA}`);
console.log(`victim:   ${victim}`);
console.log(`mallory:  ${mallory}`);

// ---------------------------------------------- the victim's genuine circle
console.log("\n=== the victim joins a circle they actually agreed to ===");
const before = await pub.readContract({ address: ROTA, abi: ROTA_ABI, functionName: "circleCount" });
const realId = before as bigint;

await send(
  "createCircle (real)",
  await victimW.writeContract({
    address: ROTA,
    abi: ROTA_ABI,
    functionName: "createCircle",
    args: [[victim, bystander], CONTRIBUTION, 3600n],
  }),
);
await send(
  "approve",
  await victimW.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [ROTA, CONTRIBUTION],
  }),
);
await send(
  "join (real circle)",
  await victimW.writeContract({
    address: ROTA,
    abi: ROTA_ABI,
    functionName: "join",
    args: [realId],
  }),
);

const liveAllowance = await allowanceOf(victim);
const victimBalanceBefore = await usdcOf(victim);
console.log(`  circle ${realId}: live allowance ${fmt(liveAllowance)}, balance ${fmt(victimBalanceBefore)}`);
if (liveAllowance < CONTRIBUTION) throw new Error("expected a live allowance to attack");

// ------------------------------------------------------- mallory's circle
console.log("\n=== a stranger builds a circle around the victim ===");
const attackId = (await pub.readContract({
  address: ROTA,
  abi: ROTA_ABI,
  functionName: "circleCount",
})) as bigint;

await send(
  "createCircle (attack)",
  await malloryW.writeContract({
    address: ROTA,
    abi: ROTA_ABI,
    functionName: "createCircle",
    // Mallory first, so Mallory is paid and pays nothing.
    args: [[mallory, victim], CONTRIBUTION, 1n],
  }),
);
await send(
  "approve (mallory)",
  await malloryW.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [ROTA, CONTRIBUTION],
  }),
);
await send(
  "join (mallory, own circle)",
  await malloryW.writeContract({
    address: ROTA,
    abi: ROTA_ABI,
    functionName: "join",
    args: [attackId],
  }),
);

console.log(`  victim joined the attack circle? ${await pub.readContract({
  address: ROTA, abi: ROTA_ABI, functionName: "hasJoined", args: [attackId, victim],
})}`);

// --------------------------------------------------------------- the attack
console.log("\n=== the attack ===");
let reverted = false;
try {
  await pub.simulateContract({
    address: ROTA,
    abi: ROTA_ABI,
    functionName: "start",
    args: [attackId],
    account: malloryAccount,
  });
  console.log("  start() SUCCEEDED — the contract is vulnerable");
} catch (error) {
  reverted = true;
  const message = error instanceof Error ? error.message : String(error);
  const named = message.toLowerCase().includes(victim.toLowerCase());
  console.log(`  start() reverted: ${/NotJoined/.test(message) ? "NotJoined" : "(unexpected error)"}`);
  console.log(`  names the victim: ${named ? "yes" : "NO"}`);
  if (!/NotJoined/.test(message)) throw new Error(`expected NotJoined, got:\n${message}`);
  if (!named) throw new Error("revert did not name the member who had not joined");
}

if (!reverted) throw new Error("ATTACK SUCCEEDED — the fix is not on this deployment");

const victimBalanceAfter = await usdcOf(victim);
const allowanceAfter = await allowanceOf(victim);

console.log("\n=== result ===");
console.log(`  victim balance:   ${fmt(victimBalanceBefore)} -> ${fmt(victimBalanceAfter)}`);
console.log(`  victim allowance: ${fmt(liveAllowance)} -> ${fmt(allowanceAfter)}`);
if (victimBalanceAfter !== victimBalanceBefore) throw new Error("the victim lost money");
if (allowanceAfter !== liveAllowance) throw new Error("the victim's allowance was consumed");
console.log("  attack blocked: nothing moved, the genuine circle can still settle");
