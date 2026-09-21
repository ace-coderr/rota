# Rota

USDC payments on [Arc](https://arc.network).

## Layout

```
contracts/   Hardhat 3 + TypeScript, Solidity 0.8.24 (no contracts yet)
web/         Next.js App Router + TypeScript + Tailwind + wagmi + viem
```

## Payment token

USDC is the payment token, used through its ERC-20 interface at
`0x3600000000000000000000000000000000000000` with **6 decimals**.

Arc's native gas token is represented with 18 decimals at the protocol level.
This project never reads or writes that native balance — every amount goes
through the ERC-20 interface. The shared definitions live in
[`contracts/lib/usdc.ts`](contracts/lib/usdc.ts) and
[`web/lib/usdc.ts`](web/lib/usdc.ts).

## Networks

| Network      | Chain id  | RPC                                | Explorer                     |
| ------------ | --------- | ---------------------------------- | ---------------------------- |
| `arcTestnet` | `5042002` | `https://rpc.testnet.arc.network`  | https://explorer.testnet.arc.io |
| `arcMainnet` | from env  | from env                           | https://explorer.arc.io         |

`arcMainnet` reads `ARC_MAINNET_CHAIN_ID` and `ARC_MAINNET_RPC_URL` from the
environment and is only registered as a Hardhat network when both are set, so
no mainnet values are ever committed. The web app uses the
`NEXT_PUBLIC_`-prefixed equivalents.

## Setup

```bash
cp .env.example .env
npm run install:all
```

## Probe

Checks connectivity: prints the chain id (decimal and hex), the latest block
number, and the USDC balance of your address read via the token's `decimals()`.

```bash
npm run probe
```

```
network:       arcTestnet
chain id:      5042002 (0x4cef52)
latest block:  63150579
usdc:          0x3600000000000000000000000000000000000000
usdc decimals: 6
address:       0x...
usdc balance:  61810.136484 USDC (61810136484 base units)
```

The address comes from `PRIVATE_KEY`, or from `ADDRESS` if set.

## Web

```bash
npm run dev
```
