"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useAccount, useBlock, usePublicClient, useWriteContract } from "wagmi";

import { ErrorNotice } from "@/components/ErrorNotice";
import { WalletBar } from "@/components/WalletBar";
import {
  classifyTxError,
  wrongNetworkFailure,
  type TxFailure,
} from "@/lib/errors";
import { addressUrl, short, txUrl } from "@/lib/explorer";
import {
  describePeriod,
  formatTimestamp,
  formatUsdc,
  sameAddress,
} from "@/lib/format";
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

  const {
    circle,
    members,
    preview,
    decimals,
    myAllowance,
    myBalance,
    isLoading,
    error,
    refetchAll,
  } = useCircle(circleId);

  const [failure, setFailure] = useState<TxFailure | undefined>();
  const [pending, setPending] = useState<string | undefined>();
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();

  // Due-ness is decided by the chain against block.timestamp, so compare
  // against the latest block rather than the browser clock. Watching the block
  // also re-renders the page as time passes, so the button enables itself when
  // the cycle falls due without anyone reloading.
  const { data: latestBlock } = useBlock({ watch: true });
  const chainNow = latestBlock?.timestamp;

  const networkFailure = wrongNetworkFailure(chainId, EXPECTED_CHAIN_ID);

  if (!ROTA_ADDRESS) {
    return (
      <main>
        <h1>Circle {id}</h1>
        <p role="alert">
          <strong>Not configured.</strong> Set{" "}
          <code>NEXT_PUBLIC_ROTA_ADDRESS</code> in <code>web/.env.local</code>.
        </p>
      </main>
    );
  }

  if (circleId === undefined) {
    return (
      <main>
        <h1>Circle {id}</h1>
        <p role="alert">That is not a valid circle id.</p>
        <Link href="/">Home</Link>
      </main>
    );
  }

  /** Runs a write, then re-reads every value on the page. */
  async function run(label: string, send: () => Promise<`0x${string}`>) {
    setFailure(undefined);
    setLastHash(undefined);

    if (networkFailure) {
      setFailure(networkFailure);
      return;
    }

    setPending(label);
    try {
      const hash = await send();
      setLastHash(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      await refetchAll();
    } catch (err) {
      setFailure(classifyTxError(err));
    } finally {
      setPending(undefined);
    }
  }

  const memberCount = members?.length ?? 0;
  const cycleIndex = circle?.cycleIndex ?? 0;
  const complete = Boolean(circle && memberCount > 0 && cycleIndex >= memberCount);
  const recipient = members && !complete ? members[cycleIndex] : undefined;

  const isMember = Boolean(
    address && members?.some((m) => sameAddress(m, address)),
  );
  const iAmRecipient = sameAddress(recipient, address);

  // What the connected address owes this cycle: nothing if they are being paid,
  // or are not in the circle, or the circle is finished.
  const owedThisCycle =
    !circle || complete || !isMember || iAmRecipient ? 0n : circle.contribution;

  // Joining is a single approve for the whole rotation.
  const requiredAllowance =
    circle && memberCount > 1
      ? circle.contribution * BigInt(memberCount - 1)
      : 0n;
  const allowanceShort =
    myAllowance !== undefined && myAllowance < requiredAllowance;

  const shortMembers = (preview ?? []).filter((status) => !status.ready);
  const everyoneReady = preview !== undefined && shortMembers.length === 0;

  const due = Boolean(
    circle?.started && chainNow !== undefined && chainNow >= circle.nextDueAt,
  );

  const busy = pending !== undefined;

  return (
    <main>
      <h1>Circle {id}</h1>
      <p>
        <Link href="/">Home</Link> · <Link href={`/proof/${id}`}>Public proof page</Link>
      </p>

      <WalletBar />

      {isLoading && <p>Loading circle…</p>}
      {error && (
        <p role="alert">
          Could not read this circle: <code>{error.message.split("\n")[0]}</code>
        </p>
      )}

      {circle && memberCount === 0 && (
        <p role="alert">
          <strong>No such circle.</strong> Circle {id} does not exist yet.
        </p>
      )}

      {circle && memberCount > 0 && (
        <>
          <h2>State</h2>
          <table>
            <tbody>
              <tr>
                <td>Contribution per member, per cycle</td>
                <td>{formatUsdc(circle.contribution, decimals)} USDC</td>
              </tr>
              <tr>
                <td>Period</td>
                <td>{describePeriod(circle.period)}</td>
              </tr>
              <tr>
                <td>Cycle index</td>
                <td>
                  {cycleIndex} of {memberCount}
                </td>
              </tr>
              <tr>
                <td>Next due at</td>
                <td>
                  {circle.started ? formatTimestamp(circle.nextDueAt) : "not started"}
                </td>
              </tr>
              <tr>
                <td>Whose turn</td>
                <td>
                  {complete ? (
                    <em>complete — everyone has been paid</em>
                  ) : (
                    <>
                      <a href={addressUrl(recipient!)} target="_blank" rel="noreferrer">
                        <code>{recipient}</code>
                      </a>
                      {iAmRecipient && <strong> — that is you</strong>}
                    </>
                  )}
                </td>
              </tr>
              <tr>
                <td>You owe this cycle</td>
                <td>
                  {!isConnected
                    ? "connect a wallet"
                    : !isMember
                      ? "you are not a member of this circle"
                      : `${formatUsdc(owedThisCycle, decimals)} USDC`}
                  {iAmRecipient && !complete && " (you are being paid this cycle)"}
                </td>
              </tr>
              <tr>
                <td>Your USDC balance</td>
                <td>
                  {isConnected ? `${formatUsdc(myBalance, decimals)} USDC` : "—"}
                </td>
              </tr>
              <tr>
                <td>Your allowance to Rota</td>
                <td>
                  {isConnected ? `${formatUsdc(myAllowance, decimals)} USDC` : "—"}
                </td>
              </tr>
            </tbody>
          </table>

          <h2>Members, in payout order</h2>
          <ol>
            {members!.map((member, index) => (
              <li key={member}>
                <a href={addressUrl(member)} target="_blank" rel="noreferrer">
                  <code>{member}</code>
                </a>
                {index === cycleIndex && !complete && " ← paid this cycle"}
                {sameAddress(member, address) && " (you)"}
              </li>
            ))}
          </ol>

          <h2>Round preview</h2>
          <p>
            Read from <code>previewRound</code> before anyone signs, so a short
            member is named rather than discovered by a failed transaction.
          </p>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Allowance</th>
                <th>Balance</th>
                <th>Ready</th>
              </tr>
            </thead>
            <tbody>
              {(preview ?? []).map((status) => (
                <tr key={status.member} data-ready={status.ready}>
                  <td>
                    <code>{short(status.member)}</code>
                  </td>
                  <td>{formatUsdc(status.allowance, decimals)}</td>
                  <td>{formatUsdc(status.balance, decimals)}</td>
                  <td>{status.ready ? "yes" : "NO"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {shortMembers.length > 0 && (
            <div role="alert">
              <p>
                <strong>
                  {shortMembers.length} member(s) are short. Disburse is disabled
                  until they are covered:
                </strong>
              </p>
              <ul>
                {shortMembers.map((status) => (
                  <li key={status.member}>
                    <code>{status.member}</code> — allowance{" "}
                    {formatUsdc(status.allowance, decimals)}, balance{" "}
                    {formatUsdc(status.balance, decimals)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2>Actions</h2>

          <p>
            <button
              type="button"
              disabled={!isConnected || busy || !allowanceShort || !isMember}
              onClick={() =>
                run("approve", () =>
                  writeContractAsync({
                    address: USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: "approve",
                    args: [ROTA_ADDRESS!, requiredAllowance],
                  }),
                )
              }
            >
              {pending === "approve" ? "Approving…" : "Approve"}
            </button>{" "}
            Approve {formatUsdc(requiredAllowance, decimals)} USDC — one signature
            covering the whole rotation.
            {!allowanceShort && isConnected && isMember && (
              <em> Already approved.</em>
            )}
            {isConnected && !isMember && <em> You are not a member.</em>}
          </p>

          <p>
            <button
              type="button"
              disabled={
                !isConnected || busy || circle.started || !isMember || !everyoneReady
              }
              onClick={() =>
                run("start", () =>
                  writeContractAsync({
                    address: ROTA_ADDRESS!,
                    abi: ROTA_ABI,
                    functionName: "start",
                    args: [circleId],
                  }),
                )
              }
            >
              {pending === "start" ? "Starting…" : "Start"}
            </button>{" "}
            {circle.started ? (
              <em>Already started.</em>
            ) : everyoneReady ? (
              "Every member has approved. Any member can start."
            ) : (
              "Waiting for every member to approve."
            )}
          </p>

          <p>
            <button
              type="button"
              disabled={
                !isConnected || busy || !circle.started || complete || !due || !everyoneReady
              }
              onClick={() =>
                run("disburse", () =>
                  writeContractAsync({
                    address: ROTA_ADDRESS!,
                    abi: ROTA_ABI,
                    functionName: "disburse",
                    args: [circleId],
                  }),
                )
              }
            >
              {pending === "disburse" ? "Disbursing…" : "Disburse"}
            </button>{" "}
            {complete ? (
              <em>Circle complete.</em>
            ) : !circle.started ? (
              <em>Not started yet.</em>
            ) : !due ? (
              <em>Not due until {formatTimestamp(circle.nextDueAt)}.</em>
            ) : !everyoneReady ? (
              <em>Disabled: a member is short (named above).</em>
            ) : (
              "Due now — anyone can settle this cycle."
            )}
          </p>

          <ErrorNotice failure={failure ?? networkFailure} />

          {lastHash && (
            <p>
              Last transaction:{" "}
              <a href={txUrl(lastHash)} target="_blank" rel="noreferrer">
                <code>{lastHash}</code>
              </a>
            </p>
          )}
        </>
      )}
    </main>
  );
}
