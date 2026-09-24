/*
 * Checks which Circle wallet is chosen for a chain.
 *
 * The bug this exists for: the chip read "arc · mainnet | Signed in" with no
 * address to copy. A Circle sign-in returns a user token immediately, but the
 * wallet is a separate object that may not exist yet — so "signed in" was
 * being treated as "has an address", and the fallback that was there picked a
 * wallet on whatever chain happened to be first.
 *
 * Run from web/:  npm run check:wallet
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Lift the two pure functions out of the .tsx so they can run under node
// without React. Everything between the marker comments is self-contained.
const src = readFileSync("lib/wallet/circle.tsx", "utf8");

const ARC_MAINNET = 5042;
const ARC_TESTNET = 5042002;

const chainCodeSrc = src
  .slice(src.indexOf("export const chainCode"), src.indexOf("export function selectWallet"))
  .replace("ARC_MAINNET_CHAIN_ID", String(ARC_MAINNET))
  .replace("ARC_TESTNET_CHAIN_ID", String(ARC_TESTNET));

const selectSrc = src
  .slice(src.indexOf("export function selectWallet"), src.indexOf("export type CircleStatus") > 0 ? src.indexOf("}", src.indexOf("return wallets.find")) + 1 : src.length);

const dir = mkdtempSync(join(tmpdir(), "wallet-"));
const file = join(dir, "select.ts");
writeFileSync(file, `${chainCodeSrc}\n${selectSrc}\n`);

const { selectWallet, chainCode } = await import(pathToFileURL(file).href);

const w = (blockchain, address, id = blockchain) => ({ id, blockchain, address });
const MAIN = "0xaaaa000000000000000000000000000000000001";
const TEST = "0xbbbb000000000000000000000000000000000002";

const cases = [
  {
    name: "mainnet wallet, on mainnet",
    wallets: [w("ARC", MAIN)],
    chainId: ARC_MAINNET,
    want: MAIN,
  },
  {
    name: "testnet wallet, on testnet",
    wallets: [w("ARC-TESTNET", TEST)],
    chainId: ARC_TESTNET,
    want: TEST,
  },
  {
    name: "ONLY a testnet wallet, on mainnet — must NOT fall back",
    wallets: [w("ARC-TESTNET", TEST)],
    chainId: ARC_MAINNET,
    want: undefined,
  },
  {
    name: "both wallets, on mainnet — picks mainnet",
    wallets: [w("ARC-TESTNET", TEST), w("ARC", MAIN)],
    chainId: ARC_MAINNET,
    want: MAIN,
  },
  {
    name: "both wallets, on testnet — picks testnet",
    wallets: [w("ARC", MAIN), w("ARC-TESTNET", TEST)],
    chainId: ARC_TESTNET,
    want: TEST,
  },
  {
    name: "wallet still being created (no address yet)",
    wallets: [w("ARC", undefined)],
    chainId: ARC_MAINNET,
    want: undefined,
  },
  {
    name: "no wallets at all",
    wallets: [],
    chainId: ARC_MAINNET,
    want: undefined,
  },
  {
    name: "a chain Circle does not support",
    wallets: [w("ARC", MAIN)],
    chainId: 1,
    want: undefined,
  },
  {
    name: "an unrelated chain's wallet",
    wallets: [w("ETH-SEPOLIA", "0xcccc000000000000000000000000000000000003")],
    chainId: ARC_MAINNET,
    want: undefined,
  },
];

let bad = 0;
const rows = cases.map((c) => {
  const got = selectWallet(c.wallets, c.chainId)?.address;
  const ok = got === c.want;
  if (!ok) bad++;
  return {
    case: c.name,
    want: c.want ? c.want.slice(0, 10) + "…" : "none",
    got: got ? got.slice(0, 10) + "…" : "none",
    ok,
  };
});

console.table(rows);
console.log("\nchainCode:", {
  mainnet: chainCode(ARC_MAINNET),
  testnet: chainCode(ARC_TESTNET),
  ethereum: chainCode(1),
});
console.log(bad === 0 ? "\nPASS" : `\n${bad} WRONG`);
process.exit(bad === 0 ? 0 : 1);
