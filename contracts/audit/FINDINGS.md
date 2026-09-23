# Static analysis of Rota.sol

Run on 2026-09-23 against `contracts/Rota.sol` at commit `9cefce7`.

| Tool | Version | Status |
| --- | --- | --- |
| Slither | 0.9.2 (solc 0.8.24) | ran, 47 results, 7 on Rota.sol after filtering dependencies |
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

### Aderyn

Aderyn publishes binaries for `x86_64`/`aarch64` on Linux and macOS only. Its
npm package refuses to install here — *"Platform with type Windows_NT and
architecture x64 is not supported"* — and building from source with
`cargo install aderyn --locked` fails in its `svm-rs-builds` build script,
which fetches `binaries.soliditylang.org/windows-amd64/list.json` at compile
time and times out. That host is reachable with curl (HTTP 200), so this is
the build script rather than the network.

It has not been run, and nothing below is informed by it. On Linux or macOS:

```bash
cd contracts && aderyn .
```

---

## 1. Allowance granted to Rota is spendable by any circle — **HIGH, REAL**

Slither: `arbitrary-send-erc20` (High impact, High confidence) on
`Rota.disburse` line 216.

> `Rota.disburse(uint256)` uses arbitrary from in transferFrom:
> `usdc.safeTransferFrom(member, recipient, contribution)`

**This is not a false positive.** `test/AllowanceReuse.poc.t.ts` demonstrates
the theft end to end and passes.

### Why

An ERC-20 allowance is granted to the Rota *contract*, not to a circle. Three
facts combine:

1. `createCircle` is permissionless and takes an arbitrary member list. Nobody
   it names is asked whether they agreed to be in it.
2. `start` checks only that each member's allowance is **large enough**. It
   cannot check what the allowance was *meant for*, because the token does not
   record that.
3. `disburse` then pulls `contribution` from every member to `members[0]`.

So a stranger can name a victim who already has an allowance from a circle
they did join, put themselves first in the rotation, and settle one cycle.

### Proof

```
Alice joins a real circle           -> allowance(Alice -> Rota) = 100 USDC
Mallory creates circle [Mallory, Alice], contribution 100, period 1
Mallory approves 100 (never has to honour it — Mallory is paid first)
Mallory calls start()               -> passes: Alice's allowance is 100 >= 100
Mallory calls disburse()            -> Alice pays 100 to Mallory

Alice -100 USDC.  Mallory +100 USDC.  Alice's allowance is now 0,
so the circle she actually joined can no longer settle either.
```

Mallory's own obligation never comes due: they simply never let a second cycle
settle, and can revoke their allowance immediately.

Cost to the attacker is gas. The precondition is that the victim has any
non-zero allowance to Rota — i.e. has joined any circle and it has not
finished.

### What it does *not* break

The custody invariant holds: Rota still never holds USDC, and the funds move
wallet to wallet. This is theft between users, not a drain of the contract.

### Fix

The contract must record consent per circle rather than inferring it from a
token allowance. Minimal change:

```solidity
mapping(uint256 => mapping(address => bool)) private _joined;

/// @notice Opt into a specific circle. Only a member may call it.
function join(uint256 circleId) external {
    Circle storage circle = _circles[circleId];
    if (circle.members.length == 0) revert UnknownCircle(circleId);
    if (circle.started) revert AlreadyStarted();
    if (!_isMember(circle, msg.sender)) revert NotAMember(msg.sender);
    _joined[circleId][msg.sender] = true;
    emit Joined(circleId, msg.sender);
}
```

and in `start`, alongside the existing allowance check:

```solidity
if (!_joined[circleId][member]) revert NotJoined(member);
```

The allowance check stays — it is still needed, it is just no longer doing a
job it cannot do.

This makes joining two transactions (approve, then join) where it is currently
one. That is the cost of the token not being able to scope an allowance.

### Status

**Not fixed in this commit.** Rota is deployed and immutable at
`0x2eb23a1aae43ff4c0aee3e1e6503475fa3b81eaf` on Arc mainnet and
`0x86Fc49612A3A7832865CCd65a5d7A5f689a5a808` on Arc testnet. Fixing it means
deploying a new contract and moving the app to it, which is a decision for the
owner, not a change to make quietly. Editing `Rota.sol` in place would also
break the match between this repository and the verified on-chain source.

Until then, the mitigation available to a user is to keep their allowance no
larger than their current circle needs, and to revoke it (`approve(rota, 0)`)
when a circle finishes. The app's Leave control already does exactly that.

---

## 2. External calls inside a loop — LOW, ACCEPTED

Slither: `calls-loop` ×3 — `start` line 159, `previewRound` lines 262–263.

Real, and deliberate. The usual danger is that one member can make the loop
revert and block everyone. Here:

- The loop is bounded by `MAX_MEMBERS = 20`.
- The calls are `allowance` and `balanceOf` on the USDC predeploy — views on a
  single known token, not arbitrary callee code. There is no reentrancy path
  and no member-controlled contract to revert from.
- `previewRound` is `view`; it costs the caller nothing on-chain.

Measured: `start` for 20 members is 625,570 gas against a 30M block limit.

No change.

## 3. `block.timestamp` used for comparisons — LOW, ACCEPTED

Slither: `timestamp` on `disburse` lines 188 and 205.

Real in the sense that a block producer has some latitude over the timestamp.
Immaterial here: `period` is hours or days, and the consequence of being a few
seconds early is that a payment everybody already agreed to happens a few
seconds early. Nothing branches on fine-grained time.

The one place timing does matter is the catch-up branch at line 205, which
exists precisely so a circle left idle cannot be settled many times in one
block. That is a correctness guard against *large* clock movement, which a
block producer cannot manufacture.

No change.

## 4. `solc-version` — INFORMATIONAL, FALSE POSITIVE

Slither: *"Pragma version 0.8.24 necessitates a version too recent to be
trusted. Consider deploying with 0.6.12/0.7.6/0.8.16"* and *"solc-0.8.24 is
not recommended for deployment"*.

This is a static list inside Slither 0.9.2, which predates 0.8.24. The advice
is "prefer a compiler that has been in the field a while", not a known bug in
0.8.24. 0.8.24 is the version this project is specified to use, is what the
mainnet deployment is verified against, and has been stable for a long time by
now. Downgrading to 0.8.16 to satisfy a 2023-era allowlist would be worse than
the finding.

No change.

## 5. OpenZeppelin dependency findings — NOT OURS

The unfiltered run reports 40 further results, all inside
`node_modules/@openzeppelin` — mostly `>=0.4.16` pragmas in the IERC20 and
IERC165 interfaces and `^0.8.20` in SafeERC20 and ReentrancyGuard. These are
upstream, they are interface files with no logic, and the effective compiler
is pinned at 0.8.24 by our own pragma.

They are kept in `slither.md` rather than filtered away so the full run is on
the record.
