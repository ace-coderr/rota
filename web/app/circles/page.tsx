"use client";

import Link from "next/link";
import { useAccount } from "wagmi";

import { Button } from "@/components/Button";
import { ConfigNotice } from "@/components/ConfigNotice";
import { WalletBar } from "@/components/WalletBar";
import { NOTHING_CONFIGURED } from "@/lib/deployments";
import { dayInWords, everyInWords, money, whenInWords } from "@/lib/format";
import { useNames } from "@/lib/people";
import { useMyCircles, type MyCircle } from "@/lib/useMyCircles";
import { useUsdcDecimals } from "@/lib/useRota";
import { useRotaWallet } from "@/lib/wallet/useRotaWallet";

/**
 * Every circle you are in, without an invite link.
 *
 * An invite link is a good way to bring someone in and a bad way to get back:
 * it lives in whichever chat it was sent to, and a member who loses it has no
 * route to their own money beyond remembering a number. This is the route.
 *
 * Two sections, because the page is read to decide what to do next. Active is
 * the page; finished is a record, kept out of the way of it.
 *
 * Nothing here replaces /circle/[id] or the links — this is an additional
 * door, and both still open on their own. Per-circle history lives there.
 */
const LABELS: Record<MyCircle["standing"], string> = {
  "needs-join": "Needs you to join",
  "waiting-to-start": "Waiting to start",
  running: "Running",
  complete: "Complete",
};

