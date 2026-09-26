# Rota

A rotating savings circle, settled in USDC on [Arc](https://arc.network).

> **Unaudited — use small amounts.**
>
> The high-severity allowance finding is **fixed and deployed on both chains**.
> A member has to `join(circleId)` explicitly, and money only moves for circles
> they joined. The attack was re-run against the live contract and blocked; see
> [Review status](#review-status).

A group agrees on an amount and a schedule: every round, each member puts in the
same amount, and one member receives everyone else's share. The turn passes
down the list each round until everyone has been paid exactly once, at which
point every member has put in and taken out the same total. Nothing is ever
pooled: there is no pot, only shares moving directly between wallets.

## The invariant

**Rota never holds USDC.**

Every contribution is a `transferFrom` that moves straight from one member's
wallet into the recipient's. Rota is only ever the *spender* of an allowance —
never the `from`, never the `to`. A whole round settles in one atomic
transaction: if any single transfer fails, the entire call reverts and nobody
pays.

The contract has no `receive` or `fallback`, no withdraw, sweep or rescue
function, no call to `transfer` on its own balance, and no owner, admin or
pauser. There is no collateral, no slashing and no penalty. A member's entire
exposure is the allowance they choose to grant, which they can revoke at any
time directly on the USDC contract.

## Why Arc

**USDC is the native coin.** `balanceOf(x)` is the account's native balance
truncated from 18 decimals to 6 — verified on testnet, exactly, with the
sub-cent remainder left in the native figure:

```
balanceOf             61810136484
floor(native / 1e12)  61810136484
```

That means members hold one asset. They do not need a separate gas token to
take part, and they cannot be stranded holding contributions they are unable to
send. It also means the two are spent from the same balance, which the app accounts
for: a member is shown one figure covering their share and the network cost
together, never two.

**Rounds settle in under a second.** Arc produces a block every 0.5s, and a full
round is a single transaction. The 20-member round below settled in one block.

## Evidence

### Deployments

| network | chain | address |
| --- | --- | --- |
| Arc testnet | `5042002` | [`0xe0b354e9251d81ce957262db1c93e9c56f85b3ba`](https://explorer.testnet.arc.io/address/0xe0b354e9251d81ce957262db1c93e9c56f85b3ba) — block 63651642 |
| Arc mainnet | `5042` | [`0x34a646ab823e3352291f74c886cf624c9ebc1dea`](https://explorer.arc.io/address/0x34a646ab823e3352291f74c886cf624c9ebc1dea) — block 22409417 |

### Superseded

| Chain | Address | Why |
| --- | --- | --- |
| Arc testnet | [`0x86Fc49612A3A7832865CCd65a5d7A5f689a5a808`](https://explorer.testnet.arc.io/address/0x86Fc49612A3A7832865CCd65a5d7A5f689a5a808) — block 63306726 | allowance reuse — 4 circles, testnet only |
| Arc mainnet | [`0x2eb23a1aae43ff4c0aee3e1e6503475fa3b81eaf`](https://explorer.arc.io/address/0x2eb23a1aae43ff4c0aee3e1e6503475fa3b81eaf) — block 22123755 | allowance reuse — **0 circles, never used** |

Both predate the consent fix and carry the vulnerability described under
[Review status](#review-status). **Do not point a wallet at them.**

Nobody was ever exposed on mainnet: `circleCount` on the superseded mainnet
contract reads 0, so no circle was created on it and no allowance was ever
granted to it. The four circles on the superseded testnet contract are play
money.

They are kept here rather than deleted. They are what the verified sources on
Sourcify correspond to, and a deployment record that quietly drops its own
history is worth nothing.

USDC is the predeploy at `0x3600000000000000000000000000000000000000` on both,
6 decimals, read from the token rather than assumed.

Mainnet uses `MAINNET_PRIVATE_KEY`, never the testnet `PRIVATE_KEY`. The deploy
script refuses to run against chain 5042 without it, prints the deployer and its
USDC balance, and then waits for a typed confirmation at an interactive prompt.
There is no flag to skip that prompt, so a mainnet deploy cannot be made by
anything that is not a person at a terminal.

The mainnet deployment was checked independently after the fact: the deployer's
nonce is 1, so there is exactly one deployment; `usdc()` returns the predeploy;
`MAX_MEMBERS` is 20; `circleCount` is 0; and the contract holds 0 USDC. The
deployed runtime bytecode matches a local build byte for byte apart from the
five immutable slots holding the USDC address.

Source is verified on
[Sourcify](https://sourcify.dev/server/v2/contract/5042/0x34a646ab823e3352291f74c886cf624c9ebc1dea).
Verification through explorer.arc.io's own API is not currently possible from a
script — the endpoint sits behind a bot challenge that returns 403 — so the
explorer shows the contract unverified until someone submits it through the web
form. Regenerate the standard JSON input for that form with:

```bash
node --experimental-strip-types scripts/verify.ts 5042 0x34a646ab823e3352291f74c886cf624c9ebc1dea
```

That submits to Sourcify and then tries the explorer, and it is also how the
standard JSON input at [`contracts/audit/Rota.standard-input.json`](contracts/audit/Rota.standard-input.json)
is kept current. For the explorer's web form:

| field | value |
| --- | --- |
| compiler | `v0.8.24+commit.e11b9ed9` |
| contract name | `project/contracts/Rota.sol:Rota` |
| optimizer | enabled, 200 runs |
| EVM version | `shanghai` |
| constructor argument | `0x3600000000000000000000000000000000000000` |

The contract name needs the `project/` prefix: Hardhat 3 keys its own sources
that way and dependencies under `npm/`, and a mismatch is reported as
"Contract not found in compiler output", which reads like a compiler problem
rather than a path problem.

### Custody, checked on real receipts

A full 3-member rotation and a 20-member round were run on testnet. On every
`disburse` receipt, Rota is neither the `from` nor the `to` of any Transfer, and
there are exactly `members - 1` of them — one per paying member, not two, which
is what a hop through the contract would produce. Rota's own balance was 0
before, during and after.

### The double-emit

Every USDC movement on Arc emits **two** Transfer logs with the same `topic0`
and the same indexed `from`/`to`:

| emitter | value |
| --- | --- |
| `0x3600…0000` — the USDC predeploy | 6 decimals |
| `0xffff…fffe` — the native coin authority | 18 decimals |

Anything reading these logs must filter by emitter, or it will count every
movement twice and read 18-decimal values as 6-decimal. Note that viem's
`parseEventLogs` has no `address` option — passing one is silently ignored — so
the filter belongs on the logs array.

### Gas

Measured on testnet against the production token:

```
disburse ≈ 55,100 + 25,400 × (members − 1)
```

Fitted from two points — 2 transfers at 105,960 gas and 19 at 538,180 — the
model predicts 538,168 against 538,180 measured, a 12-gas error.

| | gas |
| --- | ---: |
| disburse, 20 members (19 transfers) | 538,180 |
| createCircle, 20 members | 625,570 |
| start, 20 members | 163,786 |

A 20-member round is 1.79% of a 30M block and costs about **0.0136 USDC** at
25.3 gwei. `MAX_MEMBERS` is 20 because `disburse` loops over every member; an
uncapped circle could cost more to settle than a block allows and be stuck
permanently.

## If Rota is blocklisted

Arc's USDC is Circle's `NativeFiatTokenV2_2`. Its `transferFrom` is guarded by
`whenNotPaused` and `notBlacklisted(msg.sender)` — and `msg.sender` is the Rota
contract, because Rota is the spender. If Rota were blocklisted, **every circle
would stop**: no round could settle for anyone.

**Nobody's money would be trapped.** It never left their wallets. Each member
keeps their full balance and can spend it anywhere; the only thing they lose is
the ability to settle rounds through Rota, and they can revoke their allowance
directly on the USDC contract whenever they like. There is no pool to drain, no
escrow to unwind and no administrator whose cooperation anyone needs.

Note that `from` and `to` are *not* guarded by that modifier on V2_2 — that
compliance is enforced by the native coin authority, and surfaces as a
`"Native transfer failed"` revert. The app reads `isBlacklisted` for every
member and for Rota itself, and reports a hold as its own case, distinct from
someone being short.

## Testing

`npm test --prefix contracts` — 21 tests.

The first one is the project's core claim: **"Rota never holds USDC"**.

That test was initially wrong in an instructive way. It asserted Rota's balance
was zero before, after and between every disbursement — and it passed against a
deliberately custodial implementation that pulled funds in and paid them out
inside the same call. An end-of-transaction balance check cannot see money that
arrives and leaves within one transaction.

It now parses the USDC Transfer events out of each receipt and asserts Rota is
never an endpoint of one, and that a round emits exactly one transfer per paying
member. Re-running the same mutation fails as it should:

```
1) Rota never holds USDC:
   AssertionError: cycle 0: USDC moved INTO Rota — it took custody mid-transaction
```

The mock token is written against Circle's verified source rather than
OpenZeppelin, guard for guard, because the real token reverts with strings
(`"ERC20: transfer amount exceeds balance"`) rather than OZ v5 custom errors, and
carries pause and blocklist machinery. A mock that fails differently from
production would have made the suite green and the app wrong.

## Review status

Rota has **not** had a professional audit. What it has had:

### Tools

| Tool | Version | Result |
| --- | --- | --- |
| Slither | 0.9.2 | 7 findings on `Rota.sol`: 1 high, 3 low, 2 informational, 1 dependency noise |
| Aderyn | 0.6.8 | **not run** — no Windows build, and the source build fails in its `svm-rs-builds` step |

Full output and a finding-by-finding analysis, including why three are accepted
and one is a false positive, is in [`contracts/audit/`](contracts/audit/).

### The one that was real, and the fix

**An allowance granted to Rota was spendable by any circle.** An ERC-20
allowance is granted to the contract, not to a circle; `createCircle` is
permissionless and never asked the people it named whether they agreed; and
`start` could only check that an allowance was large enough, not what it was
meant for. A stranger could therefore create a circle naming someone who
already had an allowance, put themselves first in the rotation, and take one
contribution. Cost to the attacker: gas.

**Fixed.** `join(circleId)` records consent per circle. `start` refuses, naming
the person, if anyone has not joined; `disburse` re-checks at the transfer
itself, so the guard sits where the violation would happen rather than relying
on an earlier function having run. `previewRound` reports consent, so the app
reads it instead of inferring it from an allowance — which was the same flawed
inference that made the attack work.

The cost is one storage read per paying member (20-member `disburse` went from
427,136 to 470,463 gas) and a second confirmation when joining: `approve` on
USDC, then `join` on Rota. That is the price of a token that cannot scope an
allowance to a purpose.

`contracts/test/AllowanceReuse.poc.t.ts` is kept as a regression test. It runs
the identical attack and asserts it fails, with the victim's balance *and* her
allowance intact. Before the fix its first assertion — "Alice paid 100 USDC
into a circle she never joined" — passed.

And it was re-run against the deployed bytecode, not only in memory.
`contracts/scripts/live-attack.ts` gives a victim a real allowance standing
behind a real circle they joined, then has a second wallet build a circle
naming them:

```
victim joined the attack circle? false
start() reverted: NotJoined
names the victim: yes

victim balance:   17.73379 USDC -> 17.73379 USDC
victim allowance: 0.05 USDC -> 0.05 USDC
```

Nothing moved, and the victim's genuine circle can still settle.

Slither still reports `arbitrary-send-erc20` on `disburse`, and that is now a
false positive: the detector fires on any `transferFrom` whose `from` is not
`msg.sender`, which is exactly how a contract moves money without ever holding
it. It is left unsuppressed, because the honest answer is not "this detector is
wrong" but "this call is safe, and here is the test that says so".

The custody invariant was never affected. Rota has never held USDC; this was
theft between users, not a drain of the contract.

### Tests

30 tests, `npm test --prefix contracts`, including the five regression tests
above, four that bound what the payout relayer can do, plus a full end-to-end circle on the live testnet contract — create,
approve, join, start, three disburses — with Rota's USDC balance read as 0 at
every cycle and Rota never an endpoint of a transfer.

```bash
ROTA_ADDRESS=0x… npx hardhat run scripts/e2e.ts --network arcTestnet
ROTA_ADDRESS=0x… node --experimental-strip-types scripts/live-attack.ts
```

The core claim — **"Rota never holds USDC"** — is mutation-tested: the original
balance-based assertion passed against a deliberately custodial implementation,
so it now parses USDC Transfer events and asserts Rota is never an endpoint of
one. Re-running that mutation fails as it should. Details under
[Testing](#testing).

### What this is not

None of the above is a substitute for a professional audit. Static analysis
finds shapes it has patterns for; a suite tests what its author thought of.
Neither reasons about economic design, incentive failure, or what a determined
attacker does with a week and the source. Rota is unaudited. Use small amounts.

## Automatic payouts

A round can settle itself. An hourly job reads every circle, finds the ones
that have come due, and calls `disburse` for each — so a circle keeps running
when nobody is looking at it.

### The relayer has no special power

This is the part worth being suspicious of, so it is worth stating precisely.
The relayer is a funded wallet. It is not an operator, an admin, or a
privileged role, because **Rota has no such thing to give it**:

| Could it… | No, because |
| --- | --- |
| take a payout for itself | `disburse` always pays `members[cycleIndex]`. The caller is never read. |
| move a member's USDC | Members grant their allowance to the Rota contract. No member has ever granted the relayer anything, so `transferFrom` reverts for it like it would for you. |
| settle a round early, or out of order | The schedule is contract state. A caller cannot advance it; `disburse` reverts with `NotDue`. |
| pause, sweep, upgrade, or change a fee | Rota exposes no such function. Its entire mutating surface is `createCircle`, `join`, `start`, `disburse`, and every one of them is callable by anyone. |

Its only privilege is being awake. Anything it does, any member could have
done from the circle page, and the relayer holds no key to anything but its own
gas money.

Those four rows are tests, not assurances —
[`contracts/test/Relayer.t.ts`](contracts/test/Relayer.t.ts). The last one
asserts the mutating ABI is exactly those four functions, so a privileged
function added later fails the suite rather than quietly shipping.

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

A doomed `disburse` would cost gas, tell the members nothing, and look
identical to a relayer that is simply broken, which is the one failure that
must stay diagnosable. The decision is a pure function and is tested directly
(`npm run check:cron --prefix web`), because in production the evidence of a
correct decision is a transaction that does not exist.

### The manual button never goes away

A circle must work when the scheduler does not. Every member can still settle
a round themselves from the circle page, at any time, and that path is
unchanged — the relayer is a convenience layered on top of it, never a
dependency. `/circle` shows who set each round going: the scheduler, a member
by name, or "someone outside the circle", read from the transaction's sender.

### Configuring it

| Variable | |
| --- | --- |
| `RELAYER_PRIVATE_KEY` | The wallet that pays gas. **Server-only — never `NEXT_PUBLIC_`.** Leave unset and circles work exactly as before, members pressing the button themselves. |
| `CRON_SECRET` | Vercel sends `Authorization: Bearer $CRON_SECRET`. The route **fails closed**: with no secret it refuses everything, because an open endpoint lets anyone burn the gas budget the next round needs. |
| `RELAYER_MIN_USDC` | Warn below this. Default 1. |

Fund the relayer with a small USDC balance — on Arc, gas is paid in the same
USDC the circles move, so its balance is read through the ERC-20 at 6 decimals
like every other amount in this project, never through the 18-decimal native
balance. Each run logs that balance and warns when it is low:

```
[cron] relayer {"chainId":5042,"relayer":"0x…","usdc":"4.21","low":false,"minimum":"1.00"}
```

The schedule lives in [`web/vercel.json`](web/vercel.json). **Hourly cron needs
a Vercel plan above Hobby**, which allows one run a day; a daily run still
works, it just settles rounds up to a day late.

`npm run check:secrets --prefix web` scans the built client bundle for the name
and the value of every server-only secret, including this key, and fails the
build if either appears.

### What is not stored

There is no record of past attempts — no database, and none added for this.
Every reason the page gives is derived live from `previewRound`, which is
strictly more accurate than a stored snapshot and cannot go stale. What that
costs: you cannot ask "why did nothing happen at 3am last Tuesday" from the
UI. The answer is in the function logs, under `[cron]`. If that history is
worth a datastore later, it is a small addition — it is left out because
nothing yet needs it.

### Sign-in email

Rota never sends an email. The one-time code comes from Circle, triggered by
`createDeviceTokenForEmailLogin` — grep this repo for an SMTP client and you
will not find one, because there is nothing here to configure. The sending
domain and provider are set on **Circle's side**, in the Console for the
project that `CIRCLE_API_KEY` belongs to, and a sandbox catcher like Mailtrap
means codes are delivered into a trap rather than to the person waiting for
one.

Use **Resend** for the production sender: it exposes plain SMTP
(`smtp.resend.com:587`, username `resend`, password an API key), which is what
Circle wants, its free tier covers this project several times over, and its
domain setup is a guided SPF/DKIM flow rather than a pile of raw DNS. Amazon
SES is cheaper at volume and Postmark has better transactional deliverability,
but both cost more setup than this needs.

Whatever the provider, three things have to be true or codes land in spam:

- **SPF** — the sending domain's TXT record includes the provider.
- **DKIM** — the provider's signing keys published as CNAME or TXT records.
- **DMARC** — at least `v=DMARC1; p=none; rua=mailto:…`, so failures are visible.

When delivery is not configured, the app already says so rather than shrugging:
the Circle error classifier maps sender and SMTP failures to a message that
tells the person no code will arrive however many times they retry, and logs
the full upstream error under `[circle]`. See
[`web/lib/server/circle-errors.ts`](web/lib/server/circle-errors.ts).

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
not offered, so with only `NEXT_PUBLIC_ROTA_ADDRESS` set the app is testnet-only.

`arcMainnet` reads its chain id and RPC URL from the environment and is
registered as a Hardhat network only when both are set, so no mainnet RPC lives
in this repo.

### Layout

```
contracts/   Hardhat 3 + TypeScript, Solidity 0.8.24
  contracts/Rota.sol           the circle
  contracts/mocks/MockUSDC.sol Circle's token, faithfully
  scripts/deploy.ts            deploy, and print what the web app needs
  scripts/e2e.ts               a full circle on a live network
  scripts/probe.ts             connectivity, via the ERC-20 interface
  scripts/probe-raw.ts         raw JSON-RPC, no Hardhat, no assumptions
web/         Next.js App Router + wagmi + viem
  lib/mark.ts                  the logo, as numbers
  components/Logo.tsx          mark, horizontal lockup, stacked lockup
  scripts/gen-icon.ts          writes app/icon.svg from lib/mark.ts
  assets/                      TrueType faces for the Open Graph card
```

## The mark

Eight seats on a circle: seven hollow, one solid. The solid seat is whose turn
it is, and it sits at the top right rather than on an axis of symmetry, so the
ring reads as part-way round rather than parked.

Every drawing of it — the navbar lockup, the footer mark, the favicon, the
Apple touch icon, the Open Graph card — is generated from the geometry in
`web/lib/mark.ts`, so none of them can drift. The wordmark's optical alignment
is measured from the Oswald instance the app actually loads, not from the
foundry's figures; `web/assets/README.md` explains why that distinction bit.

`app/icon.svg` has to be a literal file, so it is generated rather than
hand-kept. After changing the geometry:

```bash
npm run icon --prefix web
```

Checked at 16, 32 and 64px by rasterising the real `icon.svg` and measuring
the ink in each seat: at 16px the solid seat still carries 1.38x the ink of a
hollow one, and the seven hollow seats agree within 1%.

## License

MIT
