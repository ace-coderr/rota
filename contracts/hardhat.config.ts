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

// Arc mainnet is configured entirely from the environment: its chain id and RPC
// URL are deliberately not hardcoded in this repo.
const ARC_MAINNET_RPC_URL = process.env.ARC_MAINNET_RPC_URL?.trim() ?? "";
const ARC_MAINNET_CHAIN_ID = process.env.ARC_MAINNET_CHAIN_ID?.trim();

const accounts = PRIVATE_KEY
  ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`]
  : [];

// arcMainnet is only registered once both env vars are present, so that no
// mainnet chain id or RPC URL is ever baked into this repo. Without them,
// `--network arcMainnet` fails fast instead of silently using a default.
const arcMainnet =
  ARC_MAINNET_RPC_URL && ARC_MAINNET_CHAIN_ID
    ? {
        arcMainnet: {
          type: "http" as const,
          chainId: Number(ARC_MAINNET_CHAIN_ID),
          url: ARC_MAINNET_RPC_URL,
          accounts,
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
    5042002: {
      name: "Arc Testnet",
      blockExplorers: {
        blockscout: {
          name: "Arcscan",
          url: "https://testnet.arcscan.app",
          apiUrl: "https://testnet.arcscan.app/api",
        },
      },
    },
  },
  networks: {
    arcTestnet: {
      type: "http",
      chainId: 5042002,
      url: "https://rpc.testnet.arc.network",
      accounts,
    },
    ...arcMainnet,
  },
};

export default config;
