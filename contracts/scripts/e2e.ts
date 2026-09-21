/**
 * End-to-end run of a full circle on a live network, with three addresses
 * derived from the deployer key so the run is repeatable and no funds are
 * stranded in throwaway accounts.
 *
 *   ROTA_ADDRESS=0x… npx hardhat run scripts/e2e.ts --network arcTestnet
 *
 * Members 2 and 3 are derived from the deployer key, then funded by member 1
 * with gas and USDC. Every transaction hash is printed with its explorer link.
 */
import { network } from "hardhat";
import {
  createWalletClient,
  formatUnits,
  http,
  keccak256,
  encodePacked,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ERC20_ABI, NATIVE_COIN_AUTHORITY, USDC_ADDRESS } from "../lib/usdc.js";

const ROTA_ADDRESS = process.env.ROTA_ADDRESS as Address | undefined;
if (!ROTA_ADDRESS) throw new Error("Set ROTA_ADDRESS to the deployed contract.");

const PERIOD = 60n; // one minute, so a 3-cycle run finishes in a few minutes
const CONTRIBUTION_WHOLE = "0.10"; // USDC per member per cycle
/**
 * On Arc, USDC *is* the native coin: balanceOf() is the native balance
 * truncated from 18 decimals to 6. So gas and contributions are spent from the
 * same pot. A member funded with exactly their rotation total goes short the
 * moment they pay for their own approve, so fund the rotation plus a buffer.
 */
const GAS_BUFFER_6DP = "0.05";

const { viem, networkName } = await network.getOrCreate();
const publicClient = await viem.getPublicClient();
const [deployerWallet] = await viem.getWalletClients();

const explorer = "https://testnet.arcscan.app";
const txLink = (hash: string) => `${explorer}/tx/${hash}`;

const deployerKey = (
  process.env.PRIVATE_KEY!.startsWith("0x")
    ? process.env.PRIVATE_KEY!
    : `0x${process.env.PRIVATE_KEY!}`
) as Hex;

/** Deterministic sub-accounts, so re-running reuses the same addresses. */
function derive(index: number): Hex {
  return keccak256(encodePacked(["bytes32", "uint256"], [deployerKey, BigInt(index)]));
}

const chain = deployerWallet.chain;
const member1 = deployerWallet;
const keys = [derive(1), derive(2)];
const members234 = keys.map((key) =>
  createWalletClient({
    account: privateKeyToAccount(key),
    chain,
    transport: http(),
  }),
);

const wallets = [member1, ...members234];
const addresses = wallets.map((w) => w.account!.address as Address);

const decimals = Number(
  await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  }),
);
const CONTRIBUTION = parseUnits(CONTRIBUTION_WHOLE, decimals);
const FULL_ROTATION = CONTRIBUTION * BigInt(addresses.length - 1);

const usdcOf = (who: Address) =>
  publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [who],
  }) as Promise<bigint>;

const fmt = (v: bigint) => `${formatUnits(v, decimals)} USDC`;

