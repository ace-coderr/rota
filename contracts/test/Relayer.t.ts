import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEventLogs, type Address } from "viem";

/**
 * The relayer has no special power.
 *
 * Rota pays rounds automatically from a funded wallet so that no member has to
 * be awake when a round falls due. That wallet is an operational convenience,
 * and the moment it becomes anything more the project's claim is void — so
 * this file states what it can do, and proves the rest is out of reach.
 *
 * It can: call `disburse(circleId)`, which any address on the chain can call.
 *
 * It cannot: be paid by a round it settles; move a member's USDC; settle a
 * round early; or reach any privileged function, because the contract has
 * none. Each of those is a test below.
 *
 * The relayer here is simply a wallet that is not in the circle and has never
 * been granted anything — which is exactly what the deployed one is.
 */
const USDC_DECIMALS = 6n;
const usdc = (whole: bigint) => whole * 10n ** USDC_DECIMALS;

const CONTRIBUTION = usdc(100n);
const PERIOD = 7n * 24n * 60n * 60n;
const MEMBER_COUNT = 4;
const STARTING_BALANCE = usdc(1_000n);
const FULL_ROTATION_ALLOWANCE = CONTRIBUTION * BigInt(MEMBER_COUNT - 1);
const PAYOUT = CONTRIBUTION * BigInt(MEMBER_COUNT - 1);

const { viem, networkHelpers } = await network.getOrCreate();
const { time } = networkHelpers;

const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();

/** wallets[0] deploys, wallets[1..4] are the circle, wallets[5] is the relayer. */
const memberWallets = wallets.slice(1, 1 + MEMBER_COUNT);
const memberAddresses = memberWallets.map((w) => w.account.address as Address);
const relayer = wallets[1 + MEMBER_COUNT];
const relayerAddress = relayer.account.address as Address;

async function setup() {
  const token = await viem.deployContract("MockUSDC");
  const rota = await viem.deployContract("Rota", [token.address]);

  for (const wallet of memberWallets) {
    await token.write.mint([wallet.account.address, STARTING_BALANCE]);
    await token.write.approve([rota.address, FULL_ROTATION_ALLOWANCE], {
      account: wallet.account,
    });
  }

  /*
   * The relayer is funded, because on Arc gas is paid in the same USDC the
   * circles move. That is the whole reason it needs a balance at all, and it
   * is why "it cannot take anyone's money" has to be proven rather than
   * assumed from it being poor.
   */
  await token.write.mint([relayerAddress, usdc(50n)]);

  const created = await rota.write.createCircle([
    memberAddresses,
    CONTRIBUTION,
    PERIOD,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: created });

  for (const wallet of memberWallets) {
    const hash = await rota.write.join([0n], { account: wallet.account });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  const started = await rota.write.start([0n], {
    account: memberWallets[0].account,
  });
  await publicClient.waitForTransactionReceipt({ hash: started });

  return { token, rota, circleId: 0n };
}

async function expectRevert(promise: Promise<unknown>, needle?: string) {
  let message: string | undefined;
  try {
    await promise;
  } catch (error) {
    message = String((error as Error)?.message ?? error);
  }
  assert.ok(message !== undefined, "expected the call to revert, but it succeeded");
  if (needle) {
    assert.ok(
      message.includes(needle),
      `expected revert matching ${needle}, got:\n${message}`,
    );
  }
}

describe("the relayer is an ordinary caller", () => {
  it("settles a round, and the money goes to the member whose turn it is — not to the caller", async () => {
    const { token, rota, circleId } = await setup();
    await time.increase(Number(PERIOD));

    const before = await token.read.balanceOf([relayerAddress]) as bigint;

    const hash = await rota.write.disburse([circleId], {
      account: relayer.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const [event] = parseEventLogs({
      abi: rota.abi,
      logs: receipt.logs,
      eventName: "Disbursed",
    });
    const args = event.args as { recipient: Address; totalPaid: bigint };

    // Paid the first member in the rotation, who is not the caller.
    assert.equal(args.recipient.toLowerCase(), memberAddresses[0].toLowerCase());
    assert.equal(args.totalPaid, PAYOUT);
    assert.notEqual(
      args.recipient.toLowerCase(),
      relayerAddress.toLowerCase(),
      "the caller must never be the recipient",
    );

    // And the caller is not a cent better off. MockUSDC charges no gas, so
    // this is exact: settling a round earns the relayer nothing at all.
    const after = await token.read.balanceOf([relayerAddress]) as bigint;
    assert.equal(after, before, "the relayer took nothing from the round");
  });

  it("cannot move a member's USDC, because no member has granted it anything", async () => {
    const { token, rota } = await setup();

    // Every member has an allowance for ROTA. None of them has one for the
    // relayer, and that is the only thing standing between a funded operations
    // wallet and everyone's savings.
    for (const member of memberAddresses) {
      assert.equal(
        (await token.read.allowance([member, relayerAddress])) as bigint,
        0n,
        "the relayer must hold no allowance from any member",
      );
      assert.ok(
        ((await token.read.allowance([member, rota.address])) as bigint) > 0n,
        "the allowance belongs to Rota, not to the relayer",
      );
    }

    await expectRevert(
      token.write.transferFrom(
        [memberAddresses[1], relayerAddress, CONTRIBUTION],
        { account: relayer.account },
      ),
    );

    assert.equal(
      (await token.read.balanceOf([memberAddresses[1]])) as bigint,
      STARTING_BALANCE,
      "the member's balance is untouched",
    );
  });

  it("cannot settle a round early — the schedule is not something a caller can skip", async () => {
    const { rota, token, circleId } = await setup();

    await expectRevert(
      rota.write.disburse([circleId], { account: relayer.account }),
      "NotDue",
    );

    for (const member of memberAddresses) {
      assert.equal(
        (await token.read.balanceOf([member])) as bigint,
        STARTING_BALANCE,
        "nothing moved",
      );
    }
  });

  it("has nothing privileged to reach: the contract has no owner, admin, pause or sweep", async () => {
    const { rota } = await setup();

    const names = rota.abi
      .filter((entry): entry is typeof entry & { name: string } =>
        entry.type === "function" && typeof entry.name === "string",
      )
      .map((entry) => entry.name.toLowerCase());

    for (const forbidden of [
      "owner",
      "transferownership",
      "renounceownership",
      "pause",
      "unpause",
      "sweep",
      "rescue",
      "withdraw",
      "setfee",
      "upgradeto",
    ]) {
      assert.ok(
        !names.includes(forbidden),
        `Rota must expose no ${forbidden}() — a relayer with a privileged call is not an ordinary caller`,
      );
    }

    // And the mutating surface is exactly these four, all of which any address
    // may call and none of which can redirect a payout.
    const mutating = rota.abi
      .filter(
        (entry): entry is typeof entry & { name: string; stateMutability: string } =>
          entry.type === "function" &&
          typeof (entry as { name?: string }).name === "string" &&
          !["view", "pure"].includes(
            (entry as { stateMutability?: string }).stateMutability ?? "",
          ),
      )
      .map((entry) => entry.name)
      .sort();

    assert.deepEqual(mutating, ["createCircle", "disburse", "join", "start"]);
  });
});
