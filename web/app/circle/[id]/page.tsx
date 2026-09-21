"use client";

import Link from "next/link";
import { use, useState } from "react";
import type { Address } from "viem";
import {
  useAccount,
  useBlock,
  useGasPrice,
  usePublicClient,
  useWriteContract,
} from "wagmi";

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
import { feeBuffer, permissionNeeded, walletNeeded } from "@/lib/money";
import { useNames } from "@/lib/people";
import { ROTA_ABI, ROTA_ADDRESS } from "@/lib/rota";
import { useCircle } from "@/lib/useRota";
import { ERC20_ABI, USDC_ADDRESS } from "@/lib/usdc";
import { EXPECTED_CHAIN_ID } from "@/lib/wagmi";

export default function CirclePage({ params }: PageProps<"/circle/[id]">) {
  const { id } = use(params);
  const circleId = /^\d+$/.test(id) ? BigInt(id) : undefined;

  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: latestBlock } = useBlock({ watch: true });
  const { data: gasPrice } = useGasPrice();

  const {
    circle,
    members,
    blockedMembers,
    rotaBlocked,
    preview,
    decimals,
    refetchAll,
    isLoading,
  } = useCircle(circleId);

  const naming = useNames(id, members);
  const [failure, setFailure] = useState<TxFailure | undefined>();
  const [pending, setPending] = useState<string | undefined>();
  const [showNames, setShowNames] = useState(false);

  const networkFailure = wrongNetworkFailure(chainId, EXPECTED_CHAIN_ID);

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
  const pot = contribution * BigInt(Math.max(0, memberCount - 1));

  /**
   * One figure per person: everything they still owe across the rest of the
   * circle, with the network charge already folded in. On Arc both come out of
   * the same balance, so they are never shown separately — and readiness is
   * judged against this combined figure, not against the share alone.
   */
  const needFor = (index: number) =>
    walletNeeded(contribution, index, cycleIndex, memberCount, buffer);
  const permissionFor = (index: number) =>
    permissionNeeded(contribution, index, cycleIndex, memberCount);

  type Standing = {
    member: Address;
    index: number;
    name: string;
    balance: bigint;
    hasJoined: boolean;
    hasEnough: boolean;
    blocked: boolean;
    ready: boolean;
    needed: bigint;
  };

  const standings: Standing[] = (preview ?? []).map((status, index) => {
    const needed = needFor(index);
    const blocked = blockedMembers.some((b) => sameAddress(b, status.member));
    const hasJoined = status.allowance >= permissionFor(index);
    const hasEnough = status.balance >= needed;
    return {
      member: status.member,
      index,
      name: naming.nameOf(status.member),
      balance: status.balance,
      hasJoined,
      hasEnough,
      blocked,
      ready: hasJoined && hasEnough && !blocked,
      needed,
    };
  });

  const owing = standings.filter((s) => s.needed > 0n);
  const notJoined = owing.filter((s) => !s.hasJoined && !s.blocked);
  const notFunded = owing.filter((s) => s.hasJoined && !s.hasEnough && !s.blocked);
  const everyoneReady =
    preview !== undefined && owing.every((s) => s.ready) && !rotaBlocked;

  const mine = myIndex >= 0 ? standings[myIndex] : undefined;
  const iNeed = isMember ? needFor(myIndex) : 0n;
  const iOwe = isMember ? permissionFor(myIndex) : 0n;

  const chainNow = latestBlock?.timestamp;
  const due = Boolean(
    started && chainNow !== undefined && circle && chainNow >= circle.nextDueAt,
  );

  const busy = pending !== undefined;

  async function run(label: string, send: () => Promise<`0x${string}`>) {
    setFailure(undefined);
    if (networkFailure) {
      setFailure(networkFailure);
      return;
    }

    setPending(label);
    try {
      const hash = await send();
      await publicClient!.waitForTransactionReceipt({ hash });
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

  // ------------------------------------------------------------- early exits

  if (!ROTA_ADDRESS || circleId === undefined) {
    return (
      <main>
        <Link href="/" className="back">
          ← Back
        </Link>
        <h1>Circle not found</h1>
        <p>Check the number you were given and try again.</p>
      </main>
    );
  }

  // Narrowed once, so the callbacks below do not each have to re-prove it.
  const rota: Address = ROTA_ADDRESS;

  if (isLoading && !circle) {
    return (
      <main>
        <h1>Circle {id}</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (circle && memberCount === 0) {
    return (
      <main>
        <Link href="/" className="back">
          ← Back
        </Link>
        <h1>Circle not found</h1>
        <p>There&rsquo;s no circle number {id}. Check the number you were given.</p>
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
              {s.index < cycleIndex ? (
                <span className="tag-paid">Paid</span>
              ) : s.index === cycleIndex && started ? (
                <span className="tag-now">Their turn</span>
              ) : s.blocked ? (
                <span className="tag-short">On hold</span>
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
        className="btn-link"
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
      <main>
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
              <dd>{money(pot, decimals)} USDC</dd>
            </div>
          </dl>
        </div>

        {peopleList}

        <hr className="divider" />
        <Link
          href={`/proof/${id}`}
          className="btn btn-secondary"
          style={{ textDecoration: "none" }}
        >
          See the full record
        </Link>
      </main>
    );
  }

  // ------------------------------------------- the single action per screen

  let action: React.ReactNode = null;
  let actionNote: React.ReactNode = null;

  if (isConnected && !rotaBlocked) {
    if (isMember && mine && !mine.hasJoined) {
      action = (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            run("join", () =>
              writeContractAsync({
                address: USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [rota, iOwe],
              }),
            )
          }
        >
          {pending === "join" ? "Joining…" : "Join this circle"}
        </button>
      );
      actionNote = (
        <>
          This lets Rota move your share to each person on their turn. Your
          money stays in your wallet until then.
        </>
      );
    } else if (!started && everyoneReady && isMember) {
      action = (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            run("start", () =>
              writeContractAsync({
                address: rota,
                abi: ROTA_ABI,
                functionName: "start",
                args: [circleId],
              }),
            )
          }
        >
          {pending === "start" ? "Starting…" : "Start the circle"}
        </button>
      );
      actionNote = (
        <>
          Everyone has joined. The first payment goes to{" "}
          {standings[0]?.name ?? "the first person"}.
        </>
      );
    } else if (started && due && everyoneReady) {
      action = (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            run("pay", () =>
              writeContractAsync({
                address: rota,
                abi: ROTA_ABI,
                functionName: "disburse",
                args: [circleId],
              }),
            )
          }
        >
          {pending === "pay"
            ? "Sending…"
            : `Send ${standings[cycleIndex]?.name ?? "this turn"}'s payment`}
        </button>
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
    <main>
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

      {isConnected && isMember && iNeed > 0n && (
        <div className="card">
          <p className="small muted" style={{ marginBottom: "0.25rem" }}>
            {mine?.hasEnough
              ? "You're covered for the rest of the circle"
              : "You need in your wallet"}
          </p>
          <p className="hero-figure">
            {money(iNeed, decimals)}
            <span className="hero-unit">USDC</span>
          </p>
          <p className="small muted" style={{ margin: "0.5rem 0 0" }}>
            You have {money(mine?.balance, decimals)} USDC. That figure covers
            every round you still owe, including the small network charge.
          </p>
        </div>
      )}

      {isConnected && isMember && myTurn && started && (
        <div className="notice notice-calm">
          <p className="notice-title">It&rsquo;s your turn.</p>
          <p className="small">
            You receive {money(pot, decimals)} USDC this round, and you
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
            {money(pot, decimals)} USDC then. There&rsquo;s nothing to do until
            then.
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
          {notFunded.length === 1 ? (
            <p className="small">
              {notFunded[0].name} needs {money(notFunded[0].needed, decimals)}{" "}
              USDC and has {money(notFunded[0].balance, decimals)} USDC.
            </p>
          ) : (
            <p className="small">
              {nameList(notFunded.map((s) => s.name))}. Each needs{" "}
              {money(notFunded[0].needed, decimals)} USDC. They&rsquo;re marked
              below.
            </p>
          )}
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

      <hr className="divider" />
      <Link
        href={`/proof/${id}`}
        className="btn btn-secondary"
        style={{ textDecoration: "none" }}
      >
        See the full record
      </Link>
      <p className="action-note">
        Anyone can check this circle without signing in.
      </p>
    </main>
  );
}
