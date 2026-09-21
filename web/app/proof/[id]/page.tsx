"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContracts } from "wagmi";
import type { Address, PublicClient } from "viem";

import { addressUrl, txUrl } from "@/lib/explorer";
import { dateInWords, money, shortAddress } from "@/lib/format";
import { useNames } from "@/lib/people";
import { ROTA_ABI, ROTA_ADDRESS, ROTA_DEPLOY_BLOCK } from "@/lib/rota";
import { ERC20_ABI, USDC_ADDRESS } from "@/lib/usdc";

/**
 * Public and wallet-free. Everything here is read straight from the chain, so
 * anyone can check a circle without an account and without trusting this site.
 */
export default function ProofPage({ params }: PageProps<"/proof/[id]">) {
  const { id } = use(params);
  const circleId = /^\d+$/.test(id) ? BigInt(id) : undefined;
  const publicClient = usePublicClient();

  const reads = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "decimals" },
      {
        // The claim, checkable by anyone: what Rota itself is holding.
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [ROTA_ADDRESS!],
      },
      {
        address: ROTA_ADDRESS,
        abi: ROTA_ABI,
        functionName: "getMembers",
        args: [circleId!],
      },
      {
        address: ROTA_ADDRESS,
        abi: ROTA_ABI,
        functionName: "getCircle",
        args: [circleId!],
      },
    ],
    query: { enabled: Boolean(ROTA_ADDRESS) && circleId !== undefined },
  });

  const [decimals, rotaBalance, members, circle] = reads.data ?? [];
  const memberList = (members as Address[] | undefined) ?? [];
  const naming = useNames(id, memberList);

  const history = useQuery({
    queryKey: ["disbursed", ROTA_ADDRESS, id],
    enabled: Boolean(publicClient && ROTA_ADDRESS) && circleId !== undefined,
    queryFn: async () => {
      const client = publicClient as PublicClient;
      const logs = await client.getContractEvents({
        address: ROTA_ADDRESS!,
        abi: ROTA_ABI,
        eventName: "Disbursed",
        args: { circleId },
        fromBlock: ROTA_DEPLOY_BLOCK,
        toBlock: "latest",
      });

      const blocks = new Map<bigint, bigint>();
      for (const log of logs) {
        if (!blocks.has(log.blockNumber)) {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          blocks.set(log.blockNumber, block.timestamp);
        }
      }

      return logs.map((log) => ({
        cycleIndex: Number(log.args.cycleIndex),
        recipient: log.args.recipient as Address,
        totalPaid: log.args.totalPaid as bigint,
        hash: log.transactionHash,
        timestamp: blocks.get(log.blockNumber),
      }));
    },
  });

  if (!ROTA_ADDRESS) {
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
        {reads.isLoading ? "—" : money(rotaBalance as bigint | undefined, decimals as number | undefined)}
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
          Checked live on Arc just now.{" "}
          <a href={addressUrl(ROTA_ADDRESS)} target="_blank" rel="noreferrer">
            See it for yourself
          </a>
          .
        </p>
      </div>

      <h2>Who&rsquo;s in this circle</h2>
      {memberList.length === 0 ? (
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
                  href={addressUrl(member)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(member)}
                </a>
              </span>
              <span className="person-status">
                {circle && index < Number(circle[3]) ? (
                  <span className="tag-paid">Paid</span>
                ) : (
                  <span className="muted">Waiting</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <h2>What&rsquo;s happened so far</h2>

      {history.isLoading && <p className="muted">Loading the record…</p>}

      {history.error && (
        <div className="notice notice-wait">
          <p className="notice-title">The record couldn&rsquo;t be loaded.</p>
          <p className="small">Please try again in a moment.</p>
        </div>
      )}

      {history.data?.length === 0 && (
        <p className="muted">
          Nobody has been paid yet. The record will appear here as each turn
          happens.
        </p>
      )}

      {history.data && history.data.length > 0 && (
        <div className="card">
          {history.data.map((row) => (
            <div className="person" key={row.hash}>
              <span className="person-turn">{row.cycleIndex + 1}.</span>
              <span>
                <span className="person-name">
                  {naming.nameOf(row.recipient)} received{" "}
                  {money(row.totalPaid, decimals as number | undefined)} USDC
                </span>
                <br />
                <span className="person-detail">
                  {dateInWords(row.timestamp)} ·{" "}
                  <a href={txUrl(row.hash)} target="_blank" rel="noreferrer">
                    See the record
                  </a>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
