import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";

/**
 * Distinct failure modes we want the UI to name, rather than showing one
 * generic "transaction failed".
 */
export type TxFailureKind =
  | "user-rejected"
  | "wrong-network"
  | "insufficient-allowance"
  | "insufficient-balance"
  | "compliance"
  | "not-due"
  | "circle-complete"
  | "too-many-members"
  | "contract-error"
  | "unknown";

export type TxFailure = {
  kind: TxFailureKind;
  /** Short sentence for the user. */
  title: string;
  /** What to do about it, when there is something to do. */
  detail?: string;
  /**
   * The raw on-chain error name or revert string. Surfaced deliberately during
   * this functional pass so failures are diagnosable.
   */
  raw?: string;
};

/**
 * Arc's USDC is Circle's NativeFiatTokenV2_2 behind FiatTokenProxy. Its
 * transferFrom is guarded by `whenNotPaused` and `notBlacklisted(msg.sender)`,
 * and V2_2 also rejects blacklisted from/to accounts. Those are protocol-level
 * compliance refusals: they fire regardless of balance or allowance, and must
 * not be reported as an ordinary failure.
 */
const COMPLIANCE_REVERTS = [
  "Blacklistable: account is blacklisted",
  "FiatTokenV2_2: Account is blacklisted",
  "Pausable: paused",
];

/**
 * The same token reverts with plain strings for the ordinary ERC-20 failures,
 * not with OpenZeppelin v5 custom errors. Both spellings are matched so the
 * app behaves the same against Arc USDC and against an OZ-based mock.
 */
const ALLOWANCE_REVERTS = [
  "ERC20: transfer amount exceeds allowance",
  "ERC20InsufficientAllowance",
];

const BALANCE_REVERTS = [
  "ERC20: transfer amount exceeds balance",
  "ERC20InsufficientBalance",
];

function matches(haystack: string, needles: string[]): string | undefined {
  return needles.find((needle) => haystack.includes(needle));
}

/** Pulls the revert name/reason out of whatever viem threw. */
function revertSignal(error: unknown): { name?: string; text: string } {
  const text =
    error instanceof BaseError
      ? `${error.shortMessage}\n${error.details ?? ""}\n${error.metaMessages?.join("\n") ?? ""}`
      : String((error as Error)?.message ?? error);

  if (error instanceof BaseError) {
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;

    if (reverted) {
      const name = reverted.data?.errorName ?? reverted.reason ?? undefined;
      return { name, text: `${text}\n${name ?? ""}` };
    }
  }

  return { text };
}

export function classifyTxError(error: unknown): TxFailure {
  if (!error) return { kind: "unknown", title: "Something went wrong." };

  // Wallet-level rejection, before anything reaches the chain.
  if (
    error instanceof BaseError &&
    error.walk((e) => e instanceof UserRejectedRequestError)
  ) {
    return {
      kind: "user-rejected",
      title: "You rejected the request in your wallet.",
      detail: "Nothing was sent and nothing was charged.",
    };
  }

  const { name, text } = revertSignal(error);
  const haystack = `${name ?? ""}\n${text}`;

  const compliance = matches(haystack, COMPLIANCE_REVERTS);
  if (compliance) {
    return {
      kind: "compliance",
      title: "USDC refused this transfer on compliance grounds.",
      detail:
        "This is not a balance or allowance problem — Arc's USDC blocked the " +
        "transfer itself. An address involved may be blacklisted, or the token " +
        "may be paused. Nothing you can change in this app will clear it.",
      raw: compliance,
    };
  }

  const allowance = matches(haystack, ALLOWANCE_REVERTS);
  if (allowance) {
    return {
      kind: "insufficient-allowance",
      title: "A member has not approved enough USDC.",
      detail: "Each member must approve the full rotation before it can settle.",
      raw: allowance,
    };
  }

  const balance = matches(haystack, BALANCE_REVERTS);
  if (balance) {
    return {
      kind: "insufficient-balance",
      title: "A member does not hold enough USDC.",
      detail: "Top up the short member's wallet, then try again.",
      raw: balance,
    };
  }

  switch (name) {
    case "NotDue":
      return {
        kind: "not-due",
        title: "This cycle is not due yet.",
        detail: "Wait until the next due date before disbursing.",
        raw: "NotDue",
      };
    case "CircleComplete":
      return {
        kind: "circle-complete",
        title: "This circle has already completed.",
        detail: "Every member has been paid once. There is nothing left to settle.",
        raw: "CircleComplete",
      };
    case "TooManyMembers":
      return {
        kind: "too-many-members",
        title: "Too many members.",
        detail: "A circle can have at most 20 members.",
        raw: "TooManyMembers",
      };
  }

  if (name) {
    // A Rota error we know by name but have no bespoke copy for.
    return {
      kind: "contract-error",
      title: `The contract rejected this: ${name}`,
      raw: name,
    };
  }

  // SafeERC20 reports a token that failed without a reason. On Arc that most
  // likely means the token refused the transfer, so do not bury it as generic.
  if (haystack.includes("SafeERC20FailedOperation")) {
    return {
      kind: "compliance",
      title: "USDC rejected the transfer without giving a reason.",
      detail:
        "The token refused the operation. On Arc this is usually a " +
        "protocol-level compliance block rather than a balance or allowance problem.",
      raw: "SafeERC20FailedOperation",
    };
  }

  return {
    kind: "unknown",
    title: "The transaction failed.",
    raw: text.split("\n").find((line) => line.trim().length > 0)?.trim(),
  };
}

export function wrongNetworkFailure(
  connectedChainId: number | undefined,
  expectedChainId: number,
): TxFailure | undefined {
  if (connectedChainId === undefined) return undefined;
  if (connectedChainId === expectedChainId) return undefined;
  return {
    kind: "wrong-network",
    title: `Wrong network: your wallet is on chain ${connectedChainId}.`,
    detail: `Rota runs on Arc testnet (chain ${expectedChainId}). Switch networks to continue.`,
  };
}