function Row({
  circle,
  decimals,
}: {
  circle: MyCircle;
  decimals: number | undefined;
}) {
  const id = circle.id.toString();
  // Names live in this browser only, keyed per circle — the same store the
  // circle page and the invite link write to.
  const naming = useNames(id, circle.members);

  const turn = circle.recipient ? naming.nameOf(circle.recipient) : undefined;

  return (
    <Link href={`/circle/${id}`} className={`crow crow-${circle.standing}`}>
      <span className="crow-head">
        <span className="crow-tag">{LABELS[circle.standing]}</span>
        <span className="crow-id">Circle {id}</span>
      </span>

      <span className="crow-title">
        {circle.isMyTurn
          ? circle.started
            ? "It’s your turn"
            : "You’re paid first"
          : circle.started
            ? `${turn}’s turn`
            : `${turn} is paid first`}
      </span>

      <span className="crow-facts">
        {money(circle.contribution, decimals)} USDC ·{" "}
        {everyInWords(circle.period)} · {circle.members.length} people
      </span>

      <span className="crow-foot">
        <span className="crow-owes">
          {circle.isMyTurn ? (
            <>
              You receive{" "}
              <strong>{money(circle.receives, decimals)} USDC</strong>
              {circle.started ? " this round" : " when it starts"}
            </>
          ) : circle.paysNext > 0n ? (
            <>
              You pay <strong>{money(circle.paysNext, decimals)} USDC</strong>
              {circle.standing === "running" ? " this round" : " when it starts"}
            </>
          ) : (
            <span className="muted">Nothing owed</span>
          )}
        </span>

        {circle.standing === "running" && (
          <span className="crow-when">
            Next {whenInWords(circle.nextDueAt)}
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * A circle that is over.
 *
 * One line, and it is about this person rather than about the circle — the
 * amount and the schedule mattered while there was a decision to make, and a
 * finished circle has none. What is left worth saying is what it did for them.
 *
 * "due" rather than "settled": the date is derived from the schedule, not
 * observed from a receipt. See lastRoundDueAt.
 */
function DoneRow({
  circle,
  decimals,
}: {
  circle: MyCircle;
  decimals: number | undefined;
}) {
  const id = circle.id.toString();

  return (
    <Link href={`/circle/${id}`} className="crow crow-done">
      <span className="crow-done-head">
        <span className="crow-id">Circle {id}</span>
      </span>
      {/* The date rides on the end of the sentence rather than sitting
          opposite the circle number: as a second column it was a long line of
          uppercase mono shouting across a muted row, and on a narrow phone it
          took more width than the record it was annotating. */}
      <span className="crow-done-line">
        You put in <strong>{money(circle.putIn, decimals)} USDC</strong> and
        received <strong>{money(circle.received, decimals)} USDC</strong>
        {circle.endedAt > 0n && (
          <span className="crow-done-when">
            {" "}
            — last round due {dayInWords(circle.endedAt)}
          </span>
        )}
        .
      </span>
    </Link>
  );
}

export default function CirclesPage() {
  const { chainId } = useAccount();
  const wallet = useRotaWallet();
  const you = wallet.address;
  const { data: decimals } = useUsdcDecimals();

  const {
    active,
    finished,
    total,
    scanned,
    more,
    loadMore,
    isLoading,
    deployment,
  } = useMyCircles(you, chainId);

  if (NOTHING_CONFIGURED) {
    return (
      <main className="sheet">
        <h1>My circles</h1>
        <ConfigNotice />
      </main>
    );
  }

  if (!wallet.isReady) {
    return (
      <main className="sheet">
        <Link href="/" className="back">
          ← Back
        </Link>
        <h1>My circles</h1>
        <p className="lede">
          Sign in and this page lists every circle you’re in, so you never need
          to hunt for an invite link again.
        </p>
        <WalletBar reason="Sign in to see your circles." />
      </main>
    );
  }

  if (!deployment) {
    return (
      <main className="sheet">
        <h1>My circles</h1>
        <div className="notice notice-wait">
          <p className="notice-title">
            Your wallet is on a network Rota isn’t on.
          </p>
          <p className="small">Switch networks to see your circles.</p>
        </div>
      </main>
    );
  }

  const nothingAtAll = active.length === 0 && finished.length === 0;

  if (isLoading && nothingAtAll) {
    return (
      <main className="sheet sheet-list">
        <Link href="/" className="back">
          ← Back
        </Link>
        <h1>My circles</h1>
        <p className="sr-only" role="status">
          Looking through the circles on {deployment.label}.
        </p>
        <div aria-hidden="true">
          {[0, 1].map((row) => (
            <div className="crow crow-skel" key={row}>
              <span className="skel skel-text" style={{ width: "7rem" }} />
              <span
                className="skel skel-text"
                style={{ width: "12rem", marginTop: "0.75rem" }}
              />
              <span
                className="skel skel-text skel-small"
                style={{ width: "16rem" }}
              />
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="sheet sheet-list">
      <Link href="/" className="back">
        ← Back
      </Link>
      <h1>My circles</h1>

      {nothingAtAll ? (
        <p className="lede">
          You’re not in any circle yet
          {total !== undefined && total > 0
            ? ` — we looked through ${scanned === total ? `all ${total}` : `the latest ${scanned}`} on ${deployment.label}.`
            : `. There are none on ${deployment.label} yet.`}
        </p>
      ) : (
        <p className="lede">
          {active.length > 0
            ? "The ones needing you are first."
            : "Nothing needs you right now."}
        </p>
      )}

      {/* ------------------------------------------------------- active */}
      <section className="clist">
        <h2 className="clist-head">
          Active <span className="clist-count">({active.length})</span>
        </h2>

        {active.length === 0 ? (
          <div className="clist-empty">
            <p className="clist-empty-title">No active circles.</p>
            <p className="small">
              {finished.length > 0
                ? "Everything you’re in has finished. Starting another takes a minute."
                : "You choose the amount, how often it pays out, and who’s in it. Nothing is charged to set one up."}
            </p>
            <Button href="/create" size="md" block>
              Start a circle
            </Button>
          </div>
        ) : (
          <div className="crows">
            {active.map((circle) => (
              <Row
                key={circle.id.toString()}
                circle={circle}
                decimals={decimals}
              />
            ))}
          </div>
        )}
      </section>

      {/* ----------------------------------------------------- finished */}
      {/*
        Collapsible only when there is something to collapse.

        A <details> wrapping "nothing yet" is a control that hides a sentence
        saying there is nothing to hide — and it hides the one thing a new
        account came here to learn, which is what this section is for. With
        rows in it, the disclosure earns its place.

        A native <details> rather than state and a div: keyboard-operable,
        announced as expandable, and open-able before any JavaScript runs,
        none of which an onClick gets without being rebuilt from scratch.
      */}
      {finished.length === 0 ? (
        <section className="clist">
          <h2 className="clist-head">
            Finished <span className="clist-count">(0)</span>
          </h2>
          <div className="clist-empty clist-empty-quiet">
            <p className="clist-empty-title">Nothing finished yet.</p>
            <p className="small">
              A circle lands here once everyone has had their turn.
            </p>
          </div>
        </section>
      ) : (
        <details className="clist clist-done">
          <summary className="clist-head clist-summary">
            Finished <span className="clist-count">({finished.length})</span>
          </summary>
          <div className="crows crows-done">
            {finished.map((circle) => (
              <DoneRow
                key={circle.id.toString()}
                circle={circle}
                decimals={decimals}
              />
            ))}
          </div>
        </details>
      )}

      {more && (
        <p className="action-note">
          {nothingAtAll
            ? `Looked through the latest ${scanned} of ${total}.`
            : `Showing circles found in the latest ${scanned} of ${total}.`}{" "}
          <button type="button" className="text-action" onClick={loadMore}>
            Look through older ones
          </button>
        </p>
      )}

      {nothingAtAll && (
        <div className="card card-quiet">
          <h2 style={{ marginTop: 0 }}>Joining someone else’s</h2>
          <p style={{ marginBottom: 0 }}>
            You need the invite link they send you, or just the circle number —{" "}
            <Link href="/circle/0">/circle/0</Link> and so on. Once you’ve
            joined, it appears here on its own.
          </p>
        </div>
      )}

      {!nothingAtAll && active.length > 0 && (
        <>
          <hr className="divider" />
          <Button href="/create" size="md" variant="secondary" block>
            Start another circle
          </Button>
        </>
      )}
    </main>
  );
}
