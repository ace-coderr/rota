# Rota

A rotating savings circle, settled in USDC on [Arc](https://arc.network).

> **Unaudited — use small amounts.**
>
> There has been no professional audit. What there has been is written up under
> [Security](#security), including a high-severity finding that was found,
> fixed, redeployed, and re-attacked on a live chain to prove the fix holds.

## What a rotating savings circle is

A group agrees on an amount and a schedule. Every round each member contributes
the same amount and one member receives everyone else's contributions; the turn
passes down the list until everyone has been paid exactly once, at which point
each member has put in and taken out the same total.

They are ordinary and old — *esusu*, *tanda*, *chit fund*, *hui*, *stokvel* —
and they work on trust, which is also how they fail: somebody has to hold the
money between collecting it and handing it over. Rota removes that somebody
rather than replacing them with a smart contract that does the same job.

## The invariant

**Rota never holds USDC.**

Every contribution is a `transferFrom` that moves straight from one member's
wallet into the recipient's. Rota is only ever the *spender* of an allowance —
never the `from`, never the `to`. A whole round settles in one atomic
transaction: if any single transfer fails, the entire call reverts and nobody
pays. The contract's USDC balance is zero before the transaction and zero
after, because at no instant does it hold any.

The contract has no `receive` or `fallback`, no withdraw, sweep or rescue
function, no call to `transfer` on its own balance, and no owner, admin or
pauser. There is no collateral, no slashing and no penalty. A member's entire
exposure is the allowance they choose to grant, revocable at any time directly
on the USDC contract.

**Live on Arc mainnet** (chain `5042`):
[`0x34a646aB823e3352291F74c886CF624c9eBc1dEA`](https://explorer.arc.io/address/0x34a646ab823e3352291f74c886cf624c9ebc1dea)
· source verified on
[Sourcify](https://sourcify.dev/server/v2/contract/5042/0x34a646ab823e3352291f74c886cf624c9ebc1dea)
· holds **0 USDC**, and always has.

## Why Arc

**USDC is the native coin.** `balanceOf(x)` is the account's native balance
truncated from 18 decimals to 6 — verified on chain, exactly, with the sub-cent
remainder left in the native figure:

```
balanceOf             61810136484
floor(native / 1e12)  61810136484
```

Members therefore hold one asset. They do not need a separate volatile gas
token to take part, and they cannot be stranded holding contributions they are
unable to send — the failure mode that makes stablecoin payments on a general
chain unusable for exactly the people a savings circle is for. It also means
gas and contribution come out of the same balance, which the app accounts for:
a member is shown one figure covering their share and the network cost
together, never two.

**Rounds settle while everyone watches.** Arc produces a block every 0.5s and a
full round is a single transaction, so a circle meeting in a room settles
before the conversation moves on. The 20-member round below settled in one
block.

### Gas

Measured on testnet against the production token:

```
disburse ≈ 55,100 + 25,400 × (members − 1)
```

Fitted from two points — 2 transfers at 105,960 gas and 19 at 538,180 — the
model predicts 538,168 against 538,180 measured, a 12-gas error.

| | gas |
| --- | ---: |
| `disburse`, 20 members (19 transfers) | 538,180 |
| `createCircle`, 20 members | 625,570 |
| `start`, 20 members | 163,786 |

A 20-member round is 1.79% of a 30M block and costs **0.0136 USDC** at
25.3 gwei — a 20-person round settles for under 2 cents. `MAX_MEMBERS` is 20
because `disburse` loops over every member; an uncapped circle could cost more
to settle than a block allows and be stuck permanently.

The two mainnet rounds below came in **2.5% and 8.6% above** that model
(82,540 against 80,500 predicted; 115,042 against 105,900). The model is fitted
from two testnet points and is a planning estimate, not a guarantee; small
circles pay a larger share of the fixed cost and warm-versus-cold storage moves
the rest. At these sizes the absolute error is a fraction of a cent.

## Mainnet evidence

Three circles exist on the live contract. Two have settled rounds, one by hand
and one by the scheduler, and both are checkable from the receipts.

### Circle 1 — complete, settled by hand

`isComplete(1)` returns `true`. Its final round:

| | |
| --- | --- |
| transaction | [`0xbfd1…3f89`](https://explorer.arc.io/tx/0xbfd16864b5916c66d2aa6e9e3aa0bf1036f6a9402c30f8b104493ef4712d3f89) |
| block | 23524441 — 2026-09-30T10:25:38Z |
| sent by | [`0x5f62…34E2`](https://explorer.arc.io/address/0x5f628f6d3824f09a4a0654506575b50DcF2F34E2) |
| gas | 82,540 at 25.2 gwei — **0.0021 USDC** |

The sender is **neither the relayer nor a member of that circle**. That is not
an accident of testing, it is the design: `disburse` reads the schedule and
`members[cycleIndex]`, never `msg.sender`, so anybody can push a due round and
nobody can push it anywhere but where it was already going.

`balanceOf` at the block before and the block of:

| account | before | after |
| --- | ---: | ---: |
| `0x56fF…fB6a` — paying member | 0.894338 | 0.394338 |
| `0x78A1…28e1` — recipient | 0.000147 | 0.500147 |
| **Rota** | **0** | **0** |

0.5 USDC left one wallet and arrived in another. The contract's balance is zero
on both sides, and the receipt carries exactly one USDC `Transfer` — one per
paying member, not two, which is what a hop through the contract would produce.

### Circle 2 — running, settled by the relayer

| | |
| --- | --- |
| transaction | [`0x0dd5…71c3`](https://explorer.arc.io/tx/0x0dd5d508813cbbf3eae78122a1be3dd201fb21122523264ce5a7399b6f0c71c3) |
| block | 23675914 — 2026-10-01T07:47:00Z |
| sent by | [`0x52eC…443e`](https://explorer.arc.io/address/0x52eCF9e2C2b5e718E527275AD3187CDd3CA9443e) — the relayer |
| gas | 115,042 at 20.0 gwei — **0.0023 USDC** |

| account | before | after |
| --- | ---: | ---: |
| `0xFC5e…bc4e` — paying member | 0.297244 | 0.247244 |
| `0xF345…E34D` — paying member | 0.291416 | 0.241416 |
| `0x5f62…34E2` — recipient | 0.531841 | 0.631841 |
| **Rota** | **0** | **0** |

Two contributions of 0.05, one receipt of 0.10, two `Transfer` logs from the
predeploy, and nothing through the contract. The relayer paid 0.0023 USDC of
gas and moved none of the money.

### Deployments

| network | chain | address |
| --- | --- | --- |
| Arc mainnet | `5042` | [`0x34a646aB823e3352291F74c886CF624c9eBc1dEA`](https://explorer.arc.io/address/0x34a646ab823e3352291f74c886cf624c9ebc1dea) — block 22409417 |
| Arc testnet | `5042002` | [`0xe0b354e9251d81ce957262db1c93e9c56f85b3ba`](https://explorer.testnet.arc.io/address/0xe0b354e9251d81ce957262db1c93e9c56f85b3ba) — block 63651642 |

USDC is the predeploy at `0x3600000000000000000000000000000000000000` on both,
6 decimals, read from the token rather than assumed.

The mainnet deployment was checked independently after the fact: the deployer's
nonce is 1, so there is exactly one deployment; `usdc()` returns the predeploy;
`MAX_MEMBERS` is 20; and the deployed runtime bytecode matches a local build
byte for byte apart from the immutable slots holding the USDC address.

Mainnet uses `MAINNET_PRIVATE_KEY`, never the testnet `PRIVATE_KEY`. The deploy
script refuses to run against chain 5042 without it, prints the deployer and its
USDC balance, then waits for a typed confirmation at an interactive prompt.
There is no flag to skip that prompt, so a mainnet deploy cannot be made by
anything that is not a person at a terminal.

### Superseded — do not point a wallet at these

| chain | address | why |
| --- | --- | --- |
| Arc mainnet | [`0x2eb23a1aae43ff4c0aee3e1e6503475fa3b81eaf`](https://explorer.arc.io/address/0x2eb23a1aae43ff4c0aee3e1e6503475fa3b81eaf) — block 22123755 | allowance reuse — **0 circles, never used** |
| Arc testnet | [`0x86Fc49612A3A7832865CCd65a5d7A5f689a5a808`](https://explorer.testnet.arc.io/address/0x86Fc49612A3A7832865CCd65a5d7A5f689a5a808) — block 63306726 | allowance reuse — 4 circles, testnet only |

Both predate the consent fix and carry the vulnerability described below.

**Nobody was ever exposed on mainnet.** `circleCount` on the superseded mainnet
contract reads 0: no circle was created on it, so no allowance was ever granted
to it, so there was never anything for the bug to reach. The four circles on
the superseded testnet contract are play money.

They are kept here rather than deleted. They are what the earlier verified
sources correspond to, and a deployment record that quietly drops its own
history is worth nothing.

## Security

Rota has **not** had a professional audit.

| tool | version | result |
| --- | --- | --- |
| Slither | 0.9.2 | 7 findings on `Rota.sol`: 1 high, 3 low, 2 informational, 1 dependency noise |
| Aderyn | 0.6.8 | **not run** — no Windows build, and the source build fails in its `svm-rs-builds` step |

Full output and a finding-by-finding analysis, including why three are accepted
and one is a false positive, is in [`contracts/audit/`](contracts/audit/).

### The high, and the fix

**An allowance granted to Rota was spendable by any circle.**

An ERC-20 allowance is granted to a contract, not to a purpose. `createCircle`
was permissionless and never asked the people it named whether they agreed, and
`start` could only check that an allowance was large enough — not what it was
meant for. So a stranger could create a circle naming somebody who already had
an allowance outstanding, put themselves first in the rotation, and take one
contribution. Cost to the attacker: gas.

[`contracts/test/AllowanceReuse.poc.t.ts`](contracts/test/AllowanceReuse.poc.t.ts)
is the proof of concept, kept as a regression test. Before the fix its first
assertion — *"Alice paid 100 USDC into a circle she never joined"* — passed.

**Fixed by per-circle consent.** `join(circleId)` records agreement to a
specific circle. `start` refuses, naming the person, if anyone has not joined;
`disburse` re-checks at the transfer itself, so the guard sits where the
violation would happen rather than relying on an earlier function having run.
`previewRound` reports consent, so the app reads it instead of inferring it from
an allowance — which was the same flawed inference that made the attack work.

The cost is one storage read per paying member (20-member `disburse` went from
427,136 to 470,463 gas in the local suite) and a second confirmation when
joining: `approve` on USDC, then `join` on Rota. That is the price of a token
that cannot scope an allowance to a purpose.

### The attack, re-run against the live contract

Not only in memory. [`contracts/scripts/live-attack.ts`](contracts/scripts/live-attack.ts)
gives a victim a real allowance standing behind a real circle they joined, then
has a second wallet build a circle naming them and try to start it, against
deployed bytecode on testnet:

```
victim joined the attack circle? false
start() reverted: NotJoined
names the victim: yes

victim balance:   17.73379 USDC -> 17.73379 USDC
victim allowance: 0.05 USDC -> 0.05 USDC
```

Nothing moved, the victim's allowance survived intact, and their genuine circle
can still settle.

Slither still reports `arbitrary-send-erc20` on `disburse`, and that is now a
false positive: the detector fires on any `transferFrom` whose `from` is not
`msg.sender`, which is exactly how a contract moves money without ever holding
it. It is left unsuppressed, because the honest answer is not "this detector is
wrong" but "this call is safe, and here is the test that says so".

The custody invariant was never affected. Rota has never held USDC; this was
theft between users, not a drain of the contract.

### What this is not

None of the above substitutes for a professional audit. Static analysis finds
shapes it has patterns for; a suite tests what its author thought of. Neither
reasons about economic design, incentive failure, or what a determined attacker
does with a week and the source. **Rota is unaudited. Use small amounts.**

## Testing

```bash
npm test --prefix contracts   # 30 tests
```

The first one is the project's core claim: **"Rota never holds USDC"**.

### The mutation test that showed it was vacuous

That test was originally wrong in an instructive way. It asserted Rota's
balance was zero before, after and between every disbursement — and it **passed
against a deliberately custodial implementation** that pulled funds in and paid
them out inside the same call. An end-of-transaction balance check cannot see
money that arrives and leaves within one transaction. The assertion was
measuring nothing, and looking green while it did.

It now parses the USDC `Transfer` events out of each receipt and asserts Rota is
never an endpoint of one, and that a round emits exactly one transfer per paying
member. Re-running the same mutation fails as it should:

```
1) Rota never holds USDC:
   AssertionError: cycle 0: USDC moved INTO Rota — it took custody mid-transaction
```

That is why the mainnet evidence above is quoted as transfer endpoints and not
only as balances: a balance check is the assertion that was already proven
hollow.

### The double-emit

Every USDC movement on Arc emits **two** `Transfer` logs with the same `topic0`
and the same indexed `from`/`to`:

| emitter | value |
| --- | --- |
| `0x3600…0000` — the USDC predeploy | 6 decimals |
| `0xffff…fffe` — the native coin authority | 18 decimals |

Anything reading these logs **must filter by emitter**, or it will count every
movement twice and read 18-decimal values as 6-decimal. Note that viem's
`parseEventLogs` has no `address` option — passing one is silently ignored — so
the filter belongs on the logs array.

### The mock

`contracts/contracts/mocks/MockUSDC.sol` is written against Circle's verified
source rather than OpenZeppelin, guard for guard, because the real token reverts
with strings (`"ERC20: transfer amount exceeds balance"`) rather than OZ v5
custom errors, and carries pause and blocklist machinery. A mock that fails
differently from production would have made the suite green and the app wrong.

### Against live chains

```bash
ROTA_ADDRESS=0x… npx hardhat run scripts/e2e.ts --network arcTestnet
ROTA_ADDRESS=0x… node --experimental-strip-types scripts/live-attack.ts
```

`e2e.ts` runs a full circle on the live testnet contract — create, approve,
join, start, three disburses — reading Rota's USDC balance as 0 at every cycle
and asserting Rota is never an endpoint of a transfer.

## If Rota is blocklisted

Arc's USDC is Circle's `NativeFiatTokenV2_2`. Its `transferFrom` is guarded by
`whenNotPaused` and `notBlacklisted(msg.sender)` — and `msg.sender` is the Rota
contract, because Rota is the spender. If Rota were blocklisted, **every circle
would stop**: no round could settle, for anyone.

**Nobody's money would be trapped.** It never left their wallets. Each member
keeps their full balance and can spend it anywhere; the only thing they lose is
the ability to settle rounds through Rota, and they can revoke their allowance
directly on the USDC contract whenever they like. There is no pool to drain, no
escrow to unwind, and no administrator whose cooperation anyone needs.

A custodial design fails here in a way this one cannot. If the pot were held by
the contract, a blocklisting would freeze everyone's contributions **inside** it
— funds already surrendered, now unreachable, with the operator's own address
the one that can no longer move them. The difference is not a better recovery
procedure. It is that there is nothing to recover.

Note that `from` and `to` are *not* guarded by that modifier on V2_2 — that
compliance is enforced by the native coin authority and surfaces as a
`"Native transfer failed"` revert. The app reads `isBlacklisted` for every
member and for Rota itself, and reports a hold as its own case, distinct from
somebody being short.

## Automatic payouts

A round can settle itself. An hourly job reads every circle, finds the ones that
have come due, and calls `disburse` for each — so a circle keeps running when
nobody is looking at it. Circle 2's round above is one of those:
[`0x0dd5…71c3`](https://explorer.arc.io/tx/0x0dd5d508813cbbf3eae78122a1be3dd201fb21122523264ce5a7399b6f0c71c3).

### The relayer has no special power

This is the part worth being suspicious of, so it is worth stating precisely.
The relayer is a funded wallet. It is not an operator, an admin or a privileged
role, because **Rota has no such thing to give it**:

| could it… | no, because |
| --- | --- |
| take a payout for itself | `disburse` always pays `members[cycleIndex]`. The caller is never read. |
| move a member's USDC | Members grant their allowance to the Rota contract. No member has ever granted the relayer anything, so `transferFrom` reverts for it exactly as it would for you. |
| settle a round early, or out of order | The schedule is contract state. A caller cannot advance it; `disburse` reverts with `NotDue`. |
| pause, sweep, upgrade, or change a fee | Rota exposes no such function. Its entire mutating surface is `createCircle`, `join`, `start`, `disburse`, and every one of them is callable by anyone. |

Its only privilege is being awake. Anything it does, any member could have done
from the circle page — and in fact did: circle 1's final round was pushed by a
wallet belonging to neither the relayer nor that circle.

Those four rows are tests, not assurances —
[`contracts/test/Relayer.t.ts`](contracts/test/Relayer.t.ts). The last asserts
the mutating ABI is **exactly** those four functions, so a privileged function
added later fails the suite rather than quietly shipping.

### It never sends a transaction that will revert

Before signing anything, each due circle is checked twice:

1. **`previewRound`** — the contract's own view of who is short or has not
   joined. If anyone is, nothing is sent, and the circle page says who everyone
   is waiting for: *"Rota can't send this round yet. Waiting on Chidi to top
   up."* That is the same view the page renders, so the scheduler's reason and
   the member's reason are one fact rather than two that can disagree.
2. **A simulation of the exact call** — which catches what `previewRound`
   cannot: a round a member settled a second ago, a paused token, a compliance
   hold.

A doomed `disburse` would cost gas, tell the members nothing, and look identical
to a relayer that is simply broken, which is the one failure that must stay
diagnosable. The decision is a pure function and is tested directly
(`npm run check:cron --prefix web`), because in production the evidence of a
correct decision is a transaction that does not exist.

### GitHub's scheduler is best-effort, and visibly so

The settlement mechanism itself is proven on mainnet: the relayer settled two
of circle 2's three rounds, and the second of them landed **six seconds** after
the Actions run that triggered it —
[run at 08:56:16Z](https://github.com/ace-coderr/rota/actions/workflows/disburse.yml),
[round at 08:56:22Z](https://explorer.arc.io/tx/0x33f513a6c125ed2f127ab3206d6427d206327081c49a62df888baf92cbfd7aa0).

The *schedule* is the weak part. `schedule:` is best-effort and GitHub drops
runs under load, which is documented but easy to read as a formality. It is
not. In the first ~26 hours this workflow existed, an hourly cron should have
fired about 26 times. It fired **four**, with gaps of 4.6, 3.9 and 7.6 hours —
and only two of those four succeeded, so an hourly circle was actually visited
twice in a day.

Circle 2's last round is what that looks like in practice: no scheduled run
fired between 08:56 and 12:31, so a member settled it themselves
([12:31Z, sent by a member's own wallet](https://explorer.arc.io/tx/0x4d162d4156c26d68d761adf5d3417837239292a0d6c90a7d88d7fd3609ca389c)).
The circle completed on time because somebody pressed the button, not because
the scheduler worked.

**For a production deployment, drive `/api/cron/disburse` from a dedicated
scheduler** — [cron-job.org](https://cron-job.org) or similar, or a paid Vercel
plan, which allows sub-daily cron. Nothing about the endpoint changes; it is
the same permissionless call, and whatever calls it needs only `CRON_SECRET`.
GitHub Actions is fine as a free backstop and is kept as one. It is not a
schedule anybody should depend on.

### The manual button never goes away

That is not a workaround for the above — it is why the button exists. **No
scheduler is guaranteed**, including a paid one, so a circle that can only be
settled by a scheduler is a circle that can stall for reasons none of its
members can see or fix.

A circle must work when the scheduler does not. Every member can still settle a
round themselves from the circle page, at any time, and that path is unchanged —
the relayer is a convenience layered on top of it, never a dependency.
`/circle` shows who set each round going: the scheduler, a member by name, or
"someone outside the circle", read from the transaction's sender.

## Running it locally

```bash
cp .env.example .env     # add a funded key only if you intend to deploy
npm run install:all
```

Contracts:

```bash
npm run build:contracts   # compile
npm test --prefix contracts
npm run probe             # chain id, latest block, your USDC balance
```

Web app, at http://localhost:3000:

```bash
cp web/.env.example web/.env.local
npm run dev
```

The app supports both Arc chains and follows whichever one the wallet is on,
using the contract deployed there. A chain with no configured address is simply
not offered, so with only `NEXT_PUBLIC_ROTA_ADDRESS` set the app is
testnet-only. `arcMainnet` reads its chain id and RPC URL from the environment
and is registered as a Hardhat network only when both are set, so no mainnet RPC
lives in this repo.

### Layout

```
contracts/   Hardhat 3 + TypeScript, Solidity 0.8.24
  contracts/Rota.sol           the circle
  contracts/mocks/MockUSDC.sol Circle's token, faithfully
  scripts/deploy.ts            deploy, and print what the web app needs
  scripts/e2e.ts               a full circle on a live network
  scripts/live-attack.ts       the allowance attack, against deployed bytecode
  scripts/probe.ts             connectivity, via the ERC-20 interface
web/         Next.js App Router + wagmi + viem
  lib/mark.ts                  the logo, as numbers
  scripts/gen-icon.ts          writes app/icon.svg from lib/mark.ts
```

---

## Operating it

Everything below is deployment detail rather than argument.

### Configuring the relayer

| variable | |
| --- | --- |
| `RELAYER_PRIVATE_KEY` | The wallet that pays gas. **Server-only — never `NEXT_PUBLIC_`.** Leave unset and circles work exactly as before, members pressing the button themselves. |
| `CRON_SECRET` | The trigger sends `Authorization: Bearer $CRON_SECRET`. The route **fails closed**: with no secret it refuses everything, because an open endpoint lets anyone burn the gas budget the next round needs. |
| `RELAYER_MIN_USDC` | Warn below this. Default 1. |

Fund the relayer with a small USDC balance — on Arc, gas is paid in the same
USDC the circles move, so its balance is read through the ERC-20 at 6 decimals
like every other amount in this project, never through the 18-decimal native
balance. Each run logs that balance and warns when it is low:

```
[cron] relayer {"chainId":5042,"relayer":"0x…","usdc":"4.21","low":false,"minimum":"1.00"}
```

`npm run check:secrets --prefix web` scans the built client bundle for the name
and the value of every server-only secret, including this key, and fails the
build if either appears.

### Two triggers, one endpoint

Vercel's Hobby plan runs cron **once a day**, which cannot settle an hourly
circle. So the hourly pass comes from GitHub Actions
([`.github/workflows/disburse.yml`](.github/workflows/disburse.yml)) and
[`web/vercel.json`](web/vercel.json) keeps a daily one at 03:40 UTC as a
backstop for when Actions is down or the repo goes quiet — offset from the top
of the hour so the two never arrive together.

**Both hitting the same endpoint is safe by construction.** `disburse` reverts
unless a round is genuinely due, and the route simulates the call before signing
anything, so a round one trigger has already settled is simply not due when the
other arrives. Overlap costs a read, not a transaction.

**The trigger is permissionless.** Actions calls the same public endpoint anyone
could call, and holds nothing but a shared secret that rate-limits who may spend
the relayer's gas. The workflow checks nothing out, is granted `permissions: {}`,
and passes its secrets through `env:` rather than interpolating them into a
shell script.

| | Vercel | GitHub Actions |
| --- | --- | --- |
| `RELAYER_PRIVATE_KEY` | ✅ Project → Settings → Environment Variables | ❌ never — the workflow signs nothing |
| `CRON_SECRET` | ✅ same place | ✅ Settings → Secrets and variables → Actions |
| `RELAYER_MIN_USDC` | ✅ optional | ❌ |
| `ROTA_URL` | ❌ | ✅ your deployment's origin |

The two `CRON_SECRET` values must match — one is checked against the other. No
key material goes anywhere near GitHub. To fire it by hand: **Actions → Settle
due rounds → Run workflow**, or `gh workflow run disburse.yml`.

Every run prints a summary — circles scanned, what was due, what settled, what
was held and why — into both the job log and the run page, so a held round is
visible from the Actions list without opening Vercel. A scheduled workflow is
also disabled after 60 days of repo inactivity, which is one reason the daily
Vercel cron stays; the measured skip rate, under
[GitHub's scheduler is best-effort](#githubs-scheduler-is-best-effort-and-visibly-so),
is the other, and the reason neither of these should be the only trigger in
production.

`vercel.json` takes no `comment` key: a `crons[0]` entry carrying one fails the
deploy with *"should NOT have additional property"*, and nothing in the repo
caught it, because Vercel's builder reads that file and `next build` never does.
[`npm run check:vercel`](web/scripts/check-vercel-json.mjs) now validates it in
CI. Note the trap it works around — the published schema at `openapi.vercel.sh`
sets `additionalProperties: false` on 195 of its nodes and *not* on the cron
item, so validating against the schema as published would accept `comment` and
the deploy would still fail.

### What is not stored

There is no record of past attempts — no database, and none added for this.
Every reason the page gives is derived live from `previewRound`, which is
strictly more accurate than a stored snapshot and cannot go stale. What that
costs: you cannot ask "why did nothing happen at 3am last Tuesday" from the UI.
The answer is in the function logs, under `[cron]`.

### Source verification

Verification through explorer.arc.io's own API is not currently possible from a
script — the endpoint sits behind a bot challenge that returns 403 — so the
explorer shows the contract unverified until someone submits it through the web
form. Sourcify has it. Regenerate the standard JSON input with:

```bash
node --experimental-strip-types scripts/verify.ts 5042 0x34a646ab823e3352291f74c886cf624c9ebc1dea
```

| field | value |
| --- | --- |
| compiler | `v0.8.24+commit.e11b9ed9` |
| contract name | `project/contracts/Rota.sol:Rota` |
| optimizer | enabled, 200 runs |
| EVM version | `shanghai` |
| constructor argument | `0x3600000000000000000000000000000000000000` |

The contract name needs the `project/` prefix: Hardhat 3 keys its own sources
that way and dependencies under `npm/`, and a mismatch is reported as "Contract
not found in compiler output", which reads like a compiler problem rather than a
path problem.

### Sign-in email

Rota never sends an email. The one-time code comes from Circle, triggered by
`createDeviceTokenForEmailLogin` — grep this repo for an SMTP client and you
will not find one. The sending domain and provider are set on **Circle's side**,
in the Console for the project that `CIRCLE_API_KEY` belongs to, and a sandbox
catcher like Mailtrap means codes are delivered into a trap rather than to the
person waiting for one.

Use **Resend** for the production sender: it exposes plain SMTP
(`smtp.resend.com:587`, username `resend`, password an API key), which is what
Circle wants; its free tier covers this project several times over; and its
domain setup is a guided SPF/DKIM flow rather than a pile of raw DNS. SES is
cheaper at volume and Postmark has better transactional deliverability, but both
cost more setup than this needs. Whatever the provider, SPF, DKIM and a DMARC
record of at least `p=none` all have to be in place or codes land in spam.

When delivery is not configured the app says so rather than shrugging: the Circle
error classifier maps sender and SMTP failures to a message telling the person
no code will arrive however many times they retry, and logs the upstream error
under `[circle]`.

### The verification modal

Circle's modal — the one that asks for the emailed code, and later for a PIN
when a transaction is approved — is an **iframe on `pw-auth.circle.com`**. It is
a different origin, so no stylesheet in this app can touch it. The only way in is
the `setThemeColor` / `setResources` payload the SDK posts to it, which
[`web/lib/wallet/circle-theme.ts`](web/lib/wallet/circle-theme.ts) fills in:
near-black surface, cream text, electric blue on the one filled button, and icons
redrawn in the palette.

**Two things the SDK's theming cannot reach**, left as they are rather than
worked around:

- **Corners.** There is no radius, corner or shape key anywhere in the SDK's
  `ThemeColor` type. The modal keeps Circle's rounded corners while every other
  control in Rota is square. This is a visible break with no way to close it.
- **A second typeface.** `Resources.fontFamily` is one `{ name, url }` for the
  whole modal, so the six-digit code field cannot have IBM Plex Mono while the
  prose keeps Source Sans 3. Font size, weight and tracking are equally out of
  reach.

`npm run check:theme --prefix web` covers what can be checked from outside the
iframe: that every icon decodes and carries an explicit colour rather than
`currentColor` (which resolves to nothing in a foreign document), that each has
an intrinsic size (an SVG without one renders at the browser's 150×150 fallback,
and we do not control the `img` tag), and that every colour clears WCAG contrast
against the near-black surface.

### The mark

Eight seats on a circle: seven hollow, one solid. The solid seat is whose turn
it is, and it sits at the top right rather than on an axis of symmetry, so the
ring reads as part-way round rather than parked. Every drawing of it — navbar
lockup, footer mark, favicon, Apple touch icon, Open Graph card — is generated
from the geometry in `web/lib/mark.ts`, so none of them can drift.

```bash
npm run icon --prefix web   # after changing the geometry
```

## License

MIT
