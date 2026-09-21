import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

const here = dirname(fileURLToPath(import.meta.url));

// Repo-root .env first, then a contracts-local .env may override it.
loadEnv({ path: resolve(here, "..", ".env"), quiet: true });
loadEnv({ path: resolve(here, ".env"), override: true, quiet: true });

const PRIVATE_KEY = process.env.PRIVATE_KEY?.trim();

// Mainnet gets its own key, always. A testnet key has typically been through
// faucets, scripts and chat windows; it must never be the one holding real
// money. Nothing here ever falls back from one to the other.
const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY?.trim();

// Arc mainnet is configured entirely from the environment: its chain id and RPC
// URL are deliberately not hardcoded in this repo.
const ARC_MAINNET_RPC_URL = process.env.ARC_MAINNET_RPC_URL?.trim() ?? "";
const ARC_MAINNET_CHAIN_ID = process.env.ARC_MAINNET_CHAIN_ID?.trim();

/**
 * Only accept a well-formed 32-byte key. A placeholder or truncated value in
 * .env would otherwise fail config validation and break every command,
 * including local compiles and tests that need no account at all.
 */
function accountsFrom(label: string, key: string | undefined): string[] {
  if (!key) return [];

  const hex = key.startsWith("0x") ? key.slice(2) : key;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return [`0x${hex}`];

  console.warn(
    `warning: ${label} in .env is not a 32-byte hex key (${hex.length} hex chars). ` +
      `Ignoring it — local commands still work, but anything needing an account will not.`,
  );
  return [];
}

const testnetAccounts = accountsFrom("PRIVATE_KEY", PRIVATE_KEY);
const mainnetAccounts = accountsFrom("MAINNET_PRIVATE_KEY", MAINNET_PRIVATE_KEY);

// arcMainnet is only registered once both env vars are present, so that no
// mainnet chain id or RPC URL is ever baked into this repo. Without them,
// `--network arcMainnet` fails fast instead of silently using a default.
const arcMainnet: NonNullable<HardhatUserConfig["networks"]> =
  ARC_MAINNET_RPC_URL && ARC_MAINNET_CHAIN_ID
    ? {
        arcMainnet: {
          type: "http" as const,
          chainId: Number(ARC_MAINNET_CHAIN_ID),
          url: ARC_MAINNET_RPC_URL,
          // Never testnetAccounts. Mainnet uses its own key or none at all.
          accounts: mainnetAccounts,
        },
      }
    : {};

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  chainDescriptors: {
    // Explorer metadata only. The mainnet *network* is still env-driven above;
    // this just tells `hardhat verify` where to publish the source.
    5042: {
      name: "Arc",
      blockExplorers: {
        blockscout: {
          name: "Arc Explorer",
          url: "https://explorer.arc.io",
          apiUrl: "https://explorer.arc.io/api",
        },
      },
    },
    5042002: {
      name: "Arc Testnet",
      blockExplorers: {
        blockscout: {
          name: "Arc Explorer",
          url: "https://explorer.testnet.arc.io",
          apiUrl: "https://explorer.testnet.arc.io/api",
        },
      },
    },
  },
  networks: {
    arcTestnet: {
      type: "http",
      chainId: 5042002,
      url: "https://rpc.testnet.arc.network",
      accounts: testnetAccounts,
    },
    ...arcMainnet,
  },
};

export default config;
