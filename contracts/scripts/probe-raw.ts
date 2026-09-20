/**
 * Raw JSON-RPC probe. Deliberately dependency-free: no Hardhat, no viem, no
 * network config, and no expectation about which chain is on the other end.
 * It POSTs eth_chainId and eth_blockNumber and reports exactly what comes back,
 * including the raw body when the endpoint rejects the request.
 *
 *   node scripts/probe-raw.ts <rpc-url>
 */

const TIMEOUT_MS = 15_000;

type RpcOutcome =
  | { kind: "result"; value: string }
  | { kind: "rpc-error"; status: number; body: string }
  | { kind: "http-error"; status: number; statusText: string; body: string }
  | { kind: "non-json"; status: number; contentType: string; body: string }
  | { kind: "transport-error"; message: string; cause?: string };

async function rpc(url: string, method: string): Promise<RpcOutcome> {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params: [],
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    return {
      kind: "transport-error",
      message: `${err.name}: ${err.message}`,
      cause: err.cause ? String(err.cause) : undefined,
    };
  }

  const contentType = response.headers.get("content-type") ?? "(none)";
  const text = await response.text();

  if (!response.ok) {
    return {
      kind: "http-error",
      status: response.status,
      statusText: response.statusText,
      body: text,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      kind: "non-json",
      status: response.status,
      contentType,
      body: text,
    };
  }

  const envelope = parsed as { result?: unknown; error?: unknown };

  if (envelope.error !== undefined || envelope.result === undefined) {
    return { kind: "rpc-error", status: response.status, body: text };
  }

  return { kind: "result", value: String(envelope.result) };
}

function truncate(body: string, max = 600): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) return "(empty body)";
  return trimmed.length > max ? `${trimmed.slice(0, max)}… [truncated]` : trimmed;
}

function reportFailure(method: string, outcome: RpcOutcome): void {
  switch (outcome.kind) {
    case "transport-error":
      console.log(`${method}: request failed`);
      console.log(`  error: ${outcome.message}`);
      if (outcome.cause) console.log(`  cause: ${outcome.cause}`);
      break;
    case "http-error":
      console.log(
        `${method}: HTTP ${outcome.status} ${outcome.statusText}`.trimEnd(),
      );
      console.log(`  raw body: ${truncate(outcome.body)}`);
      break;
    case "rpc-error":
      console.log(`${method}: JSON-RPC error (HTTP ${outcome.status})`);
      console.log(`  raw body: ${truncate(outcome.body)}`);
      break;
    case "non-json":
      console.log(
        `${method}: non-JSON response (HTTP ${outcome.status}, content-type ${outcome.contentType})`,
      );
      console.log(`  raw body: ${truncate(outcome.body)}`);
      break;
  }
}

/** Parses a hex quantity without assuming the endpoint returned a sane one. */
function toDecimal(hex: string): bigint | undefined {
  try {
    return BigInt(hex);
  } catch {
    return undefined;
  }
}

const url = process.argv[2];

if (!url) {
  console.error("usage: node scripts/probe-raw.ts <rpc-url>");
  process.exit(1);
}

console.log(`endpoint:     ${url}`);

let failed = false;

const chainIdOutcome = await rpc(url, "eth_chainId");
if (chainIdOutcome.kind === "result") {
  const raw = chainIdOutcome.value;
  const decimal = toDecimal(raw);
  console.log(
    decimal === undefined
      ? `chain id:     unparseable (raw: ${raw})`
      : `chain id:     ${decimal} (${raw})`,
  );
} else {
  failed = true;
  reportFailure("eth_chainId", chainIdOutcome);
}

const blockOutcome = await rpc(url, "eth_blockNumber");
if (blockOutcome.kind === "result") {
  const raw = blockOutcome.value;
  const decimal = toDecimal(raw);
  console.log(
    decimal === undefined
      ? `block number: unparseable (raw: ${raw})`
      : `block number: ${decimal} (${raw})`,
  );
} else {
  failed = true;
  reportFailure("eth_blockNumber", blockOutcome);
}

process.exit(failed ? 1 : 0);
