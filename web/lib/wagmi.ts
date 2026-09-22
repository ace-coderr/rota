import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import type { Chain } from "viem";

import { arcMainnet, arcTestnet } from "./chains";
import { SUPPORTED_CHAIN_IDS } from "./deployments";

/**
 * Both Arc chains are configured. Which one a person is actually on decides
 * which deployment the app talks to; a chain with no deployed contract is
 * treated as the wrong network.
 */
/**
 * Mainnet first when it is configured, so wagmi's default chain (chains[0])
 * matches DEFAULT_DEPLOYMENT. If those two disagree the app reads one chain
 * for a contract deployed on the other, and every read quietly returns
 * nothing.
 */
const chains: [Chain, ...Chain[]] = arcMainnet
  ? [arcMainnet, arcTestnet]
  : [arcTestnet];

export const wagmiConfig = createConfig({
  chains,
  transports: Object.fromEntries(chains.map((chain) => [chain.id, http()])),
  connectors: [injected()],
  ssr: true,
});

export { SUPPORTED_CHAIN_IDS };

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
