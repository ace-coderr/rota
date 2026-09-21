import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { network } from "hardhat";
import { parseEventLogs, type Address } from "viem";

const USDC_DECIMALS = 6n;
const usdc = (whole: bigint) => whole * 10n ** USDC_DECIMALS;

const CONTRIBUTION = usdc(100n); // 100 USDC per member per cycle
const PERIOD = 7n * 24n * 60n * 60n; // one week
const MEMBER_COUNT = 5;
const STARTING_BALANCE = usdc(1_000n);

// Each member pays out contribution once per cycle for every cycle they are
// not the recipient, i.e. (members - 1) times across a full rotation.
const FULL_ROTATION_ALLOWANCE = CONTRIBUTION * BigInt(MEMBER_COUNT - 1);
const PAYOUT = CONTRIBUTION * BigInt(MEMBER_COUNT - 1);

const { viem, networkHelpers } = await network.getOrCreate();
const { time } = networkHelpers;

const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();

/** wallets[0] deploys, wallets[1..5] are the circle, wallets[6] is an outsider. */
const memberWallets = wallets.slice(1, 1 + MEMBER_COUNT);
const outsider = wallets[1 + MEMBER_COUNT];
const memberAddresses = memberWallets.map((w) => w.account.address as Address);

type Ctx = Awaited<ReturnType<typeof setup>>;

/**
 * Fresh token and fresh Rota per test, so no test can inherit balances or
 * allowances from another.
 */
async function setup(options: { approve?: bigint } = {}) {
  const token = await viem.deployContract("MockUSDC");
  const rota = await viem.deployContract("Rota", [token.address]);

  for (const wallet of memberWallets) {
    await token.write.mint([wallet.account.address, STARTING_BALANCE]);
    await token.write.approve(
      [rota.address, options.approve ?? FULL_ROTATION_ALLOWANCE],
      { account: wallet.account },
    );
  }

  const hash = await rota.write.createCircle([
    memberAddresses,
    CONTRIBUTION,
    PERIOD,
  ]);
  await publicClient.waitForTransactionReceipt({ hash });
  const circleId = 0n;

  return { token, rota, circleId };
}

const rotaBalance = (ctx: Ctx) =>
  ctx.token.read.balanceOf([ctx.rota.address]) as Promise<bigint>;

const balanceOf = (ctx: Ctx, who: Address) =>
  ctx.token.read.balanceOf([who]) as Promise<bigint>;

const allBalances = (ctx: Ctx) =>
  Promise.all(memberAddresses.map((m) => balanceOf(ctx, m)));

