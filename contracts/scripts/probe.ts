/**
 * Connectivity probe for Arc.
 *
 * Prints the chain id (decimal + hex), the latest block number, and the USDC
 * balance of the configured address. The balance is read through the ERC-20
 * interface using the token's own decimals(); the native 18-decimal balance is
 * never touched.
 *
 *   npx hardhat run scripts/probe.ts --network arcTestnet
 */
import { network } from "hardhat";
import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ERC20_ABI, USDC_ADDRESS, USDC_DECIMALS } from "../lib/usdc.js";

function resolveAddress(): Address | undefined {
  const explicit = process.env.ADDRESS?.trim();
  if (explicit) {
    if (!isAddress(explicit)) {
      throw new Error(`ADDRESS is not a valid address: ${explicit}`);
    }
    return getAddress(explicit);
  }

  const key = process.env.PRIVATE_KEY?.trim();
  if (!key) return undefined;

  const hex = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  return privateKeyToAccount(hex).address;
}

const { viem, networkName } = await network.getOrCreate();
const publicClient = await viem.getPublicClient();

console.log(`network:       ${networkName}`);

// eth_chainId, called directly so the probe reflects what the node reports
// rather than what the config claims.
const chainIdHex = (await publicClient.request({
  method: "eth_chainId",
})) as `0x${string}`;
const chainId = Number(BigInt(chainIdHex));

console.log(`chain id:      ${chainId} (${chainIdHex})`);

const blockNumber = await publicClient.getBlockNumber();
console.log(`latest block:  ${blockNumber}`);

console.log(`usdc:          ${USDC_ADDRESS}`);

const decimals = await publicClient.readContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: "decimals",
});
console.log(`usdc decimals: ${decimals}`);

if (Number(decimals) !== USDC_DECIMALS) {
  console.warn(
    `warning: token reports ${decimals} decimals, expected ${USDC_DECIMALS}`,
  );
}

const address = resolveAddress();
if (!address) {
  console.log(
    "usdc balance:  skipped (set PRIVATE_KEY or ADDRESS in .env to read it)",
  );
} else {
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  console.log(`address:       ${address}`);
  console.log(
    `usdc balance:  ${formatUnits(balance, Number(decimals))} USDC (${balance} base units)`,
  );
}