async function send(label: string, hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ${label}: ${receipt.status} — ${txLink(hash)}`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return receipt;
}

console.log(`network: ${networkName}`);
console.log(`rota:    ${ROTA_ADDRESS}`);
console.log(`usdc:    ${USDC_ADDRESS} (${decimals} decimals)`);
console.log("");
console.log("members:");
for (const [i, a] of addresses.entries()) {
  console.log(`  ${i + 1}. ${a}  ${fmt(await usdcOf(a))}`);
}

const rota = await viem.getContractAt("Rota", ROTA_ADDRESS);

// ---------------------------------------------------------------- fund 2 & 3
console.log("\n=== funding members 2 and 3 ===");
const TARGET = FULL_ROTATION + parseUnits(GAS_BUFFER_6DP, decimals);

for (const wallet of members234) {
  const who = wallet.account!.address as Address;
  const held = await usdcOf(who);

  if (held < TARGET) {
    // One transfer covers both roles, because they are the same balance.
    const hash = await member1.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [who, TARGET - held],
    });
    await send(`fund ${who} to ${fmt(TARGET)} (rotation + gas)`, hash);
  } else {
    console.log(`  ${who}: already funded (${fmt(held)})`);
  }
}

// -------------------------------------------------------------- create circle
console.log("\n=== create ===");
const createHash = await member1.writeContract({
  address: ROTA_ADDRESS,
  abi: rota.abi,
  functionName: "createCircle",
  args: [addresses, CONTRIBUTION, PERIOD],
});
const createReceipt = await send("createCircle", createHash);
const circleId = BigInt(
  createReceipt.logs.find(
    (l) => l.address.toLowerCase() === ROTA_ADDRESS.toLowerCase(),
  )!.topics[1]!,
);
console.log(`  circleId: ${circleId}`);

// ------------------------------------------------------------------- approve
console.log("\n=== approve (one signature each, whole rotation) ===");
for (const wallet of wallets) {
  const who = wallet.account!.address as Address;
  const hash = await wallet.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ROTA_ADDRESS, FULL_ROTATION],
  });
  await send(`approve ${fmt(FULL_ROTATION)} by ${who}`, hash);
}

// --------------------------------------------------------------------- start
console.log("\n=== start ===");
const startHash = await member1.writeContract({
  address: ROTA_ADDRESS,
  abi: rota.abi,
  functionName: "start",
  args: [circleId],
});
await send("start", startHash);

const opening = await Promise.all(addresses.map(usdcOf));

// ------------------------------------------------------------------ disburse
console.log("\n=== disburse ===");
for (let cycle = 0; cycle < addresses.length; cycle++) {
  const state = (await rota.read.getCircle([circleId])) as [
    bigint, bigint, bigint, number, boolean, bigint,
  ];
  const nextDueAt = state[2];

  // Wait for the cycle to fall due, against chain time.
  for (;;) {
    const block = await publicClient.getBlock();
    if (block.timestamp >= nextDueAt) break;
    const wait = Number(nextDueAt - block.timestamp) + 2;
    console.log(`  cycle ${cycle}: waiting ${wait}s for nextDueAt…`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }

  const hash = await member1.writeContract({
    address: ROTA_ADDRESS,
    abi: rota.abi,
    functionName: "disburse",
    args: [circleId],
  });
  const receipt = await send(
    `disburse cycle ${cycle} -> ${addresses[cycle]}`,
    hash,
  );

  const heldByRota = await usdcOf(ROTA_ADDRESS);
  console.log(`    rota's usdc balance: ${fmt(heldByRota)} ${heldByRota === 0n ? "(ok)" : "(INVARIANT BROKEN)"}`);

  // The custody invariant, checked against the real token rather than a mock.
  //
  // Every movement emits TWO Transfer logs with the same topic0 and the same
  // from/to: one from the USDC predeploy (6 decimals) and one from the native
  // coin authority (18 decimals). Counting both would report twice the
  // transfers at two different scales, so filter to the predeploy.
  const TRANSFER_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  const allTransfers = receipt.logs.filter(
    (log) => log.topics[0] === TRANSFER_TOPIC,
  );
  const fromPredeploy = allTransfers.filter(
    (log) => log.address.toLowerCase() === USDC_ADDRESS.toLowerCase(),
  );
  const fromAuthority = allTransfers.filter(
    (log) => log.address.toLowerCase() === NATIVE_COIN_AUTHORITY.toLowerCase(),
  );

  const expected = addresses.length - 1;
  const rotaLower = ROTA_ADDRESS.toLowerCase();
  const topicAddr = (topic: string) => ("0x" + topic.slice(26)).toLowerCase();

  for (const log of fromPredeploy) {
    const from = topicAddr(log.topics[1]!);
    const to = topicAddr(log.topics[2]!);
    if (from === rotaLower || to === rotaLower) {
      throw new Error(
        `INVARIANT BROKEN: cycle ${cycle} moved USDC ${from === rotaLower ? "out of" : "into"} Rota`,
      );
    }
  }

  if (fromPredeploy.length !== expected) {
    throw new Error(
      `cycle ${cycle}: expected ${expected} predeploy Transfer logs, saw ${fromPredeploy.length}`,
    );
  }

  console.log(
    `    transfers: ${fromPredeploy.length} from the predeploy (expected ${expected}), ` +
      `${fromAuthority.length} duplicate(s) from the native authority, ` +
      `Rota never an endpoint (ok)`,
  );
}

// -------------------------------------------------------------------- result
console.log("\n=== result ===");
const closing = await Promise.all(addresses.map(usdcOf));
for (const [i, who] of addresses.entries()) {
  const delta = closing[i] - opening[i];
  console.log(
    `  ${who}  ${fmt(opening[i])} -> ${fmt(closing[i])}  (net ${delta >= 0n ? "+" : ""}${formatUnits(delta, decimals)})`,
  );
}
console.log(`  complete: ${await rota.read.isComplete([circleId])}`);
console.log(`  rota's usdc: ${fmt(await usdcOf(ROTA_ADDRESS))}`);
console.log(`\n  circle page: /circle/${circleId}`);
console.log(`  proof page:  /proof/${circleId}`);
