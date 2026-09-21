/**
 * Explorer links are per-chain: testnet and mainnet have different explorers,
 * so the base URL comes from the active deployment rather than a constant.
 */
export const addressUrl = (base: string, address: string) =>
  `${base}/address/${address}`;

export const txUrl = (base: string, hash: string) => `${base}/tx/${hash}`;
