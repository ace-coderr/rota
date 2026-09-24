import { formatUnits, parseUnits } from "viem";

/**
 * Formats a USDC amount using the decimals read from the token itself.
 * `decimals` is required on purpose: this app never assumes 6, and never reads
 * the native balance.
 */
export function money(
  amount: bigint | undefined,
  decimals: number | undefined,
) {
  if (amount === undefined || decimals === undefined) return "—";
  const value = Number(formatUnits(amount, decimals));
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Same, but keeps small amounts honest instead of rounding them to 0.00. */
export function moneyExact(
  amount: bigint | undefined,
  decimals: number | undefined,
) {
  if (amount === undefined || decimals === undefined) return "—";
  const asString = formatUnits(amount, decimals);
  const value = Number(asString);
  if (value !== 0 && value < 0.01) return asString;
  return money(amount, decimals);
}

export function parseMoney(input: string, decimals: number) {
  return parseUnits(input, decimals);
}

function clockTime(date: Date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours < 12 ? "am" : "pm";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${twelve}${suffix}`
    : `${twelve}:${String(minutes).padStart(2, "0")}${suffix}`;
}

/**
 * A time a person can act on: "Tuesday at 3pm", in their own timezone.
 * Never a countdown, never a UTC timestamp.
 */
export function whenInWords(seconds: bigint | undefined): string {
  if (seconds === undefined || seconds === 0n) return "—";

  const date = new Date(Number(seconds) * 1000);
  const now = new Date();

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(date) - startOfDay(now)) / (24 * 60 * 60 * 1000),
  );

  const time = clockTime(date);

  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days === -1) return `yesterday at ${time}`;

  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  if (days > 1 && days < 7) return `${weekday} at ${time}`;

  const full = date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `${full} at ${time}`;
}

/** A past moment, for the record of what already happened. */
export function dateInWords(seconds: bigint | undefined): string {
  if (seconds === undefined || seconds === 0n) return "—";
  const date = new Date(Number(seconds) * 1000);
  return `${date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}, ${clockTime(date)}`;
}

/** How often money changes hands, in words rather than seconds. */
export function everyInWords(seconds: bigint | undefined): string {
  if (seconds === undefined) return "—";
  const s = Number(seconds);
  const plural = (n: number, unit: string) =>
    n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;

  // 30 days is what the setup form calls "every month", so say it that way
  // rather than making someone translate 2,592,000 seconds back into a month.
  if (s % 2592000 === 0) return plural(s / 2592000, "month");
  // The setup form offers this one as "every fortnight", so it says that back
  // rather than "every 2 weeks" — the same period under a different name in
  // the two places you meet it reads as two different schedules.
  if (s === 1209600) return "every fortnight";
  if (s % 604800 === 0) return plural(s / 604800, "week");
  if (s % 86400 === 0) return plural(s / 86400, "day");
  if (s % 3600 === 0) return plural(s / 3600, "hour");
  if (s % 60 === 0) return plural(s / 60, "minute");
  return `every ${s} seconds`;
}

export const sameAddress = (a?: string, b?: string) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** 0x1234…abcd — for the rare places an address is shown at all. */
export function shortAddress(value: string) {
  if (value.length <= 13) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/**
 * Joins names the way a person would say them, and stops before it becomes a
 * wall of text. Seventeen bold names in a row reads as a crisis; "and 14
 * others" reads as a fact.
 */
export function nameList(names: string[], max = 3): string {
  if (names.length === 0) return "Someone";
  if (names.length === 1) return names[0];

  if (names.length <= max) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  const shown = names.slice(0, max).join(", ");
  const rest = names.length - max;
  return `${shown} and ${rest} ${rest === 1 ? "other" : "others"}`;
}
