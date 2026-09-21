import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  type Address,
} from "viem";

import { nameList, whenInWords } from "./format";

/**
 * Every way this can fail, turned into something a person can act on.
 *
 * No error name, no revert string and no address reaches the screen. Where the
 * chain tells us who is involved, we say their name; where it does not, the
 * caller passes in who the app already knows is short.
 */
export type TxFailureKind =
  | "user-declined"
  | "wrong-network"
  | "short-share"
  | "no-permission"
  | "blocked"
  | "too-early"
  | "finished"
  | "too-many-people"
  | "other";

export type TxFailure = {
  kind: TxFailureKind;
  title: string;
  detail?: string;
  /** Calm cases get a neutral tone; only real stops get the alarming one. */
  tone: "calm" | "wait" | "stop";
};

export type FailureContext = {
  /** Names the app already believes are short, in order. */
  shortNames?: string[];
  /** Resolves an address the chain named back to a person. */
  nameOf?: (member: Address) => string;
};

/**
 * Arc's USDC is Circle's NativeFiatTokenV2_2. transferFrom is guarded by
 * whenNotPaused and notBlacklisted(msg.sender); from/to compliance is enforced
 * by the native coin authority and comes back as "Native transfer failed".
 * These are refusals by the money itself, not something anyone here can fix.
 */
const COMPLIANCE = [
  "Blacklistable: account is blacklisted",
  "FiatTokenV2_2: Account is blacklisted",
  "Pausable: paused",
  "Native transfer failed",
];

/** The same token reverts with strings, not OpenZeppelin v5 custom errors. */
const NO_PERMISSION = [
  "ERC20: transfer amount exceeds allowance",
  "ERC20InsufficientAllowance",
];

const SHORT_SHARE = [
  "ERC20: transfer amount exceeds balance",
  "ERC20InsufficientBalance",
];

const matches = (haystack: string, needles: string[]) =>
  needles.some((needle) => haystack.includes(needle));

const verb = (names: string[]) => (names.length === 1 ? "hasn't" : "haven't");

function revertInfo(error: unknown): {
  name?: string;
  args?: readonly unknown[];
  text: string;
} {
  const text =
    error instanceof BaseError
      ? `${error.shortMessage}\n${error.details ?? ""}\n${error.metaMessages?.join("\n") ?? ""}`
      : String((error as Error)?.message ?? error);

  if (error instanceof BaseError) {
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;

    if (reverted) {
      return {
        name: reverted.data?.errorName ?? reverted.reason ?? undefined,
        args: reverted.data?.args,
        text: `${text}\n${reverted.data?.errorName ?? reverted.reason ?? ""}`,
      };
    }
  }

  return { text };
}

export function classifyTxError(
  error: unknown,
  context: FailureContext = {},
): TxFailure {
  const shortNames = context.shortNames ?? [];

  if (!error) {
    return {
      kind: "other",
      tone: "stop",
      title: "That didn't go through.",
      detail: "Nothing has moved. Please try again.",
    };
  }

  if (
    error instanceof BaseError &&
    error.walk((e) => e instanceof UserRejectedRequestError)
  ) {
    return {
      kind: "user-declined",
      tone: "calm",
      title: "You cancelled it.",
      detail: "Nothing was sent and nothing was charged.",
    };
  }

  const { name, args, text } = revertInfo(error);
  const haystack = `${name ?? ""}\n${text}`;

  if (matches(haystack, COMPLIANCE)) {
    return {
      kind: "blocked",
      tone: "stop",
      title: "The money couldn't be moved.",
      detail:
        "USDC itself declined this, so it isn't something anyone in the " +
        "circle can fix by adding funds. Everyone's money is untouched. " +
        "Please contact support before trying again.",
    };
  }

  if (matches(haystack, NO_PERMISSION)) {
    return {
      kind: "no-permission",
      tone: "wait",
      title: `${nameList(shortNames)} ${verb(shortNames)} joined yet.`,
      detail:
        "Everyone has to join before the circle can pay anyone. Nobody has " +
        "been charged.",
    };
  }

  if (matches(haystack, SHORT_SHARE)) {
    return {
      kind: "short-share",
      tone: "wait",
      title: `${nameList(shortNames)} ${verb(shortNames)} got enough in their wallet.`,
      detail:
        "Once they top up, this will go through. Nobody has been charged.",
    };
  }

  switch (name) {
    case "InsufficientAllowanceToStart": {
      // This one names the person on-chain.
      const who =
        context.nameOf && args?.[0]
          ? context.nameOf(args[0] as Address)
          : nameList(shortNames);
      return {
        kind: "no-permission",
        tone: "wait",
        title: `${who} hasn't joined yet.`,
        detail: "Everyone has to join before the circle can start.",
      };
    }
    case "NotDue": {
      const due = args?.[1] ? whenInWords(BigInt(args[1] as bigint)) : undefined;
      return {
        kind: "too-early",
        tone: "wait",
        title: due ? `It's not time yet — next is ${due}.` : "It's not time yet.",
        detail: "Come back then and this will be ready.",
      };
    }
    case "CircleComplete":
      return {
        kind: "finished",
        tone: "calm",
        title: "This circle has finished.",
        detail: "Everyone has had their turn. There's nothing left to pay.",
      };
    case "TooManyMembers":
      return {
        kind: "too-many-people",
        tone: "wait",
        title: "That's too many people for one circle.",
        detail: "A circle can have up to 20 people.",
      };
    case "AlreadyStarted":
      return {
        kind: "other",
        tone: "calm",
        title: "This circle has already started.",
      };
    case "NotAMember":
      return {
        kind: "other",
        tone: "wait",
        title: "You're not part of this circle.",
        detail: "Only the people in a circle can start it.",
      };
    case "DuplicateMember":
      return {
        kind: "other",
        tone: "wait",
        title: "Someone is listed twice.",
        detail: "Each person can only appear once in a circle.",
      };
    case "ZeroAddressMember":
      return {
        kind: "other",
        tone: "wait",
        title: "One of the wallet addresses isn't valid.",
      };
    case "TooFewMembers":
      return {
        kind: "other",
        tone: "wait",
        title: "A circle needs at least two people.",
      };
  }

  if (haystack.includes("SafeERC20FailedOperation")) {
    return {
      kind: "blocked",
      tone: "stop",
      title: "The money couldn't be moved.",
      detail:
        "USDC declined this without saying why. Everyone's money is " +
        "untouched. Please contact support before trying again.",
    };
  }

  if (/insufficient funds/i.test(haystack)) {
    return {
      kind: "short-share",
      tone: "wait",
      title: "There isn't enough in your wallet to cover this.",
      detail: "Top up and try again. Nothing has been charged.",
    };
  }

  return {
    kind: "other",
    tone: "stop",
    title: "That didn't go through.",
    detail: "Nothing has moved. Please try again in a moment.",
  };
}

/**
 * "Wrong network" now means there is no Rota on the chain the wallet is on,
 * since Rota is deployed to more than one.
 */
export function wrongNetworkFailure(
  connectedChainId: number | undefined,
  expectedChainId: number,
): TxFailure | undefined {
  if (connectedChainId === undefined || connectedChainId === expectedChainId) {
    return undefined;
  }
  return {
    kind: "wrong-network",
    tone: "wait",
    title: "Your wallet is on the wrong network.",
    detail: "Switch it to Arc to carry on.",
  };
}
