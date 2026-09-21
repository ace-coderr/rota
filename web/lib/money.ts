/**
 * What a person actually needs in their wallet — as ONE number.
 *
 * On Arc, USDC is the native coin: the money you contribute and the money that
 * pays the network fee come out of the same balance. Showing "your share" and
 * "network fee" as two figures is therefore not just jargon, it is wrong — a
 * person funded with exactly their share goes short the moment they sign
 * anything. So everything here folds the fee into the total and shows one
 * figure.
 */

/** A generous fee allowance, in gas, for the transactions one person signs. */
const GAS_ALLOWANCE = 250_000n;

/** Never quote less than this much headroom (0.01 USDC at 6 decimals). */
const MINIMUM_BUFFER = 10_000n;

/** Round buffers up to whole cents so the quoted number stays legible. */
const CENT = 10_000n;

/**
 * Converts a fee estimate into the same 6-decimal units as USDC.
 *
 * gasPrice is a price, not a balance — the 18-decimal native balance is still
 * never read anywhere in this app. Native is 10^12 times finer than USDC, so
 * the fee scales down by that factor.
 */
export function feeBuffer(gasPrice: bigint | undefined): bigint {
  if (!gasPrice) return MINIMUM_BUFFER;

  const feeIn6dp = (gasPrice * GAS_ALLOWANCE) / 10n ** 12n;
  const rounded = ((feeIn6dp + CENT - 1n) / CENT) * CENT;
  return rounded > MINIMUM_BUFFER ? rounded : MINIMUM_BUFFER;
}

/**
 * How many more contributions this person owes.
 *
 * Everyone pays once per cycle except the cycle where they are the one being
 * paid. So from the current cycle onward, it is every remaining cycle, less
 * their own turn if it has not happened yet.
 */
export function paymentsRemaining(
  memberIndex: number,
  cycleIndex: number,
  memberCount: number,
): number {
  if (memberCount === 0) return 0;
  const cyclesLeft = Math.max(0, memberCount - cycleIndex);
  const ownTurnAhead = memberIndex >= cycleIndex;
  return Math.max(0, cyclesLeft - (ownTurnAhead ? 1 : 0));
}

/**
 * The single figure to put in front of a person: everything they still owe
 * across the rest of the circle, plus the fees for signing it.
 */
export function walletNeeded(
  contribution: bigint,
  memberIndex: number,
  cycleIndex: number,
  memberCount: number,
  buffer: bigint,
): bigint {
  const owed =
    contribution *
    BigInt(paymentsRemaining(memberIndex, cycleIndex, memberCount));
  return owed === 0n ? 0n : owed + buffer;
}

/** What still has to be signed over for the rest of the circle to settle. */
export function permissionNeeded(
  contribution: bigint,
  memberIndex: number,
  cycleIndex: number,
  memberCount: number,
): bigint {
  return (
    contribution *
    BigInt(paymentsRemaining(memberIndex, cycleIndex, memberCount))
  );
}

/* ------------------------------------------------------------------------ *
 * Per-round checks: exactly what the contract will test for the next action.
 *
 * The group view uses these, not the whole-circle total. Judging everyone
 * against their full remaining obligation flags people the contract would
 * happily settle with, and it puts one member's future finances in front of
 * the others — which is nobody else's business.
 * ------------------------------------------------------------------------ */

/**
 * What this person must have signed over for the next action to succeed.
 *
 * Before the circle starts that action is start(), which checks every member
 * for a full rotation's worth. Once it is running the action is disburse(),
 * which needs one contribution from each payer and nothing from the person
 * being paid.
 */
export function permissionForRound(
  contribution: bigint,
  memberIndex: number,
  cycleIndex: number,
  memberCount: number,
  started: boolean,
): bigint {
  if (!started) return contribution * BigInt(Math.max(0, memberCount - 1));
  return memberIndex === cycleIndex ? 0n : contribution;
}

/**
 * What this person must be holding for the next round to settle. The person
 * whose turn it is pays nothing, so they need nothing.
 */
export function balanceForRound(
  contribution: bigint,
  memberIndex: number,
  cycleIndex: number,
): bigint {
  return memberIndex === cycleIndex ? 0n : contribution;
}
