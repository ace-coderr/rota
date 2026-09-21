/**
 * Deploys Rota, bound to Arc's USDC predeploy.
 *
 *   npx hardhat run scripts/deploy.ts --network arcTestnet
 *   npx hardhat run scripts/deploy.ts --network arcMainnet
 *
 * Prints the address and the deploy block, which are the two values the web
 * app needs in web/.env.local.
 *
 * Mainnet is gated twice: MAINNET_PRIVATE_KEY must be set (the testnet key is
 * never accepted), and a human must type the confirmation at the prompt. There
 * is deliberately no flag to skip that prompt.
 */
import { createInterface } from "node:readline/promises";
import { network } from "hardhat";
import { formatUnits } from "viem";

import { ERC20_ABI, USDC_ADDRESS } from "../lib/usdc.js";

const ARC_MAINNET_CHAIN_ID = 5042;

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

console.log("");
console.log(`  network:   ${networkName}`);
console.log(`  chain id:  ${chainId}${isMainnet ? "  *** MAINNET — REAL MONEY ***" : ""}`);
console.log(`  deployer:  ${deployer}`);
console.log(`  usdc:      ${formatUnits(balance, Number(decimals))} USDC`);
console.log(`  token:     ${USDC_ADDRESS} (${decimals} decimals)`);
console.log("");

if (isMainnet) {
  // No env var, no flag. A person types this or nothing is sent.
  if (!process.stdin.isTTY) {
    throw new Error(
      "Refusing to deploy to mainnet without an interactive confirmation.\n" +
        "Run this command yourself in a terminal, so the prompt can reach you.",
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

const { contract: rota, deploymentTransaction } =
  await viem.sendDeploymentTransaction("Rota", [USDC_ADDRESS]);

const receipt = await publicClient.waitForTransactionReceipt({
  hash: deploymentTransaction.hash,
});

// The invariant, asserted at birth.
const held = await publicClient.readContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [rota.address],
});

console.log(`Rota deployed`);
console.log(`  address:      ${rota.address}`);
console.log(`  deploy block: ${receipt.blockNumber}`);
console.log(`  deploy tx:    ${deploymentTransaction.hash}`);
console.log(`  usdc bound:   ${await rota.read.usdc()}`);
console.log(`  max members:  ${await rota.read.MAX_MEMBERS()}`);
console.log(`  rota's usdc:  ${held} (must be 0)`);
console.log("");
console.log(`Add to web/.env.local:`);

const suffix = isMainnet ? "_MAINNET" : "";
console.log(`  NEXT_PUBLIC_ROTA_ADDRESS${suffix}=${rota.address}`);
console.log(`  NEXT_PUBLIC_ROTA_DEPLOY_BLOCK${suffix}=${receipt.blockNumber}`);
console.log("");
console.log(`Then publish the source so anyone can read it:`);
console.log(
  `  npx hardhat verify --network ${networkName} ${rota.address} ${USDC_ADDRESS}`,
);
