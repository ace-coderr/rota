/**
 * USDC is the payment token for Rota. It is a predeploy exposed through the
 * standard ERC-20 interface, with 6 decimals.
 *
 * Every balance and amount in this project goes through this interface. The
 * 18-decimal native balance is never read or written anywhere.
 */
// Arc native gas is 18 decimals; the USDC ERC-20 predeploy is 6.
// Some provider docs (e.g. GetBlock) claim native is 6 — that is wrong.
// Verified on mainnet: eth_gasPrice measured at ~20 gwei (floating,
// base + tip), which is only sensible at 18. Never read the native
// balance anywhere in this project.
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

/**
 * Arc's native coin authority, which is the *other* emitter of every USDC
 * movement.
 *
 * A single transfer produces TWO Transfer logs with the same topic0 and the
 * same indexed from/to:
 *
 *   0x3600…0000 (the USDC predeploy)  value in 6 decimals
 *   0xffff…fffe (this address)        value in 18 decimals
 *
 * Verified on testnet disburse receipts. Anything that parses Transfer logs
 * must filter by emitter, or it will double-count every movement and read
 * 18-decimal values as if they were 6-decimal.
 */
export const NATIVE_COIN_AUTHORITY =
  "0xfffffffffffffffffffffffffffffffffffffffe" as const;

export const USDC_DECIMALS = 6 as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
