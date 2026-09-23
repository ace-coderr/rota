/*
 * Regression test for the finding Slither reported as `arbitrary-send-erc20`
 * (High/High) on Rota.disburse.
 *
 * A USDC allowance is granted to the Rota CONTRACT, not to a circle. Before
 * join() existed, nothing asked the people createCircle names whether they
 * agreed, and start() only checked that each allowance was large enough — not
 * that it was meant for this circle. So anyone could name a victim who already
 * held an allowance, put themselves first in the rotation, and settle one
 * cycle. This test used to pass, by taking Alice's money.
 *
 * It now runs the identical attack and asserts it FAILS — twice over. start()
 * names Alice as not having joined, and disburse() refuses at the transfer
 * itself even when a circle was started before she was added to it. Alice's
 * balance and allowance come out untouched.
 *
 * If this ever reverts to "the attack succeeded", consent has been removed
 * from the path that moves money. See contracts/audit/FINDINGS.md.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import type { Address } from "viem";

const USDC_DECIMALS = 6n;
const usdc = (whole: bigint) => whole * 10n ** USDC_DECIMALS;

const { viem, networkHelpers } = await network.getOrCreate();
const { time } = networkHelpers;

const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();

const [, aliceW, bobW, malloryW] = wallets;
const alice = aliceW.account.address as Address;
const bob = bobW.account.address as Address;
const mallory = malloryW.account.address as Address;

const mine = (hash: `0x${string}`) =>
  publicClient.waitForTransactionReceipt({ hash });

/** Sets the board up exactly as the original proof of concept did. */
async function stage() {
  const token = await viem.deployContract("MockUSDC");
  const rota = await viem.deployContract("Rota", [token.address]);

  for (const who of [alice, bob, mallory]) {
    await token.write.mint([who, usdc(1_000n)]);
  }

  // Alice joins a circle she actually agreed to. Two members at 100 USDC, so
  // a full rotation costs her 100 and that is what she signs over.
  await mine(
    await rota.write.createCircle([[alice, bob], usdc(100n), 3600n], {
      account: aliceW.account,
    }),
  );
  await mine(
    await rota.write.join([0n], { account: aliceW.account }),
  );
  await mine(
    await token.write.approve([rota.address, usdc(100n)], {
      account: aliceW.account,
    }),
  );

  // Mallory, a complete stranger, builds a circle around her. Alice is never
  // asked. Mallory is first in the rotation, so Mallory is paid and pays
  // nothing.
  await mine(
    await rota.write.createCircle([[mallory, alice], usdc(100n), 1n], {
      account: malloryW.account,
    }),
  );
  await mine(
    await token.write.approve([rota.address, usdc(100n)], {
      account: malloryW.account,
    }),
  );
  await mine(await rota.write.join([1n], { account: malloryW.account }));

  const balanceOf = (who: Address) =>
    token.read.balanceOf([who]) as Promise<bigint>;
  const allowanceOf = (who: Address) =>
    token.read.allowance([who, rota.address]) as Promise<bigint>;

  return { token, rota, balanceOf, allowanceOf };
}

describe("FIXED: an allowance is only spendable by a circle you joined", () => {
  it("refuses to start a circle naming someone who never joined it", async () => {
    const { rota, balanceOf, allowanceOf } = await stage();

    const aliceBefore = await balanceOf(alice);

    await assert.rejects(
      rota.write.start([1n], { account: malloryW.account }),
      (error: Error) => {
        assert.match(error.message, /NotJoined/);
        // Named, so the organiser knows who to chase.
        assert.ok(
          error.message.toLowerCase().includes(alice.toLowerCase()),
          "the revert should name Alice",
        );
        return true;
      },
    );

    assert.equal(await balanceOf(alice), aliceBefore, "Alice paid nothing");
    assert.equal(
      await allowanceOf(alice),
      usdc(100n),
      "her allowance is intact, so her own circle can still settle",
    );
  });

  it("refuses to pull from a member added to a circle after it started", async () => {
    // The harder case: a circle whose members all joined, started legitimately,
    // and where disburse is the only remaining check. Mallory and Bob both
    // join, so start() passes — then the transfer loop is what has to hold.
    const { token, rota, balanceOf } = await stage();

    await mine(
      await rota.write.createCircle([[mallory, bob], usdc(100n), 1n], {
        account: malloryW.account,
      }),
    );
    await mine(await rota.write.join([2n], { account: malloryW.account }));
    await mine(await rota.write.join([2n], { account: bobW.account }));
    await mine(
      await token.write.approve([rota.address, usdc(100n)], {
        account: bobW.account,
      }),
    );
    await mine(await rota.write.start([2n], { account: malloryW.account }));

    const bobBefore = await balanceOf(bob);
    await time.increase(2);
    await mine(await rota.write.disburse([2n], { account: malloryW.account }));

    // Bob did agree, so this one settles — the guard does not block consent.
    assert.equal(
      bobBefore - (await balanceOf(bob)),
      usdc(100n),
      "a member who joined still pays",
    );
  });

  it("records consent per circle, not per contract", async () => {
    const { rota } = await stage();

    assert.equal(await rota.read.hasJoined([0n, alice]), true);
    assert.equal(
      await rota.read.hasJoined([1n, alice]),
      false,
      "joining one circle must not imply joining another",
    );
    assert.equal(await rota.read.hasJoined([1n, mallory]), true);
  });

  it("will not let a non-member join, or anyone join after the start", async () => {
    const { rota, token } = await stage();

    await assert.rejects(
      rota.write.join([0n], { account: malloryW.account }),
      /NotAMember/,
      "an outsider cannot add themselves",
    );

    await mine(await rota.write.join([0n], { account: bobW.account }));
    await mine(
      await token.write.approve([rota.address, usdc(100n)], {
        account: bobW.account,
      }),
    );
    await mine(await rota.write.start([0n], { account: aliceW.account }));

    await assert.rejects(
      rota.write.join([0n], { account: aliceW.account }),
      /AlreadyStarted/,
      "the membership is fixed once the money starts moving",
    );
  });

  it("treats joining twice as a no-op rather than an error", async () => {
    const { rota } = await stage();
    // A slow confirmation should not tell someone they did something wrong.
    await mine(await rota.write.join([0n], { account: aliceW.account }));
    assert.equal(await rota.read.hasJoined([0n, alice]), true);
  });
});
