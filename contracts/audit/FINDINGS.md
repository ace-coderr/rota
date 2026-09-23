# Static analysis of Rota.sol

| Tool | Version | Status |
| --- | --- | --- |
| Slither | 0.9.2 (solc 0.8.24) | ran, 7 results on Rota.sol after filtering dependencies |
| Aderyn | 0.6.8 | **did not run** — see below |

Raw output is in `slither.md` (all contracts, including OpenZeppelin),
`slither.json` (project only) and `slither-console.txt`.

Reproduce:

```bash
cd contracts
slither contracts/Rota.sol \
  --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
  --filter-paths node_modules --checklist
```

> Slither caches compilation. After editing the contract, delete
> `crytic-export/` and `artifacts/build-info/` or it will report findings
> against the previous source, with line numbers that no longer exist. That
> happened during this work and was caught only because `disburse` was
> reported at line 180 when it had moved to 232.

### Aderyn

Aderyn publishes binaries for Linux and macOS only. Its npm package refuses to
install here — *"Platform with type Windows_NT and architecture x64 is not
supported"* — and `cargo install aderyn --locked` fails in its `svm-rs-builds`
build script, which fetches `binaries.soliditylang.org/windows-amd64/list.json`
at compile time and times out. That host answers curl with HTTP 200, so this is
the build script, not the network. Installing the Linux binary under WSL was
not permitted in this environment.

It has not been run, and nothing below is informed by it. On Linux or macOS:

```bash
cd contracts && aderyn .
```

---

## 1. Allowance granted to Rota was spendable by any circle — **FIXED**

Slither: `arbitrary-send-erc20` (High impact, High confidence) on
`Rota.disburse`.

> `Rota.disburse(uint256)` uses arbitrary from in transferFrom:
> `usdc.safeTransferFrom(member, recipient, contribution)`

### Before — a real, exploitable theft

An ERC-20 allowance is granted to the Rota *contract*, not to a circle. Three
facts combined:

1. `createCircle` is permissionless and takes an arbitrary member list. Nobody
   it named was asked whether they agreed to be in it.
2. `start` checked only that each member's allowance was **large enough**. It
   could not check what the allowance was *meant for*, because the token does
   not record that.
3. `disburse` then pulled `contribution` from every member to `members[0]`.

So a stranger could name a victim who already had an allowance from a circle
they did join, put themselves first in the rotation, and settle one cycle:

```
Alice joins a real circle           -> allowance(Alice -> Rota) = 100 USDC
Mallory creates [Mallory, Alice], contribution 100, period 1
Mallory approves 100 (never has to honour it — Mallory is paid first)
Mallory calls start()               -> passed: Alice's allowance was 100 >= 100
Mallory calls disburse()            -> Alice paid 100 to Mallory

Alice -100 USDC.  Mallory +100 USDC.  Alice's allowance was then 0,
so the circle she actually joined could no longer settle either.
```

Cost to the attacker was gas. The precondition was that the victim had any
non-zero allowance to Rota — i.e. had joined any circle that had not finished.

### After — consent is recorded, not inferred

`join(uint256 circleId)` records that `msg.sender` chose a specific circle, in
`mapping(uint256 => mapping(address => bool)) private _joined`. Only a member
may call it, and only before the circle starts. Joining twice is a no-op rather
than an error, because someone who resubmits after a slow confirmation has not
done anything wrong.

`start` now checks consent **before** capacity, so the revert names the right
problem:

```solidity
if (!_joined[circleId][member]) revert NotJoined(member);
uint256 allowed = usdc.allowance(member, address(this));
if (allowed < required) revert InsufficientAllowanceToStart(...);
```

`disburse` re-checks at the transfer itself:

```solidity
if (!_joined[circleId][member]) revert NotJoined(member);
usdc.safeTransferFrom(member, recipient, contribution);
```

That second check is redundant given `start`, and deliberately so. The property
worth having is "Rota never moves money belonging to someone who did not
agree". A property enforced at the point where it could be violated survives
future edits to the code path that leads there; one that depends on an earlier
function having run does not.

`previewRound` now returns `joined` per member and factors it into `ready`, so
the app reads consent instead of inferring it from an allowance — which was the
same flawed inference that made the attack possible.

### Evidence

`test/AllowanceReuse.poc.t.ts` runs the identical attack and asserts it fails.
Before the fix, its first assertion — *"Alice paid 100 USDC into a circle she
never joined"* — passed. Now:

```
FIXED: an allowance is only spendable by a circle you joined
  ✔ refuses to start a circle naming someone who never joined it
  ✔ refuses to pull from a member added to a circle after it started
  ✔ records consent per circle, not per contract
  ✔ will not let a non-member join, or anyone join after the start
  ✔ treats joining twice as a no-op rather than an error
```

The first of those asserts Alice's balance is unchanged **and** her allowance
is still 100, so her own circle can still settle.

### Slither still reports it, and that is now a false positive

The detector is syntactic: it fires whenever `transferFrom`'s `from` is not
`msg.sender`. It has no way to see that `member` is drawn from a fixed list, or
that `_joined` gates the call. The finding cannot be cleared by any change that
keeps Rota non-custodial, because pulling from another address is exactly how a
contract moves money without ever holding it.

It is left unsuppressed. A suppression comment would hide it from the next
person who runs the tool, and the honest answer is not "this detector is wrong"
but "this specific call is safe, and here is the test that says so".

### Cost

The 20-member `disburse` went from 427,136 to 470,463 gas — one storage read
per paying member. Still 98.4% under Arc's 30M block limit.

Joining is now two transactions: `approve` on USDC, then `join` on Rota. That
is the price of a token that cannot scope an allowance to a purpose.

---

## 2. External calls inside a loop — LOW, ACCEPTED

Slither: `calls-loop` ×3 — `start` line 211, `previewRound` lines 322–323.

Real, and deliberate. The usual danger is that one member can make the loop
revert and block everyone. Here:

- The loop is bounded by `MAX_MEMBERS = 20`.
- The calls are `allowance` and `balanceOf` on the USDC predeploy — views on a
  single known token, not arbitrary callee code. There is no reentrancy path
  and no member-controlled contract to revert from.
- `previewRound` is `view`; it costs the caller nothing on-chain.

No change.

## 3. `block.timestamp` used for comparisons — LOW, ACCEPTED

Slither: `timestamp` on `disburse` lines 240 and 257.

Real in the sense that a block producer has some latitude over the timestamp.
Immaterial here: `period` is hours or days, and being a few seconds early means
a payment everybody already agreed to happens a few seconds early.

The one place timing matters is the catch-up branch, which exists precisely so
a circle left idle cannot be settled many times in one block. That guards
against *large* clock movement, which a block producer cannot manufacture.

No change.

## 4. `solc-version` — INFORMATIONAL, FALSE POSITIVE

Slither 0.9.2 carries a static list that predates 0.8.24 and suggests
downgrading to 0.8.16. The advice is "prefer a compiler that has been in the
field a while", not a known bug. 0.8.24 is what this project is specified to
use and what the deployment is verified against.

No change.

## 5. OpenZeppelin dependency findings — NOT OURS

The unfiltered run reports 40 further results, all inside
`node_modules/@openzeppelin` — mostly `>=0.4.16` pragmas in the IERC20 and
IERC165 interfaces and `^0.8.20` in SafeERC20 and ReentrancyGuard. Upstream,
interface files with no logic, and the effective compiler is pinned at 0.8.24
by our own pragma.

They are kept in `slither.md` rather than filtered away so the full run is on
the record.
