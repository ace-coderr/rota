// Server-only: this reads and logs Circle's raw error payloads.
import "server-only";

/**
 * What went wrong, at the level a person can act on.
 *
 * The point of classifying is that the three cases need three different
 * responses from three different people: a misconfiguration is for whoever
 * set up the deployment, a cancelled flow is for nobody, and an upstream
 * failure is for waiting. A single "please try again" tells all three of them
 * to do the one thing that will not help.
 */
export type CircleFailureKind =
  | "config" // API key, app id, or environment mismatch
  | "email_delivery" // Circle cannot send the one-time code
  | "rate_limited"
  | "upstream" // Circle is down or erroring
  | "network" // we never reached Circle
  | "unknown";

export type CircleFailure = {
  kind: CircleFailureKind;
  /** Safe to show. Never contains Circle's raw text. */
  message: string;
  /** Quote this to find the full error in the server log. */
  reference: string;
};

const MESSAGES: Record<CircleFailureKind, string> = {
  config:
    "Sign-in is not set up correctly on this site. The Circle credentials are " +
    "missing, wrong, or belong to a different environment than the network " +
    "you are on. This needs fixing by whoever deployed it — retrying will not help.",
  email_delivery:
    "We could not send the code. Email delivery is not configured for this " +
    "site's Circle project, so no code will arrive however many times you try.",
  rate_limited:
    "Too many attempts in a short time. Wait a minute and try again.",
  upstream:
    "Circle, the service that holds the sign-in, is not responding. Nothing " +
    "is wrong with your details — try again shortly.",
  network:
    "We could not reach the sign-in service. Check your connection and try again.",
  unknown:
    "Sign-in failed for a reason we do not recognise. The full error is in " +
    "this site's server log.",
};

type CircleErrorShape = {
  response?: {
    status?: number;
    data?: { code?: number; message?: string; errors?: unknown };
  };
  status?: number;
  code?: string | number;
  message?: string;
  cause?: unknown;
};

/**
 * Classify by HTTP status first, because that is structural and stable, and
 * only fall back to reading Circle's message text.
 *
 * Text matching is a heuristic and is treated as one: it can only move a
 * failure from "unknown" to something more specific, never the other way, so
 * a wording change upstream degrades the message rather than misdirecting it.
 */
function classify(error: CircleErrorShape): CircleFailureKind {
  const status = error.response?.status ?? error.status;
  const text = `${error.response?.data?.message ?? ""} ${error.message ?? ""}`.toLowerCase();

  // Never reached Circle at all.
  if (!status && /fetch failed|econnrefused|enotfound|etimedout|network/.test(text)) {
    return "network";
  }

  if (status === 401 || status === 403) return "config";
  if (status === 429) return "rate_limited";
  if (status !== undefined && status >= 500) return "upstream";

  if (status === 400 || status === 404) {
    if (/app ?id|application id|entity|api key|not authorized|environment/.test(text)) {
      return "config";
    }
    if (/smtp|email|mail|notification|sender/.test(text)) return "email_delivery";
    return "unknown";
  }

  return "unknown";
}

/**
 * Logs everything, returns only what is safe to show.
 *
 * The reference is the join between the two. Without it a report of "it said
 * sign-in failed" cannot be matched to a line in the log, which is exactly the
 * position this replaces.
 */
export function circleFailure(
  operation: string,
  error: unknown,
): CircleFailure {
  const shaped = (error ?? {}) as CircleErrorShape;
  const kind = classify(shaped);
  const reference = Math.random().toString(36).slice(2, 10);

  const detail = {
    reference,
    operation,
    kind,
    httpStatus: shaped.response?.status ?? shaped.status,
    circleCode: shaped.response?.data?.code,
    circleMessage: shaped.response?.data?.message,
    circleErrors: shaped.response?.data?.errors,
    errorMessage: shaped.message,
    errorCode: shaped.code,
    cause: shaped.cause instanceof Error ? shaped.cause.message : shaped.cause,
  };

  // One line, structured, greppable by reference. This is the whole point of
  // the exercise: the raw error has to land somewhere a person can read it.
  console.error(`[circle] ${operation} failed`, JSON.stringify(detail));
  if (error instanceof Error && error.stack) console.error(error.stack);

  return { kind, message: MESSAGES[kind], reference };
}

/**
 * Circle's own numeric code, for the handful of cases that are not failures.
 * 155106 is "wallet already initialised", which is a normal thing to race
 * into and not something to show anybody.
 */
export function circleCodeOf(error: unknown): number | undefined {
  const code = (error as CircleErrorShape)?.response?.data?.code;
  return typeof code === "number" ? code : undefined;
}

/** HTTP status for a failure: config problems are ours, not the upstream's. */
export function statusFor(kind: CircleFailureKind): number {
  switch (kind) {
    case "config":
      return 500;
    case "rate_limited":
      return 429;
    case "email_delivery":
      return 502;
    default:
      return 502;
  }
}
