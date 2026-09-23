"use client";

import Link from "next/link";
import { use, useState } from "react";
import type { Address } from "viem";
import { useAccount, useBlock, useGasPrice } from "wagmi";

import { Button } from "@/components/Button";
import { ErrorNotice } from "@/components/ErrorNotice";
import { WalletBar } from "@/components/WalletBar";
import {
  classifyTxError,
  wrongNetworkFailure,
  type TxFailure,
} from "@/lib/errors";
import {
  everyInWords,
  money,
  nameList,
  sameAddress,
  shortAddress,
  whenInWords,
} from "@/lib/format";
import {
  balanceForRound,
  feeBuffer,
  permissionForRound,
  permissionNeeded,
  walletNeeded,
} from "@/lib/money";
import { useNames, useNamesFromInvite } from "@/lib/people";
import { ROTA_ABI } from "@/lib/rota";
import { NOTHING_CONFIGURED, deploymentFor } from "@/lib/deployments";
import { ConfigNotice } from "@/components/ConfigNotice";
import { useCircle } from "@/lib/useRota";
import { useRotaWallet } from "@/lib/wallet/useRotaWallet";
import { ERC20_ABI, USDC_ADDRESS } from "@/lib/usdc";

export default function CirclePage({ params }: PageProps<"/circle/[id]">) {
  const { id } = use(params);
  const circleId = /^\d+$/.test(id) ? BigInt(id) : undefined;

  const { chainId } = useAccount();
  const { data: latestBlock } = useBlock({ watch: true });

  // One wallet interface for both kinds: a browser extension, or a Circle
  // user-controlled wallet created with Google or email. Same call, same
  // encoding, same contract — only the approval surface differs.
  const wallet = useRotaWallet();
  const address = wallet.address;
  const isConnected = wallet.isReady;
  const { data: gasPrice } = useGasPrice();

  const {
    circle,
    members,
    blockedMembers,
    rotaBlocked,
    preview,
    decimals,
    circleCount,
    refetchAll,
    isLoading,
  } = useCircle(circleId);

  // Names the organizer put in the invite link arrive in the #fragment,
  // which never reaches a server and never touches the chain.
  useNamesFromInvite(id);
  const naming = useNames(id, members);
  const [failure, setFailure] = useState<TxFailure | undefined>();
  const [pending, setPending] = useState<string | undefined>();
  const [showNames, setShowNames] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const deployment = deploymentFor(chainId);
  const ROTA_ADDRESS = deployment?.rota;
  const networkFailure =
    isConnected && !deployment
      ? wrongNetworkFailure(chainId, -1)
      : undefined;

  // ----------------------------------------------------------------- derived

  const memberCount = members?.length ?? 0;
  const cycleIndex = circle?.cycleIndex ?? 0;
  const finished = Boolean(circle && memberCount > 0 && cycleIndex >= memberCount);
  const started = Boolean(circle?.started);
  const recipient = members && !finished ? members[cycleIndex] : undefined;

  const myIndex = members?.findIndex((m) => sameAddress(m, address)) ?? -1;
  const isMember = myIndex >= 0;
  const myTurn = sameAddress(recipient, address);

  const buffer = feeBuffer(gasPrice);
  const contribution = circle?.contribution ?? 0n;
  // What the person whose turn it is receives: everyone else's share.
  // Not a pot — nothing is ever pooled.
  const payout = contribution * BigInt(Math.max(0, memberCount - 1));

  /**
   * The group view asks only what the contract asks: would THIS round fail
   * because of this person? Judging everyone against their whole remaining
   * obligation would flag people the contract would settle with, and would put
   * one member's future finances in front of the rest of the circle.
   */
  const permissionForNext = (index: number) =>
    permissionForRound(contribution, index, cycleIndex, memberCount, started);
  const balanceForNext = (index: number) =>
    balanceForRound(contribution, index, cycleIndex);

  /**
   * The whole-circle figure, with the network charge folded in. Shown only to
   * the connected person, about themselves — never about anyone else.
   */
  const myTotalToFinish = (index: number) =>
    walletNeeded(contribution, index, cycleIndex, memberCount, buffer);
  const myPermissionToFinish = (index: number) =>
    permissionNeeded(contribution, index, cycleIndex, memberCount);

  type Standing = {
    member: Address;
    index: number;
    name: string;
    balance: bigint;
    hasJoined: boolean;
    hasEnough: boolean;
    /** Granted zero while they still owe: they have withdrawn, not fallen short. */
    stopped: boolean;
    blocked: boolean;
    ready: boolean;
    needed: bigint;
  };

  const standings: Standing[] = (preview ?? []).map((status, index) => {
    const needed = balanceForNext(index);
    const permission = permissionForNext(index);
    const blocked = blockedMembers.some((b) => sameAddress(b, status.member));
    /*
     * Joining is one thing a person does and two transactions underneath:
     * approve on USDC, then join on Rota. Either half missing means they have
     * not finished, so the circle should still be waiting for them.
     */
    const hasJoined = status.joined && status.allowance >= permission;
    const hasEnough = status.balance >= needed;

    /**
     * Withdrawing is not the same as running low, and the circle should not
     * describe it as if it were.
     *
     * start() required a full rotation's permission from everyone, so once a
     * circle is running a member at exactly zero while they still owe has
     * taken their permission back. Before it starts, zero just means they have
     * not joined yet.
     */
    const stopped =
      started && !finished && permission > 0n && status.allowance === 0n;

    return {
      member: status.member,
      index,
      name: naming.nameOf(status.member),
      balance: status.balance,
      hasJoined,
      hasEnough,
      stopped,
      blocked,
      ready: hasJoined && hasEnough && !blocked,
      needed,
    };
  });

  // Anyone the next round depends on: they either owe this round, or the
  // circle has not started and start() will check their permission.
  const owing = standings.filter(
    (s) => s.needed > 0n || permissionForNext(s.index) > 0n,
  );
  const stopped = owing.filter((s) => s.stopped && !s.blocked);
  const notJoined = owing.filter(
    (s) => !s.hasJoined && !s.stopped && !s.blocked,
  );
  const notFunded = owing.filter((s) => s.hasJoined && !s.hasEnough && !s.blocked);
  const everyoneReady =
    preview !== undefined && owing.every((s) => s.ready) && !rotaBlocked;

  const mine = myIndex >= 0 ? standings[myIndex] : undefined;
  // Mine alone: the whole-circle total, and the permission that covers it.
  const myTotal = isMember ? myTotalToFinish(myIndex) : 0n;
  const iOwe = isMember ? myPermissionToFinish(myIndex) : 0n;
  const myRoundNeed = isMember ? balanceForNext(myIndex) : 0n;
  const shortThisRound = Boolean(mine && !mine.hasEnough);

  // I have had my turn, and the circle is still running: leaving now takes
  // from the people whose turn has not come.
  const alreadyPaid = Boolean(started && !finished && isMember && myIndex < cycleIndex);
  const stillWaiting = standings.filter(
    (s) => s.index >= cycleIndex && s.index !== myIndex,
  );

  const chainNow = latestBlock?.timestamp;
  const due = Boolean(
    started && chainNow !== undefined && circle && chainNow >= circle.nextDueAt,
  );

  const busy = pending !== undefined;

  async function run(
    label: string,
    ...calls: Parameters<typeof wallet.send>[0][]
  ) {
    setFailure(undefined);
    if (networkFailure) {
      setFailure(networkFailure);
      return;
    }

    setPending(label);
    try {
      /*
       * In order, and stopping at the first failure. Joining is an approve on
       * USDC followed by a join on Rota; sending the join after a failed
       * approve would record consent for a circle that cannot collect, which
       * reads to everyone else as ready when it is not.
       */
      for (const call of calls) {
        await wallet.send(call, deployment!.chain.id);
      }
      await refetchAll();
    } catch (error) {
      setFailure(
        classifyTxError(error, {
          shortNames: [...notJoined, ...notFunded].map((s) => s.name),
          nameOf: naming.nameOf,
        }),
      );
    } finally {
      setPending(undefined);
    }
  }

  /**
   * What the valid circle numbers actually are.
   *
   * IDs are zero-based, so four circles are numbered 0 to 3 and /circle/4 is
   * the obvious mistake — off by exactly one from the count. A bare "not
   * found" leaves someone guessing whether they mistyped, whether the circle
   * was deleted, or whether they are on the wrong network.
   */
  const knownRange = (() => {
    if (circleCount === undefined) return undefined;
    const count = Number(circleCount);
    const where = deployment?.label ?? "this network";
    if (count === 0) return `No circles have been created on ${where} yet.`;
    if (count === 1) return `There is 1 circle on ${where}, numbered 0.`;
    return `There are ${count} circles on ${where}, numbered 0 to ${count - 1}.`;
  })();

  // ------------------------------------------------------------- early exits

  if (!ROTA_ADDRESS || circleId === undefined) {
    return (
      <main className="sheet">
        <Link href="/" className="back">
          ← Back
        </Link>
        {circleId === undefined ? (
          <>
            <h1>Circle not found</h1>
            <p>
              &ldquo;{id}&rdquo; isn&rsquo;t a circle number.{" "}
              {knownRange ?? "Check the number you were given and try again."}
            </p>
          </>
        ) : NOTHING_CONFIGURED ? (
          <>
            <h1>Not available</h1>
            <ConfigNotice />
          </>
        ) : (
          <>
            <h1>Wrong network</h1>
            <div className="notice notice-wait">
              <p className="notice-title">
                Your wallet is on a network Rota isn&rsquo;t on.
              </p>
              <p className="small">Switch networks to see this circle.</p>
            </div>
            <WalletBar />
          </>
        )}
      </main>
    );
  }

  // Narrowed once, so the callbacks below do not each have to re-prove it.
  const rota: Address = ROTA_ADDRESS;

  if (isLoading && !circle) {
    return (
      <main className="sheet">
        <h1>Circle {id}</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (circle && memberCount === 0) {
    return (
      <main className="sheet">
        <Link href="/" className="back">
          ← Back
        </Link>
        <h1>Circle not found</h1>
        <p>
          Circle {id} doesn&rsquo;t exist yet.{" "}
          {knownRange ?? "Check the number you were given."}
        </p>
      </main>
    );
  }

  // ----------------------------------------------------------------- people

  const peopleList = (
    <>
      <h2>Everyone in this circle</h2>
      <div className="card">
        {standings.map((s) => (
          <div className="person" key={s.member}>
            <span className="person-turn">{s.index + 1}.</span>
            <span>
              <span className="person-name">
                {s.name}
                {sameAddress(s.member, address) && " (you)"}
              </span>
              <br />
              <span className="address">{shortAddress(s.member)}</span>
            </span>
            <span className="person-status">
              {s.blocked ? (
                <span className="tag-short">On hold</span>
              ) : s.stopped ? (
                // Withdrawn, not short. Different problem, different remedy.
                <span className="tag-short">Stopped paying</span>
              ) : s.index < cycleIndex ? (
                <span className="tag-paid">Paid</span>
              ) : s.index === cycleIndex && started ? (
                <span className="tag-now">Their turn</span>
              ) : !s.hasJoined ? (
                <span className="tag-short">Not joined</span>
              ) : !s.hasEnough ? (
                <span className="tag-short">Short</span>
              ) : (
                <span className="muted">Ready</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="text-action"
        onClick={() => setShowNames((v) => !v)}
      >
        {showNames ? "Done adding names" : "Add names for these people"}
      </button>

      {showNames && (
        <div className="card card-quiet" style={{ marginTop: "1rem" }}>
          <p className="small muted">
            Names are kept on this device only, so you see people instead of
            addresses.
          </p>
          {standings.map((s) => (
            <div className="field" key={s.member} style={{ marginBottom: "1rem" }}>
              <label htmlFor={`name-${s.member}`}>
                Person {s.index + 1} — {shortAddress(s.member)}
              </label>
              <input
                id={`name-${s.member}`}
                defaultValue={naming.isCustom(s.member) ? s.name : ""}
                placeholder="Their name"
                onBlur={(e) => naming.setName(s.member, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );

  // --------------------------------------------------------------- finished
  // A finished circle is a receipt, not a checklist. No readiness anywhere.

  if (finished) {
    return (
      <main className="sheet">
        <Link href="/" className="back">
          ← Back
        </Link>
        <h1>This circle is finished</h1>
        <p className="lede">
          Everyone has had their turn. Nothing is owed and nothing is
          outstanding.
        </p>

        <div className="card">
          <dl className="rows" style={{ borderTop: "none" }}>
            <div className="row" style={{ paddingTop: 0 }}>
              <dt>People</dt>
              <dd>{memberCount}</dd>
            </div>
            <div className="row">
              <dt>Each person put in</dt>
              <dd>{money(contribution, decimals)} USDC a round</dd>
            </div>
            <div className="row" style={{ borderBottom: "none" }}>
              <dt>Each person received</dt>
              <dd>{money(payout, decimals)} USDC</dd>
            </div>
          </dl>
        </div>

        {peopleList}

        <hr className="divider" />
        <Button href={`/proof/${id}`} size="lg" variant="secondary" block>
          See the full record
        </Button>
      </main>
    );
  }

  // ------------------------------------------- the single action per screen

  let action: React.ReactNode = null;
  let actionNote: React.ReactNode = null;

  if (isConnected && !rotaBlocked) {
    if (isMember && mine && !mine.hasJoined) {
      action = (
        <Button
          size="lg"
          block
          disabled={busy}
          onClick={() =>
            run(
              "join",
              {
                address: USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [rota, iOwe],
              },
              {
                address: rota,
                abi: ROTA_ABI,
                functionName: "join",
                args: [circleId],
              },
            )
          }
        >
          {pending === "join" ? "Joining…" : "Join this circle"}
        </Button>
      );
      actionNote = (
        <>
          Two confirmations: one giving permission for your share, one saying
          you are in this circle. Your money stays in your wallet until your
          turn comes round.
        </>
      );
    } else if (!started && everyoneReady && isMember) {
      action = (
        <Button
          size="lg"
          block
          disabled={busy}
          onClick={() =>
            run("start", {
              address: rota,
              abi: ROTA_ABI,
              functionName: "start",
              args: [circleId],
            })
          }
        >
          {pending === "start" ? "Starting…" : "Start the circle"}
        </Button>
      );
      actionNote = (
        <>
          Everyone has joined. The first payment goes to{" "}
          {standings[0]?.name ?? "the first person"}.
        </>
      );
    } else if (started && due && everyoneReady) {
      action = (
        <Button
          size="lg"
          block
          disabled={busy}
          onClick={() =>
            run("pay", {
              address: rota,
              abi: ROTA_ABI,
              functionName: "disburse",
              args: [circleId],
            })
          }
        >
          {pending === "pay"
            ? "Sending…"
            : `Send ${standings[cycleIndex]?.name ?? "this turn"}'s payment`}
        </Button>
      );
      actionNote = (
        <>
          Everyone&rsquo;s share goes straight to{" "}
          {standings[cycleIndex]?.name ?? "them"}. Anyone in the circle can do
          this.
        </>
      );
    }
  }

  return (
    <main className="sheet">
      <Link href="/" className="back">
        ← Back
      </Link>

      <h1>
        {started
          ? `${standings[cycleIndex]?.name ?? "Someone"}'s turn`
          : `Circle ${id}`}
      </h1>
      <p className="lede">
        {money(contribution, decimals)} USDC each, {everyInWords(circle?.period)}
        {memberCount ? `, ${memberCount} people` : ""}.
      </p>

      <WalletBar />

      {rotaBlocked && (
        <div className="notice notice-stop">
          <p className="notice-title">This circle is on hold.</p>
          <p className="small">
            USDC has placed a hold on Rota itself, so no circle can pay anyone
            at the moment. Everyone&rsquo;s money is untouched and stays in
            their own wallet. Please contact support.
          </p>
        </div>
      )}

      {blockedMembers.length > 0 && !rotaBlocked && (
        <div className="notice notice-stop">
          <p className="notice-title">
            {nameList(blockedMembers.map((m) => naming.nameOf(m)))}{" "}
            {blockedMembers.length === 1 ? "is" : "are"} on hold.
          </p>
          <p className="small">
            USDC has placed a hold on{" "}
            {blockedMembers.length === 1 ? "that wallet" : "those wallets"}, so
            the circle can&rsquo;t pay out for now. This isn&rsquo;t about money
            running low, and nobody has been charged.
          </p>
        </div>
      )}

      {isConnected && isMember && myTotal > 0n && (
        <div className="card">
          <p className="small muted" style={{ marginBottom: "0.25rem" }}>
            To finish the circle you&rsquo;ll need
          </p>
          <p className="hero-figure">
            {money(myTotal, decimals)}{" "}
            <span className="hero-unit">USDC in total</span>
          </p>
          <p className="small muted" style={{ margin: "0.5rem 0 0" }}>
            That covers every round you still owe, including the small network
            charge. You have {money(mine?.balance, decimals)} USDC today.
          </p>
        </div>
      )}

      {isConnected && isMember && shortThisRound && (
        <div className="notice notice-wait">
          <p className="notice-title">
            You&rsquo;re short for this round.
          </p>
          <p className="small">
            Top up to at least {money(myRoundNeed, decimals)} USDC before the
            next turn, or the circle can&rsquo;t pay{" "}
            {standings[cycleIndex]?.name ?? "the next person"}.
          </p>
        </div>
      )}

      {isConnected && isMember && myTurn && started && (
        <div className="notice notice-calm">
          <p className="notice-title">It&rsquo;s your turn.</p>
          <p className="small">
            You receive {money(payout, decimals)} USDC this round, and you
            don&rsquo;t pay in.
          </p>
        </div>
      )}

      {isConnected && !isMember && (
        <div className="notice notice-wait">
          <p className="notice-title">You&rsquo;re not in this circle.</p>
          <p className="small">
            You can follow along, but only the people listed can take part.
          </p>
        </div>
      )}

      {started && !due && !rotaBlocked && (
        <div className="notice notice-wait">
          <p className="notice-title">
            Next turn: {whenInWords(circle?.nextDueAt)}
          </p>
          <p className="small">
            {standings[cycleIndex]?.name ?? "The next person"} receives{" "}
            {money(payout, decimals)} USDC then. There&rsquo;s nothing to do until
            then.
          </p>
        </div>
      )}

      {!rotaBlocked && stopped.length > 0 && (
        <div className="notice notice-stop">
          <p className="notice-title">
            {stopped.length === 1
              ? `${stopped[0].name} has stopped paying.`
              : `${stopped.length} people have stopped paying.`}
          </p>
          <p className="small">
            {stopped.length > 1 && <>{nameList(stopped.map((s) => s.name))}. </>}
            {stopped.length === 1 ? "They have" : "They have"} withdrawn
            permission for Rota to move their money, so the circle can&rsquo;t
            settle another round. This isn&rsquo;t the same as running low —
            adding funds won&rsquo;t fix it. Nobody has been charged.
          </p>
        </div>
      )}

      {!rotaBlocked && notJoined.length > 0 && (
        <div className="notice notice-wait">
          <p className="notice-title">
            {notJoined.length === 1
              ? `Waiting for ${notJoined[0].name} to join.`
              : `Waiting for ${notJoined.length} people to join.`}
          </p>
          {notJoined.length > 1 && (
            <p className="small">{nameList(notJoined.map((s) => s.name))}.</p>
          )}
          <p className="small">
            The circle can&rsquo;t pay anyone until everyone has joined. Nobody
            has been charged.
          </p>
        </div>
      )}

      {!rotaBlocked && notFunded.length > 0 && (
        <div className="notice notice-wait">
          <p className="notice-title">
            {notFunded.length === 1
              ? `${notFunded[0].name} hasn't got enough in their wallet yet.`
              : `${notFunded.length} people haven't got enough in their wallet yet.`}
          </p>
          <p className="small">
            {notFunded.length > 1 && (
              <>{nameList(notFunded.map((s) => s.name))}. </>
            )}
            This round needs {money(contribution, decimals)} USDC from each
            person paying in. Once that&rsquo;s there, the circle carries on.
          </p>
        </div>
      )}

      <ErrorNotice failure={failure ?? networkFailure} />

      {action && (
        <div style={{ margin: "2rem 0" }}>
          {action}
          {actionNote && <p className="action-note">{actionNote}</p>}
        </div>
      )}

      {peopleList}

      {/*
        The way out. Setting the allowance to zero withdraws Rota's permission
        entirely — no money moves, and nothing can move afterwards. Plainly
        labelled, because "revoke your allowance" means nothing to most people.
      */}
      {isConnected && isMember && mine?.hasJoined && (
        <>
          <hr className="divider" />
          <h2>Leave this circle</h2>
          <p>
            This withdraws Rota&rsquo;s permission to move your money. Your
            money is not touched — it stays where it is. Nothing further can be
            taken for this circle unless you join again.
          </p>

          {/*
            Leaving before your turn costs you your place. Leaving after it
            costs other people their money, so that case is not a single tap:
            it says who is still owed, by name, and asks again.
          */}
          {alreadyPaid && !confirmLeave ? (
            <>
              <Button
                size="md"
                variant="secondary"
                block
                disabled={busy}
                onClick={() => setConfirmLeave(true)}
              >
                Stop Rota from moving your money
              </Button>
              <p className="action-note">
                You&rsquo;ve already received everyone&rsquo;s share.
              </p>
            </>
          ) : alreadyPaid ? (
            <div className="notice notice-stop">
              <p className="notice-title">
                You&rsquo;ve already received everyone&rsquo;s share.
              </p>
              <p>
                If you leave now,{" "}
                {stillWaiting.length > 0
                  ? `${nameList(stillWaiting.map((p) => p.name))} won’t get theirs.`
                  : "the people still waiting won’t get theirs."}{" "}
                The circle can&rsquo;t settle another round without you.
              </p>
              <Button
                size="md"
                variant="secondary"
                block
                disabled={busy}
                onClick={() =>
                  run("leave", {
                    address: USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: "approve",
                    args: [rota, 0n],
                  })
                }
              >
                {pending === "leave"
                  ? "Stopping…"
                  : "Leave anyway, and stop my payments"}
              </Button>
              <Button
                size="md"
                block
                disabled={busy}
                onClick={() => setConfirmLeave(false)}
              >
                Stay in the circle
              </Button>
            </div>
          ) : (
            <>
              <Button
                size="md"
                variant="secondary"
                block
                disabled={busy}
                onClick={() =>
                  run("leave", {
                    address: USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: "approve",
                    args: [rota, 0n],
                  })
                }
              >
                {pending === "leave"
                  ? "Stopping…"
                  : "Stop Rota from moving your money"}
              </Button>
              <p className="action-note">
                The others will see that you have left, and the circle
                can&rsquo;t settle another round until you rejoin or they
                remove you.
              </p>
            </>
          )}
        </>
      )}

      <hr className="divider" />
      <Button href={`/proof/${id}`} size="md" variant="secondary" block>
        See the full record
      </Button>
      <p className="action-note">
        Anyone can check this circle without signing in.
      </p>
    </main>
  );
}
