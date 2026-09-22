/**
 * Deploys Rota, bound to Arc's USDC predeploy.
 *
 *   npx hardhat run scripts/deploy.ts --network arcTestnet
 *   npx hardhat run scripts/deploy.ts --network arcMainnet
 *
 * Mainnet is gated twice: MAINNET_PRIVATE_KEY must be set (the testnet key is
 * never accepted), and a human must type the confirmation at the prompt. There
 * is deliberately no flag to skip that prompt.
 *
 * Once the transaction is broadcast this script will NEVER send another one.
 * Everything after that point is read-only polling, because a deploy that has
 * already been mined must not be repeated just because a lookup was slow.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { formatUnits, type Hex } from "viem";

import { ERC20_ABI, USDC_ADDRESS } from "../lib/usdc.js";

const ARC_MAINNET_CHAIN_ID = 5042;

/** How long to keep looking for the receipt before handing over to a human. */
const RECEIPT_ATTEMPTS = 60;
const RECEIPT_INTERVAL_MS = 2_000;

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(
  readFileSync(
    resolve(here, "..", "artifacts", "contracts", "Rota.sol", "Rota.json"),
    "utf8",
  ),
) as { abi: unknown[]; bytecode: Hex };

const { viem, networkName } = await network.getOrCreate();

const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();

// Trust the chain, not the network name — a misconfigured RPC URL is exactly
// the mistake this is here to catch.
const chainId = await publicClient.getChainId();
const isMainnet = chainId === ARC_MAINNET_CHAIN_ID;

if (isMainnet && !process.env.MAINNET_PRIVATE_KEY?.trim()) {
  throw new Error(
    "Refusing to deploy to Arc mainnet (chain 5042): MAINNET_PRIVATE_KEY is not set.\n" +
      "Mainnet never uses PRIVATE_KEY. Set MAINNET_PRIVATE_KEY in .env and try again.",
  );
}

if (!wallet) {
  throw new Error(
    isMainnet
      ? "No wallet client. Check MAINNET_PRIVATE_KEY is a 32-byte hex key."
      : "No wallet client. Set PRIVATE_KEY in .env.",
  );
}

const deployer = wallet.account.address;

const decimals = await publicClient.readContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: "decimals",
});
const balance = await publicClient.readContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [deployer],
});
const nonce = await publicClient.getTransactionCount({ address: deployer });

console.log("");
console.log(`  network:   ${networkName}`);
console.log(`  chain id:  ${chainId}${isMainnet ? "  *** MAINNET — REAL MONEY ***" : ""}`);
console.log(`  deployer:  ${deployer}`);
console.log(`  usdc:      ${formatUnits(balance, Number(decimals))} USDC`);
console.log(`  token:     ${USDC_ADDRESS} (${decimals} decimals)`);
console.log(`  nonce:     ${nonce}`);
console.log("");

if (isMainnet) {
  // No env var, no flag. A person types this or nothing is sent.
  if (!process.stdin.isTTY) {
    throw new Error(
      "Refusing to deploy to mainnet without an interactive confirmation.\n" +
        "Run this command yourself in a terminal, so the prompt can reach you.",
    );
  }

  if (nonce > 0) {
    console.log(
      `  Note: this account has already sent ${nonce} transaction(s) on this chain.\n` +
        `  If that includes a Rota deployment, check the explorer before continuing.\n`,
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `  This deploys Rota to Arc MAINNET from ${deployer}.\n` +
      `  Type "deploy to mainnet" to continue, anything else to stop: `,
  );
  rl.close();

  if (answer.trim().toLowerCase() !== "deploy to mainnet") {
    console.log("\n  Stopped. Nothing was sent.");
    process.exit(1);
  }
  console.log("");
}

/**
 * Polls for the receipt, tolerating a node that has broadcast the transaction
 * but not yet indexed it.
 *
 * This is the whole reason the script does its own deployment rather than
 * using a helper: the helpers look the transaction up immediately after
 * broadcast, and on a node with any indexing lag that throws
 * TransactionNotFoundError — after the deploy has already been paid for and
 * mined. Losing the hash to a failed lookup is how a deploy gets repeated.
 */
async function waitForReceipt(hash: Hex) {
  for (let attempt = 1; attempt <= RECEIPT_ATTEMPTS; attempt++) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch {
      // Not indexed yet. This is expected, and is never a reason to resend.
    }

    if (attempt % 5 === 0) {
      console.log(
        `  still waiting for the receipt (${attempt * (RECEIPT_INTERVAL_MS / 1000)}s)…`,
      );
    }
    await new Promise((r) => setTimeout(r, RECEIPT_INTERVAL_MS));
  }
  return undefined;
}

// ---------------------------------------------------------------- broadcast

const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [USDC_ADDRESS],
});

// Printed before anything else can fail. If this script dies from here on,
// this line is what tells you the deploy is already paid for.
console.log(`  broadcast: ${hash}`);
console.log(`  waiting for it to be mined — do NOT re-run this script`);
console.log("");

const receipt = await waitForReceipt(hash);

if (!receipt) {
  console.log("");
  console.log(`  The transaction was sent but no receipt appeared in time.`);
  console.log(`  It is very likely mined. Check the explorer for:`);
  console.log(`    ${hash}`);
  console.log(`  DO NOT re-run this script — that would deploy a second copy.`);
  process.exit(1);
}

if (receipt.status !== "success") {
  console.log(`  The deployment transaction reverted: ${hash}`);
  process.exit(1);
}

const rotaAddress = receipt.contractAddress!;

// The invariant, asserted at birth.
const held = await publicClient.readContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [rotaAddress],
});

console.log(`Rota deployed`);
console.log(`  address:      ${rotaAddress}`);
console.log(`  deploy block: ${receipt.blockNumber}`);
console.log(`  deploy tx:    ${hash}`);
console.log(`  gas used:     ${receipt.gasUsed}`);
console.log(`  rota's usdc:  ${held} (must be 0)`);
console.log("");

const suffix = isMainnet ? "_MAINNET" : "";
console.log(`Add to web/.env.local:`);
console.log(`  NEXT_PUBLIC_ROTA_ADDRESS${suffix}=${rotaAddress}`);
console.log(`  NEXT_PUBLIC_ROTA_DEPLOY_BLOCK${suffix}=${receipt.blockNumber}`);
console.log("");
console.log(`Then publish the source so anyone can read it:`);
console.log(
  `  npx hardhat verify --network ${networkName} ${rotaAddress} ${USDC_ADDRESS}`,
);
