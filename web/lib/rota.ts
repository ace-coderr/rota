import { ROTA_ABI } from "./rota-abi";

export { ROTA_ABI };

/**
 * Addresses now live in lib/deployments.ts, one per chain, because Rota is
 * deployed to both Arc testnet and Arc mainnet and the app follows whichever
 * chain the wallet is on.
 */
export {
  DEFAULT_DEPLOYMENT,
  DEPLOYMENTS,
  SUPPORTED_CHAIN_IDS,
  deploymentFor,
  type Deployment,
} from "./deployments";
