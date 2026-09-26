"use client";

import Link from "next/link";
import { use } from "react";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { NOTHING_CONFIGURED, deploymentFor } from "@/lib/deployments";
import { ConfigNotice } from "@/components/ConfigNotice";
import { CountUp } from "@/components/Reveal";
import { TurnRing } from "@/components/TurnRing";
import { addressUrl, txUrl } from "@/lib/explorer";
import { dateInWords, money, shortAddress } from "@/lib/format";
import {
  triggeredBy,
  turnsFromState,
  useDisbursementLinks,
  withLinks,
} from "@/lib/history";
import { useRelayer } from "@/lib/useRelayer";
import { useNames, useNamesFromInvite } from "@/lib/people";
import { ROTA_ABI } from "@/lib/rota";
import { ERC20_ABI, USDC_ADDRESS } from "@/lib/usdc";

/**
 * Public and wallet-free. Everything here is read straight from the chain, so
 * anyone can check a circle without an account and without trusting this site.
 *
 * Nothing on this page depends on an event scan. The balance and the rotation
 * come from contract state, which costs a fixed number of calls and works on
 * the public RPC with no key. Transaction links are decoration, fetched
 * separately and allowed to fail.
 */
export default function ProofPage({ params }: PageProps<"/proof/[id]">) {
  const { id } = use(params);
  const circleId = /^\d+$/.test(id) ? BigInt(id) : undefined;

  const { chainId } = useAccount();
  const deployment = deploymentFor(chainId);
  const chain = deployment?.chain.id;
  const explorer = deployment?.explorer ?? "";

  /**
   * The headline number, on its own so nothing else can take it down with it.
   * Two calls, no range, no key.
   */
  const balance = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "decimals", chainId: chain },
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [deployment?.rota as Address],
        chainId: chain,
      },
    ],
    query: { enabled: Boolean(deployment) },
  });

  const [decimals, rotaBalance] = balance.data ?? [];

  /** The rotation itself, also from state. */
  const circleReads = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: deployment?.rota,
        abi: ROTA_ABI,
        functionName: "getMembers",
        args: [circleId!],
        chainId: chain,
      },
      {
        address: deployment?.rota,
        abi: ROTA_ABI,
        functionName: "getCircle",
        args: [circleId!],
        chainId: chain,
      },
    ],
    query: { enabled: Boolean(deployment) && circleId !== undefined },
  });

  const [members, circle] = circleReads.data ?? [];
  const memberList = (members as Address[] | undefined) ?? [];
  useNamesFromInvite(id);
  const naming = useNames(id, memberList);
  // Only so a round paid by the scheduler can say so by name rather than
  // by address. Nothing on this page depends on it resolving.
  const { data: relayer } = useRelayer();

  const contribution = circle ? (circle[0] as bigint) : 0n;
  const period = circle ? (circle[1] as bigint) : 0n;
  const nextDueAt = circle ? (circle[2] as bigint) : 0n;
  const cycleIndex = circle ? Number(circle[3]) : 0;
  const started = circle ? Boolean(circle[4]) : false;

  // Primary history: derived from state, so it is always available.
  const turns = turnsFromState(memberList, cycleIndex, contribution);

  // Secondary: transaction links, looked up at each turn's due time rather
  // than swept for from the deploy block.
  const links = useDisbursementLinks(
    deployment,
    circleId,
    turns,
    circle ? { period, nextDueAt, cycleIndex } : undefined,
  );
  const rows = withLinks(turns, links.data);

  /*
   * What one person would have been holding.
   *
   * Every other savings circle has a pot: each round, one person collects
   * everyone ELSE'S share and holds it until they hand it over. So the pot is
   * the contribution times one fewer than the members — the same figure the
   * rest of the app calls the payout, because it is the same money. Counting
   * down from members x contribution would name a larger pot than this circle
   * has ever moved, and the number the page exists to make trustworthy is not
   * the place to round up.
   *
   * The figure it LANDS on is always the balance read from the chain. The
   * count is a way of showing what the zero means, not a way of arriving at
   * it: if the animation never runs, or the reader has asked for less motion,
   * the real number is on screen from the first paint.
   */
  const pot =
    decimals !== undefined && contribution > 0n && memberList.length > 1
      ? Number(contribution * BigInt(memberList.length - 1)) /
        10 ** (decimals as number)
      : undefined;

  const holding =
    rotaBalance !== undefined && decimals !== undefined
      ? Number(rotaBalance as bigint) / 10 ** (decimals as number)
      : undefined;

  if (!deployment) {
    return (
      <main className="sheet">
        <h1>Record unavailable</h1>
        {NOTHING_CONFIGURED ? (
          <ConfigNotice />
        ) : (
          <div className="notice notice-wait">
            <p className="notice-title">
              Your wallet is on a network Rota isn&rsquo;t on.
            </p>
            <p className="small">
              Switch networks, or sign out to see the public record.
            </p>
          </div>
        )}
      </main>
    );
  }

  return (
    <>
      <header className="hero grain" style={{ paddingTop: "6.5rem" }}>
        <div className="band-inner">
          <Link href={`/circle/${id}`} className="back" style={{ color: "var(--on-dark)" }}>
            ← Back to the circle
          </Link>
          <span className="label label-rule">
            Rota is holding / circle {id} / {deployment.label}
          </span>
          <p className="figure">
            {balance.isLoading || holding === undefined ? (
              "\u2014"
            ) : (
              <CountUp value={holding} from={pot ?? 0} duration={2200} />
            )}{" "}
            <span className="figure-unit">USDC</span>
          </p>
          {pot !== undefined && (
            <p className="figure-note">
              That counts down from{" "}
              {pot.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              USDC — the pot one person would be holding if this circle worked
              the way the others do. It lands on nothing because there is no
              pot.
            </p>
          )}
        </div>
      </header>

      <section className="band band-blue">
        <div className="band-inner">
          <p className="lede" style={{ marginBottom: 0, fontWeight: 600 }}>
            Rota never holds anyone&rsquo;s savings. Each person&rsquo;s share
            goes straight from their wallet to whoever&rsquo;s turn it is, so
            this number stays at zero — and anyone can check it, at any time,
            without taking our word for it.
          </p>
          <p style={{ marginTop: "1.5rem", marginBottom: 0 }}>
            <a
              href={addressUrl(explorer, deployment.rota)}
              target="_blank"
              rel="noreferrer"
            >
              Check it on the explorer
            </a>
          </p>
        </div>
      </section>

      <section className="band band-cream">
        <div className="band-inner">
          <span className="label label-rule">01 / Who&rsquo;s in this circle</span>
      {circleReads.isLoading ? (
        <p className="muted">Loading…</p>
      ) : memberList.length === 0 ? (
        <p className="muted">There&rsquo;s no circle number {id}.</p>
      ) : (
        <div className="card">
          {memberList.map((member, index) => (
            <div className="person" key={member}>
              <span className="person-turn">{index + 1}.</span>
              <span>
                <span className="person-name">{naming.nameOf(member)}</span>
                <br />
                <a
                  className="address"
                  href={addressUrl(explorer, member)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(member)}
                </a>
              </span>
              <span className="person-status">
                {index < cycleIndex ? (
                  <span className="tag-paid">Paid</span>
                ) : (
                  <span className="muted">Waiting</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

        </div>
      </section>

      <section className="band band-dark grain">
        <div className="band-inner">
          <span className="label label-rule">02 / What&rsquo;s happened so far</span>

      {memberList.length > 0 && rows.length === 0 && (
        <p className="muted">
          {started
            ? "Nobody has been paid yet. The record will appear here as each turn happens."
            : "This circle hasn’t started yet."}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <ol className="timeline">
            {rows.map((turn) => (
              <li className="turn" key={turn.index}>
                {/* The ring as it stood that round: same circle, solid dot one
                    seat further on. Six turns read as six drawings. */}
                <span className="turn-mark">
                  <TurnRing seats={memberList.length} active={turn.index} />
                  <span className="turn-n">{turn.index + 1}</span>
                </span>
                <span className="turn-body">
                  <span className="person-name">
                    {naming.nameOf(turn.recipient)} received{" "}
                    {money(turn.amount, decimals as number | undefined)} USDC
                  </span>
                  <br />
                  <span className="person-detail">
                    {(() => {
                      const who = triggeredBy(
                        turn.by,
                        relayer?.configured ? relayer.address : undefined,
                        memberList,
                        naming.nameOf,
                      );
                      return who ? <>Sent by {who} · </> : null;
                    })()}
                    {turn.hash ? (
                      <>
                        {turn.timestamp && `${dateInWords(turn.timestamp)} · `}
                        <a
                          href={txUrl(explorer, turn.hash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          See the record
                        </a>
                      </>
                    ) : links.isLoading ? (
                      "Looking up the transaction…"
                    ) : (
                      // This turn alone could not be located. The turn itself
                      // is not in doubt — it comes from contract state.
                      <a
                        href={addressUrl(explorer, deployment.rota)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Find it on the explorer
                      </a>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ol>

        </>
      )}
        </div>
      </section>

    </>
  );
}
