"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress, parseUnits, type Address } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
  usePublicClient,
} from "wagmi";

import { ErrorNotice } from "@/components/ErrorNotice";
import { WalletBar } from "@/components/WalletBar";
import { classifyTxError, wrongNetworkFailure, type TxFailure } from "@/lib/errors";
import { ROTA_ABI, ROTA_ADDRESS } from "@/lib/rota";
import { useUsdcDecimals } from "@/lib/useRota";
import { EXPECTED_CHAIN_ID } from "@/lib/wagmi";
import { txUrl } from "@/lib/explorer";

export default function CreatePage() {
  const { isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: decimals } = useUsdcDecimals();

  const [amount, setAmount] = useState("10");
  const [period, setPeriod] = useState("3600");
  const [membersText, setMembersText] = useState("");

  const [failure, setFailure] = useState<TxFailure | undefined>();
  const [circleId, setCircleId] = useState<bigint | undefined>();

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });

  const members = membersText
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const invalidAddresses = members.filter((m) => !isAddress(m));
  const duplicates = members.filter(
    (m, i) => members.findIndex((o) => o.toLowerCase() === m.toLowerCase()) !== i,
  );

  const amountValid = /^\d+(\.\d+)?$/.test(amount.trim()) && Number(amount) > 0;
  const periodValid = /^\d+$/.test(period.trim()) && Number(period) > 0;

  const problems: string[] = [];
  if (!amountValid) problems.push("Amount must be a positive number.");
  if (!periodValid) problems.push("Period must be a positive whole number of seconds.");
  if (members.length < 2) problems.push("A circle needs at least 2 members.");
  if (members.length > 20) problems.push(`A circle can have at most 20 members (you entered ${members.length}).`);
  if (invalidAddresses.length) problems.push(`Not valid addresses: ${invalidAddresses.join(", ")}`);
  if (duplicates.length) problems.push(`Duplicate members: ${[...new Set(duplicates)].join(", ")}`);

  const networkFailure = wrongNetworkFailure(chainId, EXPECTED_CHAIN_ID);
  const canSubmit =
    isConnected &&
    !networkFailure &&
    problems.length === 0 &&
    decimals !== undefined &&
    ROTA_ADDRESS &&
    !isPending &&
    !receipt.isLoading;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(undefined);
    setCircleId(undefined);
    setHash(undefined);

    const rota = ROTA_ADDRESS;
    if (!rota || decimals === undefined) return;
    if (networkFailure) {
      setFailure(networkFailure);
      return;
    }

    try {
      const contribution = parseUnits(amount.trim(), decimals);

      const txHash = await writeContractAsync({
        address: rota,
        abi: ROTA_ABI,
        functionName: "createCircle",
        args: [members as Address[], contribution, BigInt(period.trim())],
      });
      setHash(txHash);

      // The id is the return value, which a transaction cannot give us, so
      // read it out of the CircleCreated event instead.
      const confirmed = await publicClient!.waitForTransactionReceipt({
        hash: txHash,
      });
      const log = confirmed.logs.find(
        (l) => l.address.toLowerCase() === rota.toLowerCase(),
      );
      if (log && log.topics[1]) {
        setCircleId(BigInt(log.topics[1]));
      }
    } catch (error) {
      setFailure(classifyTxError(error));
    }
  }

  if (!ROTA_ADDRESS) {
    return (
      <main>
        <h1>Create a circle</h1>
        <p role="alert">
          <strong>Not configured.</strong> Set <code>NEXT_PUBLIC_ROTA_ADDRESS</code>{" "}
          in <code>web/.env.local</code> to the deployed Rota address.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Create a circle</h1>
      <p>
        <Link href="/">Home</Link>
      </p>

      <WalletBar />

      <form onSubmit={onSubmit}>
        <p>
          <label htmlFor="amount">Amount per person, per cycle (USDC)</label>
          <br />
          <input
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </p>

        <p>
          <label htmlFor="period">Period (seconds between cycles)</label>
          <br />
          <input
            id="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
          <br />
          <small>3600 = hourly, 86400 = daily, 604800 = weekly.</small>
        </p>

        <p>
          <label htmlFor="members">
            Member addresses, in payout order (one per line)
          </label>
          <br />
          <textarea
            id="members"
            rows={6}
            cols={60}
            value={membersText}
            onChange={(e) => setMembersText(e.target.value)}
            placeholder={"0x…\n0x…\n0x…"}
          />
          <br />
          <small>
            {members.length} address(es). Member 1 is paid first, then member 2,
            and so on.
          </small>
        </p>

        {problems.length > 0 && membersText.trim() !== "" && (
          <ul role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <button type="submit" disabled={!canSubmit}>
          {isPending
            ? "Confirm in wallet…"
            : receipt.isLoading
              ? "Creating…"
              : "Create circle"}
        </button>
        {!isConnected && <span> Connect a wallet first.</span>}
      </form>

      <ErrorNotice failure={failure ?? networkFailure} />

      {hash && (
        <p>
          Transaction: <a href={txUrl(hash)} target="_blank" rel="noreferrer">
            <code>{hash}</code>
          </a>
        </p>
      )}

      {circleId !== undefined && (
        <div>
          <h2>Circle created</h2>
          <p>
            Circle id: <strong><code>{circleId.toString()}</code></strong>
          </p>
          <p>
            <Link href={`/circle/${circleId}`}>Open the circle</Link> — share this
            id with the other members so they can approve.
          </p>
        </div>
      )}
    </main>
  );
}
