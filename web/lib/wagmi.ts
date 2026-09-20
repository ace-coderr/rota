import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import type { Chain } from "viem";

import { arcMainnet, arcTestnet } from "./chains";

const chains = [arcTestnet, ...(arcMainnet ? [arcMainnet] : [])] as [
  Chain,
  ...Chain[],
];

const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, http()]),
);

export const wagmiConfig = createConfig({
  chains,
  transports,
  connectors: [injected()],
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
