import { formatUnits, parseUnits } from "viem";

/**
 * Formats a USDC base-unit amount using the decimals read from the token
 * itself. `decimals` is intentionally required: this app never assumes 6 and
 * never reads the 18-decimal native balance.
 */
export function formatUsdc(
  amount: bigint | undefined,
  decimals: number | undefined,
) {
  if (amount === undefined || decimals === undefined) return "…";
  return formatUnits(amount, decimals);
}

export function parseUsdc(input: string, decimals: number) {
  return parseUnits(input, decimals);
}

/** Seconds -> a rough human phrase, for a functional pass only. */
export function describePeriod(seconds: bigint | undefined) {
  if (seconds === undefined) return "…";
  const s = Number(seconds);
  if (s % 86400 === 0) return `${s / 86400} day(s) (${s}s)`;
  if (s % 3600 === 0) return `${s / 3600} hour(s) (${s}s)`;
  if (s % 60 === 0) return `${s / 60} minute(s) (${s}s)`;
  return `${s}s`;
}

export function formatTimestamp(seconds: bigint | undefined) {
  if (seconds === undefined || seconds === 0n) return "—";
  return new Date(Number(seconds) * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export const sameAddress = (a?: string, b?: string) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());
