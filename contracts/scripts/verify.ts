/*
 * Verifies a deployed Rota against Sourcify, and then against the chain's
 * Blockscout explorer.
 *
 * Both take the same standard JSON input, which is the compiler's own record
 * of exactly what was built — not a re-flattened approximation. It is written
 * by scripts/export-standard-json.ts and committed at
 * audit/Rota.standard-input.json.
 *
 * The contract identifier is `project/contracts/Rota.sol:Rota`, not
 * `contracts/Rota.sol:Rota`. Hardhat 3 prefixes its own sources with
 * `project/` and dependencies with `npm/`, and Sourcify answers a mismatch
 * with "Contract not found in compiler output", which reads like a compiler
 * problem rather than a path problem.
 *
 *   node --experimental-strip-types scripts/verify.ts <chainId> <address>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [chainId, address] = process.argv.slice(2);
if (!chainId || !address) {
  throw new Error("usage: verify.ts <chainId> <address>");
}

const COMPILER = "0.8.24+commit.e11b9ed9";
const IDENTIFIER = "project/contracts/Rota.sol:Rota";
const EXPLORERS: Record<string, string> = {
  "5042": "https://explorer.arc.io",
  "5042002": "https://explorer.testnet.arc.io",
};

const stdJsonInput = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "audit", "Rota.standard-input.json"), "utf8"),
);

// ------------------------------------------------------------------ sourcify
console.log(`sourcify: submitting ${address} on chain ${chainId}`);
const submit = await fetch(
  `https://sourcify.dev/server/v2/verify/${chainId}/${address}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput,
      compilerVersion: COMPILER,
      contractIdentifier: IDENTIFIER,
    }),
  },
);
const submitted = (await submit.json()) as { verificationId?: string };

if (submitted.verificationId) {
  type Job = {
    isJobCompleted?: boolean;
    error?: { message?: string };
    contract?: Record<string, string | null>;
  };
  let result: Job = {};
  // Sourcify compiles asynchronously; poll rather than guess at a sleep.
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(
      `https://sourcify.dev/server/v2/verify/${submitted.verificationId}`,
    );
    result = (await poll.json()) as Job;
    if (result.isJobCompleted) break;
  }
  const contract = result.contract ?? {};
  if (result.error) {
    console.log(`  failed: ${result.error.message}`);
  } else {
    console.log(`  match:         ${contract.match}`);
    console.log(`  creation code: ${contract.creationMatch}`);
    console.log(`  runtime code:  ${contract.runtimeMatch}`);
    console.log(`  https://repo.sourcify.dev/${chainId}/${address}`);
  }
} else {
  console.log(`  ${JSON.stringify(submitted).slice(0, 300)}`);
}

// ---------------------------------------------------------------- blockscout
const explorer = EXPLORERS[chainId];
if (!explorer) {
  console.log(`no explorer configured for chain ${chainId}`);
} else {
  console.log(`\n${explorer}: submitting`);
  const form = new FormData();
  form.set("compiler_version", `v${COMPILER}`);
  form.set("contract_name", IDENTIFIER);
  form.set("autodetect_constructor_args", "true");
  form.set(
    "files[0]",
    new Blob([JSON.stringify(stdJsonInput)], { type: "application/json" }),
    "Rota.standard-input.json",
  );

  const response = await fetch(
    `${explorer}/api/v2/smart-contracts/${address}/verification/via/standard-input`,
    { method: "POST", body: form },
  );
  const text = await response.text();
  console.log(`  ${response.status}: ${text.slice(0, 300)}`);
  if (/not a smart-contract/i.test(text)) {
    console.log(
      "  the explorer has not indexed the deployment yet — retry once the\n" +
        "  address shows a creation transaction there.",
    );
  }
}
