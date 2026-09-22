"use client";

import Link from "next/link";
import { use } from "react";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { deploymentFor } from "@/lib/deployments";
import { addressUrl, txUrl } from "@/lib/explorer";
import { dateInWords, money, shortAddress } from "@/lib/format";
import { turnsFromState, useDisbursementLinks, withLinks } from "@/lib/history";
import { useNames } from "@/lib/people";
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
  const naming = useNames(id, memberList);

  const contribution = circle ? (circle[0] as bigint) : 0n;
  const cycleIndex = circle ? Number(circle[3]) : 0;
  const started = circle ? Boolean(circle[4]) : false;

  // Primary history: derived from state, so it is always available.
  const turns = turnsFromState(memberList, cycleIndex, contribution);

  // Secondary: transaction links, best effort.
  const links = useDisbursementLinks(deployment, circleId, turns.length);
  const rows = withLinks(turns, links.data);

  const linksMissing = turns.length > 0 && !(links.data?.complete ?? false);

  if (!deployment) {
    return (
      <main>
        <h1>Record unavailable</h1>
        <p>Rota isn&rsquo;t set up on this site yet.</p>
      </main>
    );
  }

  return (
    <main>
      <Link href={`/circle/${id}`} className="back">
        ← Back to the circle
      </Link>

      <h1>Rota is holding</h1>

      <p className="hero-figure">
        {balance.isLoading || rotaBalance === undefined
          ? "—"
          : money(rotaBalance as bigint, decimals as number)}
        <span className="hero-unit">USDC</span>
      </p>

      <p className="lede" style={{ marginTop: "1rem" }}>
        Rota never holds anyone&rsquo;s savings. Each person&rsquo;s share goes
        straight from their wallet to whoever&rsquo;s turn it is, so this number
        stays at zero — and anyone can check it, at any time, without taking
        our word for it.
      </p>

      <div className="card card-quiet">
        <p className="small muted" style={{ margin: 0 }}>
          Checked live on {deployment.label} just now.{" "}
          <a
            href={addressUrl(explorer, deployment.rota)}
            target="_blank"
            rel="noreferrer"
          >
            See it for yourself
          </a>
          .
        </p>
      </div>

      <h2>Who&rsquo;s in this circle</h2>
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

      {/* Only a circle that exists has a history worth heading. */}
      {memberList.length > 0 && <h2>What&rsquo;s happened so far</h2>}

      {memberList.length > 0 && rows.length === 0 && (
        <p className="muted">
          {started
            ? "Nobody has been paid yet. The record will appear here as each turn happens."
            : "This circle hasn’t started yet."}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="card">
            {rows.map((turn) => (
              <div className="person" key={turn.index}>
                <span className="person-turn">{turn.index + 1}.</span>
                <span>
                  <span className="person-name">
                    {naming.nameOf(turn.recipient)} received{" "}
                    {money(turn.amount, decimals as number | undefined)} USDC
                  </span>
                  {(turn.timestamp || turn.hash) && (
                    <>
                      <br />
                      <span className="person-detail">
                        {turn.timestamp && dateInWords(turn.timestamp)}
                        {turn.timestamp && turn.hash && " · "}
                        {turn.hash && (
                          <a
                            href={txUrl(explorer, turn.hash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            See the record
                          </a>
                        )}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>

          {linksMissing && (
            <p className="small muted">
              {links.isLoading
                ? "Looking up the individual transactions…"
                : "Individual transaction links aren’t available for every turn — this network limits how far back they can be searched. The turns above are read directly from the contract, which is the authoritative record."}
              {!links.isLoading && (
                <>
                  {" "}
                  <a
                    href={addressUrl(explorer, deployment.rota)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    See every transaction on the explorer
                  </a>
                  .
                </>
              )}
            </p>
          )}
        </>
      )}
    </main>
  );
}
