import { arcTestnet } from "./chains";

const BASE = arcTestnet.blockExplorers.default.url;

export const addressUrl = (address: string) => `${BASE}/address/${address}`;
export const txUrl = (hash: string) => `${BASE}/tx/${hash}`;

/** 0x1234…abcd */
export function short(value: string, lead = 6, tail = 4) {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
