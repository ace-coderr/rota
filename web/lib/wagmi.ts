import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { arcTestnet } from "./chains";

/**
 * Arc testnet only for now. arcMainnet exists in lib/chains.ts but is
 * deliberately not wired up until the contract has been exercised on testnet.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
  connectors: [injected()],
  ssr: true,
});

export const EXPECTED_CHAIN_ID = arcTestnet.id;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