async function startCircle(ctx: Ctx) {
  const hash = await ctx.rota.write.start([ctx.circleId], {
    account: memberWallets[0].account,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Disburses one cycle and returns the Disbursed event args, plus every USDC
 * Transfer the call emitted. The transfer log is what proves non-custody:
 * an end-of-transaction balance check cannot see funds that arrive and leave
 * within the same call, but the Transfer events can.
 */
async function disburse(ctx: Ctx, caller = outsider) {
  const hash = await ctx.rota.write.disburse([ctx.circleId], {
    account: caller.account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [event] = parseEventLogs({
    abi: ctx.rota.abi,
    logs: receipt.logs,
    eventName: "Disbursed",
  });
  // Filter by emitter. On Arc every USDC movement emits two Transfer logs
  // with identical topics and from/to: one from the USDC predeploy carrying
  // the 6-decimal value, and one from the native coin authority carrying the
  // 18-decimal value. Parsing without an address filter double-counts every
  // transfer and mixes the two scales. MockUSDC has no second emitter, but the
  // filter is the production-correct shape and is asserted for real in e2e.ts.
  const transfers = parseEventLogs({
    abi: ctx.token.abi,
    logs: onlyFrom(receipt.logs, ctx.token.address),
    eventName: "Transfer",
  }).map((log) => log.args as { from: Address; to: Address; value: bigint });

  return {
    ...(event.args as {
      circleId: bigint;
      cycleIndex: number;
      recipient: Address;
      totalPaid: bigint;
    }),
    transfers,
  };
}

/**
 * Narrows a receipt's logs to a single emitter.
 *
 * On Arc every USDC movement emits TWO Transfer logs with the same topic0 and
 * the same indexed from/to: one from the USDC predeploy carrying the 6-decimal
 * value, and one from the native coin authority (0xffff…fffe) carrying the
 * 18-decimal value. Parsing without filtering double-counts every transfer and
 * mixes the two scales. viem's parseEventLogs has no address option, so the
 * filter has to happen on the logs array.
 *
 * MockUSDC has no second emitter, so locally this is a no-op — it keeps the
 * test the same shape as production, and e2e.ts asserts the real behaviour.
 */
function onlyFrom<T extends { address: string }>(logs: T[], emitter: string) {
  return logs.filter(
    (log) => log.address.toLowerCase() === emitter.toLowerCase(),
  );
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
  return message;
}

describe("Rota", () => {
  // ---------------------------------------------------------------------
  // The project's core claim. If this ever fails, Rota is custodial and the
  // whole design is void.
  // ---------------------------------------------------------------------
  it("Rota never holds USDC", async () => {
    const ctx = await setup();

    assert.equal(
      await rotaBalance(ctx),
      0n,
      "Rota held USDC before the circle started",
    );

    await startCircle(ctx);
    assert.equal(
      await rotaBalance(ctx),
      0n,
      "Rota held USDC after start — start must move no value",
    );

    const rotaAddress = ctx.rota.address.toLowerCase();

    for (let cycle = 0; cycle < MEMBER_COUNT; cycle++) {
      await time.increase(Number(PERIOD));
      const { recipient, transfers } = await disburse(ctx);

      assert.equal(
        await rotaBalance(ctx),
        0n,
        `Rota held USDC after disbursing cycle ${cycle}`,
      );

      // A balance check between transactions would still pass if Rota took
      // custody and paid out again within the same call, so check the
      // transfers themselves: Rota must never be an endpoint of one.
      for (const transfer of transfers) {
        assert.notEqual(
          transfer.from.toLowerCase(),
          rotaAddress,
          `cycle ${cycle}: USDC moved OUT of Rota — it took custody mid-transaction`,
        );
        assert.notEqual(
          transfer.to.toLowerCase(),
          rotaAddress,
          `cycle ${cycle}: USDC moved INTO Rota — it took custody mid-transaction`,
        );
        assert.equal(
          transfer.to.toLowerCase(),
          recipient.toLowerCase(),
          `cycle ${cycle}: USDC went somewhere other than the recipient`,
        );
      }

      assert.equal(
        transfers.length,
        MEMBER_COUNT - 1,
        `cycle ${cycle}: expected exactly one wallet-to-wallet transfer per paying member, not a hop through Rota`,
      );
    }

    assert.equal(await ctx.rota.read.isComplete([ctx.circleId]), true);
    assert.equal(
      await rotaBalance(ctx),
      0n,
      "Rota held USDC after a complete round",
    );
  });

  it("runs a full rotation: every member receives exactly once, and receives contribution * 4", async () => {
    const ctx = await setup();
    await startCircle(ctx);

    const recipients: Address[] = [];

    for (let cycle = 0; cycle < MEMBER_COUNT; cycle++) {
      const expected = memberAddresses[cycle];
      const before = await balanceOf(ctx, expected);

      await time.increase(Number(PERIOD));
      const event = await disburse(ctx);

      assert.equal(event.cycleIndex, cycle, "cycle index out of order");
      assert.equal(
        event.recipient.toLowerCase(),
        expected.toLowerCase(),
        `cycle ${cycle} paid the wrong member`,
      );
      assert.equal(
        event.totalPaid,
        PAYOUT,
        `cycle ${cycle} paid the wrong total`,
      );

      const after = await balanceOf(ctx, expected);
      assert.equal(
        after - before,
        PAYOUT,
        `member ${cycle} did not receive contribution * ${MEMBER_COUNT - 1}`,
      );

      recipients.push(event.recipient.toLowerCase() as Address);
    }

    assert.equal(recipients.length, MEMBER_COUNT);
    assert.equal(
      new Set(recipients).size,
      MEMBER_COUNT,
      "a member was paid more than once",
    );
    assert.deepEqual(
      recipients,
      memberAddresses.map((m) => m.toLowerCase()),
      "payouts did not follow the member order",
    );
  });

  it("leaves every member with a net position of zero after a complete round", async () => {
    const ctx = await setup();
    const opening = await allBalances(ctx);

    await startCircle(ctx);
    for (let cycle = 0; cycle < MEMBER_COUNT; cycle++) {
      await time.increase(Number(PERIOD));
      await disburse(ctx);
    }

    const closing = await allBalances(ctx);
    for (let i = 0; i < MEMBER_COUNT; i++) {
      assert.equal(
        closing[i],
        opening[i],
        `member ${i} is not net flat: ${opening[i]} -> ${closing[i]}`,
      );
    }
  });

  it("reverts disburse when one member's allowance is insufficient, and no balance moves", async () => {
    const ctx = await setup();
    await startCircle(ctx);

    // The last member in the loop revokes, so the earlier transfers in the
    // same call succeed first and then have to be rolled back.
    const short = memberWallets[4];
    await ctx.token.write.approve([ctx.rota.address, 0n], {
      account: short.account,
    });

    const before = await allBalances(ctx);
    await time.increase(Number(PERIOD));

    await expectRevert(
      ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
      "ERC20: transfer amount exceeds allowance",
    );

    assert.deepEqual(await allBalances(ctx), before, "balances moved on a failed disburse");
    assert.equal(await rotaBalance(ctx), 0n);

    const [, , , cycleIndex] = (await ctx.rota.read.getCircle([
      ctx.circleId,
    ])) as [bigint, bigint, bigint, number, boolean, bigint];
    assert.equal(cycleIndex, 0, "the rotation advanced despite reverting");
  });

  it("reverts disburse when one member's balance is insufficient, and no balance moves", async () => {
    const ctx = await setup();
    await startCircle(ctx);

    // Same position in the loop, but broke rather than unapproved.
    const short = memberWallets[4];
    await ctx.token.write.transfer(
      [outsider.account.address, STARTING_BALANCE - (CONTRIBUTION - 1n)],
      { account: short.account },
    );

    const before = await allBalances(ctx);
    assert.ok(before[4] < CONTRIBUTION, "the short member should be short");

    await time.increase(Number(PERIOD));

    await expectRevert(
      ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
      "ERC20: transfer amount exceeds balance",
    );

    assert.deepEqual(await allBalances(ctx), before, "balances moved on a failed disburse");
    assert.equal(await rotaBalance(ctx), 0n);
  });

  it("previewRound flags the short member without reverting", async () => {
    type Status = {
      member: Address;
      allowance: bigint;
      balance: bigint;
      ready: boolean;
    };

    // Before start: one member has not approved enough for a full rotation.
    const ctx = await setup({ approve: 0n });
    for (const wallet of memberWallets.slice(0, 4)) {
      await ctx.token.write.approve(
        [ctx.rota.address, FULL_ROTATION_ALLOWANCE],
        { account: wallet.account },
      );
    }

    let statuses = (await ctx.rota.read.previewRound([
      ctx.circleId,
    ])) as Status[];

    assert.equal(statuses.length, MEMBER_COUNT);
    assert.deepEqual(
      statuses.map((s) => s.ready),
      [true, true, true, true, false],
      "previewRound did not flag the unapproved member before start",
    );
    assert.equal(statuses[4].allowance, 0n);
    assert.equal(statuses[4].balance, STARTING_BALANCE);
    assert.equal(
      statuses[0].member.toLowerCase(),
      memberAddresses[0].toLowerCase(),
    );

    // And start agrees with the preview.
    await expectRevert(
      ctx.rota.write.start([ctx.circleId], {
        account: memberWallets[0].account,
      }),
      "InsufficientAllowanceToStart",
    );

    // After start: a member goes broke mid-rotation.
    await ctx.token.write.approve(
      [ctx.rota.address, FULL_ROTATION_ALLOWANCE],
      { account: memberWallets[4].account },
    );
    await startCircle(ctx);
    await ctx.token.write.transfer(
      [outsider.account.address, STARTING_BALANCE],
      { account: memberWallets[3].account },
    );

    statuses = (await ctx.rota.read.previewRound([ctx.circleId])) as Status[];

    assert.deepEqual(
      statuses.map((s) => s.ready),
      [true, true, true, false, true],
      "previewRound did not flag the broke member after start",
    );
    // members[0] is this cycle's recipient and pays nothing, so it is ready
    // even though it is about to receive rather than send.
    assert.equal(statuses[0].ready, true);
    assert.equal(statuses[3].balance, 0n);
  });

  it("reverts disburse before nextDueAt", async () => {
    const ctx = await setup();
    await startCircle(ctx);

    await expectRevert(
      ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
      "NotDue",
    );

    // Still not due one second early.
    const [, , nextDueAt] = (await ctx.rota.read.getCircle([ctx.circleId])) as [
      bigint,
      bigint,
      bigint,
      number,
      boolean,
      bigint,
    ];
    await time.increaseTo(Number(nextDueAt) - 2);
    await expectRevert(
      ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
      "NotDue",
    );

    // Due exactly at nextDueAt.
    await time.increaseTo(Number(nextDueAt));
    await disburse(ctx);
  });

  it("catches the schedule up after a long idle gap instead of letting cycles stack", async () => {
    const ctx = await setup();
    await startCircle(ctx);

    // Nobody calls disburse for three periods.
    await time.increase(Number(PERIOD * 3n));
    await disburse(ctx);

    // Without the catch-up the schedule would still be at start + 2 periods,
    // already in the past, so the next cycle would be instantly claimable —
    // and so would every cycle after it, draining the circle in one block.
    await expectRevert(
      ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
      "NotDue",
    );

    const [, , nextDueAt] = (await ctx.rota.read.getCircle([ctx.circleId])) as [
      bigint,
      bigint,
      bigint,
      number,
      boolean,
      bigint,
    ];
    const now = BigInt(await time.latest());
    assert.equal(
      nextDueAt,
      now + PERIOD,
      "after catching up, the next cycle should be a full period away",
    );
  });

  it("does not drift across five on-time cycles", async () => {
    const ctx = await setup();
    await startCircle(ctx);

    const [, , firstDueAt] = (await ctx.rota.read.getCircle([ctx.circleId])) as [
      bigint,
      bigint,
      bigint,
      number,
      boolean,
      bigint,
    ];

    for (let cycle = 0; cycle < MEMBER_COUNT; cycle++) {
      await time.increase(Number(PERIOD));
      await disburse(ctx);

      const [, , nextDueAt] = (await ctx.rota.read.getCircle([
        ctx.circleId,
      ])) as [bigint, bigint, bigint, number, boolean, bigint];

      // Each settlement lands a second or two after its due date, but the
      // grid itself must stay exactly on the original cadence.
      assert.equal(
        nextDueAt,
        firstDueAt + PERIOD * BigInt(cycle + 1),
        `cycle ${cycle} drifted off the original schedule`,
      );
    }
  });

  it("settles a full 20-member circle within Arc's block gas limit", async () => {
    const ARC_BLOCK_GAS_LIMIT = 30_000_000n;
    const size = 20;

    const token = await viem.deployContract("MockUSDC");
    const rota = await viem.deployContract("Rota", [token.address]);

    assert.equal(await rota.read.MAX_MEMBERS(), BigInt(size));

    const big = wallets.slice(0, size);
    const bigAddresses = big.map((w) => w.account.address as Address);
    const allowance = CONTRIBUTION * BigInt(size - 1);

    for (const wallet of big) {
      await token.write.mint([wallet.account.address, STARTING_BALANCE]);
      await token.write.approve([rota.address, allowance], {
        account: wallet.account,
      });
    }

    await rota.write.createCircle([bigAddresses, CONTRIBUTION, PERIOD]);
    await rota.write.start([0n], { account: big[0].account });

    await time.increase(Number(PERIOD));

    // Anyone may call; here a member does, since all 20 accounts are in use.
    const hash = await rota.write.disburse([0n], { account: big[1].account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    assert.equal(receipt.status, "success");

    // Emitter-filtered, as above: on Arc the native coin authority emits a
    // duplicate Transfer for every movement.
    const transfers = parseEventLogs({
      abi: token.abi,
      logs: onlyFrom(receipt.logs, token.address),
      eventName: "Transfer",
    });
    assert.equal(transfers.length, size - 1, "expected 19 paying members");

    const headroom =
      Number((ARC_BLOCK_GAS_LIMIT - receipt.gasUsed) * 100n) /
      Number(ARC_BLOCK_GAS_LIMIT);
    console.log(
      `\n      20-member disburse: ${receipt.gasUsed} gas ` +
        `(${headroom.toFixed(1)}% headroom under Arc's ${ARC_BLOCK_GAS_LIMIT} block limit)\n`,
    );

    assert.ok(
      receipt.gasUsed < ARC_BLOCK_GAS_LIMIT,
      `a full 20-member cycle costs ${receipt.gasUsed} gas, over Arc's block limit`,
    );
  });

  it("reverts disburse after the circle is complete", async () => {
    const ctx = await setup();
    await startCircle(ctx);

    for (let cycle = 0; cycle < MEMBER_COUNT; cycle++) {
      await time.increase(Number(PERIOD));
      await disburse(ctx);
    }

    assert.equal(await ctx.rota.read.isComplete([ctx.circleId]), true);

    await time.increase(Number(PERIOD));
    await expectRevert(
      ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
      "CircleComplete",
    );
  });

  // ------------------------------------------------------------------
  // Arc's USDC can refuse a transfer on compliance grounds regardless of
  // balance and allowance. MockUSDC mirrors NativeFiatTokenV2_2's guards, so
  // these exercise the same reverts the frontend classifies.
  // ------------------------------------------------------------------
  describe("compliance refusals", () => {
    it("reverts when Rota itself is blocklisted, and no balance moves", async () => {
      const ctx = await setup();
      await startCircle(ctx);

      // Rota is the spender on every transferFrom, and V2_2 guards the
      // spender. Blocking it freezes the whole circle.
      await ctx.token.write.blacklist([ctx.rota.address]);

      const before = await allBalances(ctx);
      await time.increase(Number(PERIOD));

      await expectRevert(
        ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
        "Blacklistable: account is blacklisted",
      );

      assert.deepEqual(await allBalances(ctx), before);
      assert.equal(await rotaBalance(ctx), 0n);
    });

    it("reverts when the token is paused, and no balance moves", async () => {
      const ctx = await setup();
      await startCircle(ctx);

      await ctx.token.write.pause();

      const before = await allBalances(ctx);
      await time.increase(Number(PERIOD));

      await expectRevert(
        ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
        "Pausable: paused",
      );

      assert.deepEqual(await allBalances(ctx), before);
    });

    it("reverts when the native coin authority refuses a member, and no balance moves", async () => {
      const ctx = await setup();
      await startCircle(ctx);

      // from/to compliance is not a modifier on V2_2: _transfer delegates to
      // the native coin authority, which comes back as "Native transfer
      // failed". The member here is fully funded and fully approved.
      await ctx.token.write.setAuthorityBlocked([
        memberAddresses[4],
        true,
      ]);

      const before = await allBalances(ctx);
      assert.ok(before[4] >= CONTRIBUTION, "the blocked member is not short");

      await time.increase(Number(PERIOD));

      await expectRevert(
        ctx.rota.write.disburse([ctx.circleId], { account: outsider.account }),
        "Native transfer failed",
      );

      assert.deepEqual(await allBalances(ctx), before);
      assert.equal(await rotaBalance(ctx), 0n);
    });

    it("previewRound still reports a blocked member as ready, which is why the UI checks isBlacklisted", async () => {
      const ctx = await setup();
      await startCircle(ctx);
      await ctx.token.write.setAuthorityBlocked([memberAddresses[4], true]);

      type Status = { member: `0x${string}`; allowance: bigint; balance: bigint; ready: boolean };
      const statuses = (await ctx.rota.read.previewRound([
        ctx.circleId,
      ])) as Status[];

      // Allowance and balance are both fine, so previewRound says ready. It
      // reads allowance and balance only — it cannot see compliance state.
      // The frontend calls isBlacklisted separately for exactly this reason.
      assert.equal(statuses[4].ready, true);
      assert.ok(statuses[4].balance >= CONTRIBUTION);
    });
  });

  describe("createCircle validation", () => {
    let rota: Ctx["rota"];

    before(async () => {
      const token = await viem.deployContract("MockUSDC");
      rota = await viem.deployContract("Rota", [token.address]);
    });

    it("rejects fewer than two members", async () => {
      await expectRevert(
        rota.write.createCircle([[memberAddresses[0]], CONTRIBUTION, PERIOD]),
        "TooFewMembers",
      );
      await expectRevert(
        rota.write.createCircle([[], CONTRIBUTION, PERIOD]),
        "TooFewMembers",
      );
    });

    it("rejects duplicate members", async () => {
      await expectRevert(
        rota.write.createCircle([
          [memberAddresses[0], memberAddresses[1], memberAddresses[0]],
          CONTRIBUTION,
          PERIOD,
        ]),
        "DuplicateMember",
      );
    });

    it("rejects the zero address", async () => {
      await expectRevert(
        rota.write.createCircle([
          [memberAddresses[0], "0x0000000000000000000000000000000000000000"],
          CONTRIBUTION,
          PERIOD,
        ]),
        "ZeroAddressMember",
      );
    });

    it("rejects a zero contribution", async () => {
      await expectRevert(
        rota.write.createCircle([memberAddresses, 0n, PERIOD]),
        "ZeroContribution",
      );
    });

    it("rejects a zero period", async () => {
      await expectRevert(
        rota.write.createCircle([memberAddresses, CONTRIBUTION, 0n]),
        "ZeroPeriod",
      );
    });

    it("rejects more than MAX_MEMBERS", async () => {
      // 21 distinct addresses; only their count matters here.
      const tooMany = Array.from(
        { length: 21 },
        (_, i) =>
          `0x${(i + 1).toString(16).padStart(40, "0")}` as Address,
      );

      await expectRevert(
        rota.write.createCircle([tooMany, CONTRIBUTION, PERIOD]),
        "TooManyMembers",
      );

      // Exactly at the cap is fine.
      await rota.write.createCircle([
        tooMany.slice(0, 20),
        CONTRIBUTION,
        PERIOD,
      ]);
    });
  });
});
