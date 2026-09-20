/**
 * Deploys Rota, bound to Arc's USDC predeploy.
 *
 *   npx hardhat run scripts/deploy.ts --network arcTestnet
 *
 * Prints the address and the deploy block, which are the two values the web
 * app needs in web/.env.local.
 */
import { network } from "hardhat";
import { formatUnits } from "viem";

import { ERC20_ABI, USDC_ADDRESS } from "../lib/usdc.js";

const { viem, networkName } = await network.getOrCreate();

const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();

if (!wallet) {
  throw new Error("No wallet client. Set PRIVATE_KEY in .env.");
}

const deployer = wallet.account.address;

console.log(`network:   ${networkName}`);
console.log(`deployer:  ${deployer}`);

// Sanity: the deployer should exist on this chain and hold USDC to be useful.
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
console.log(
  `usdc:      ${formatUnits(balance, Number(decimals))} USDC (${decimals} decimals)`,
);

const { contract: rota, deploymentTransaction } =
  await viem.sendDeploymentTransaction("Rota", [USDC_ADDRESS]);

const deployBlock = await publicClient.waitForTransactionReceipt({
  hash: deploymentTransaction.hash,
});

// The invariant, asserted at birth.
const held = await publicClient.readContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [rota.address],
});

console.log("");
console.log(`Rota deployed`);
console.log(`  address:      ${rota.address}`);
console.log(`  deploy block: ${deployBlock.blockNumber}`);
console.log(`  usdc bound:   ${await rota.read.usdc()}`);
console.log(`  max members:  ${await rota.read.MAX_MEMBERS()}`);
console.log(`  rota's usdc:  ${held} (must be 0)`);
console.log("");
console.log(`Add to web/.env.local:`);
console.log(`  NEXT_PUBLIC_ROTA_ADDRESS=${rota.address}`);
console.log(`  NEXT_PUBLIC_ROTA_DEPLOY_BLOCK=${deployBlock.blockNumber}`);
