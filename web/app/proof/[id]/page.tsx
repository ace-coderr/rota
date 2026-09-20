"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContracts } from "wagmi";
import type { Address, PublicClient } from "viem";

import { addressUrl, txUrl } from "@/lib/explorer";
import { formatTimestamp, formatUsdc } from "@/lib/format";
import { ROTA_ABI, ROTA_ADDRESS, ROTA_DEPLOY_BLOCK } from "@/lib/rota";
import { ERC20_ABI, USDC_ADDRESS } from "@/lib/usdc";

/**
 * Public, read-only. No wallet connection required: everything here comes from
 * the chain through the app's own RPC transport.
 */
export default function ProofPage({ params }: PageProps<"/proof/[id]">) {
  const { id } = use(params);
  const circleId = /^\d+$/.test(id) ? BigInt(id) : undefined;
  const publicClient = usePublicClient();

  const reads = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "decimals",
      },
      {
        // The core claim, checkable by anyone: Rota's own USDC balance.
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

      // Timestamps come from the blocks the events landed in.
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
        blockNumber: log.blockNumber,
        timestamp: blocks.get(log.blockNumber),
      }));
    },
  });

  if (!ROTA_ADDRESS) {
    return (
      <main>
        <h1>Proof — circle {id}</h1>
        <p role="alert">
          <strong>Not configured.</strong> Set{" "}
          <code>NEXT_PUBLIC_ROTA_ADDRESS</code> in <code>web/.env.local</code>.
        </p>
      </main>
    );
  }

  const memberList = (members as Address[] | undefined) ?? [];

  return (
    <main>
      <h1>Proof — circle {id}</h1>
      <p>
        Public record. No wallet needed. Everything below is read straight from
        Arc testnet.
      </p>
      <p>
        <Link href="/">Home</Link> · <Link href={`/circle/${id}`}>Circle page</Link>
      </p>

      <h2>Rota holds no USDC</h2>
      <p>
        Contract:{" "}
        <a href={addressUrl(ROTA_ADDRESS)} target="_blank" rel="noreferrer">
          <code>{ROTA_ADDRESS}</code>
        </a>
      </p>
      <p>
        Live USDC balance of the Rota contract:{" "}
        <strong>
          {reads.isLoading
            ? "…"
            : `${formatUsdc(rotaBalance as bigint | undefined, decimals as number | undefined)} USDC`}
        </strong>
      </p>
      <p>
        <small>
          Every contribution moves wallet to wallet. If this figure is ever
          anything but 0, the core claim is broken.
        </small>
      </p>

      <h2>Rotation</h2>
      {memberList.length === 0 ? (
        <p>No such circle, or it has no members.</p>
      ) : (
        <ol>
          {memberList.map((member) => (
            <li key={member}>
              <a href={addressUrl(member)} target="_blank" rel="noreferrer">
                <code>{member}</code>
              </a>
            </li>
          ))}
        </ol>
      )}
      {circle && (
        <p>
          Cycle {Number(circle[3])} of {memberList.length} ·{" "}
          {circle[4] ? "started" : "not started"} · contribution{" "}
          {formatUsdc(circle[0], decimals as number | undefined)} USDC
        </p>
      )}

      <h2>Disbursement history</h2>
      {history.isLoading && <p>Reading Disbursed events…</p>}
      {history.error && (
        <p role="alert">
          Could not read history:{" "}
          <code>{(history.error as Error).message.split("\n")[0]}</code>
        </p>
      )}
      {history.data?.length === 0 && <p>Nothing disbursed yet.</p>}
      {history.data && history.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Cycle</th>
              <th>Recipient</th>
              <th>Total paid</th>
              <th>When</th>
              <th>Transaction</th>
            </tr>
          </thead>
          <tbody>
            {history.data.map((row) => (
              <tr key={row.hash}>
                <td>{row.cycleIndex}</td>
                <td>
                  <a href={addressUrl(row.recipient)} target="_blank" rel="noreferrer">
                    <code>{row.recipient}</code>
                  </a>
                </td>
                <td>
                  {formatUsdc(row.totalPaid, decimals as number | undefined)} USDC
                </td>
                <td>{formatTimestamp(row.timestamp)}</td>
                <td>
                  <a href={txUrl(row.hash)} target="_blank" rel="noreferrer">
                    <code>{row.hash.slice(0, 18)}…</code>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
