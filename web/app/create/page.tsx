"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress, parseUnits, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { ErrorNotice } from "@/components/ErrorNotice";
import { WalletBar } from "@/components/WalletBar";
import {
  classifyTxError,
  wrongNetworkFailure,
  type TxFailure,
} from "@/lib/errors";
import { ROTA_ABI } from "@/lib/rota";
import { deploymentFor } from "@/lib/deployments";
import { useRotaWallet } from "@/lib/wallet/useRotaWallet";
import { useUsdcDecimals } from "@/lib/useRota";

const FREQUENCIES = [
  { label: "Every week", seconds: "604800" },
  { label: "Every two weeks", seconds: "1209600" },
  { label: "Every month", seconds: "2592000" },
];

export default function CreatePage() {
  const { chainId } = useAccount();
  const { data: decimals } = useUsdcDecimals();
  const wallet = useRotaWallet();
  const isConnected = wallet.isReady;
  const deployment = deploymentFor(chainId);
  const publicClient = usePublicClient({ chainId: deployment?.chain.id });

  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(FREQUENCIES[0].seconds);
  const [membersText, setMembersText] = useState("");
  const [failure, setFailure] = useState<TxFailure | undefined>();
  const [circleId, setCircleId] = useState<bigint | undefined>();
  const [working, setWorking] = useState(false);

  const members = membersText
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const invalid = members.filter((m) => !isAddress(m));
  const duplicates = [
    ...new Set(
      members.filter(
        (m, i) =>
          members.findIndex((o) => o.toLowerCase() === m.toLowerCase()) !== i,
      ),
    ),
  ];

  const amountValid = /^\d+(\.\d{1,6})?$/.test(amount.trim()) && Number(amount) > 0;
  const touched = membersText.trim() !== "";

  const problems: string[] = [];
  if (touched && members.length < 2) {
    problems.push("A circle needs at least two people.");
  }
  if (members.length > 20) {
    problems.push(`A circle can have up to 20 people. You've listed ${members.length}.`);
  }
  if (invalid.length) {
    problems.push(
      `${invalid.length} of these isn't a valid wallet address. Each one starts with 0x and is 42 characters long.`,
    );
  }
  if (duplicates.length) {
    problems.push("Someone is listed twice. Each person can only appear once.");
  }

  const ROTA_ADDRESS = deployment?.rota;
  const networkFailure =
    isConnected && !deployment
      ? wrongNetworkFailure(chainId, -1)
      : undefined;
  const ready =
    isConnected &&
    !networkFailure &&
    amountValid &&
    members.length >= 2 &&
    problems.length === 0 &&
    decimals !== undefined &&
    Boolean(ROTA_ADDRESS) &&
    !working;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(undefined);

    const rota = ROTA_ADDRESS;
    if (!rota || decimals === undefined) return;
    if (networkFailure) return setFailure(networkFailure);

    setWorking(true);
    try {
      await wallet.send(
        {
          address: rota,
          abi: ROTA_ABI,
          functionName: "createCircle",
          args: [
            members as Address[],
            parseUnits(amount.trim(), decimals),
            BigInt(period),
          ],
        },
        deployment!.chain.id,
      );

      // The id is the contract's return value, which a transaction cannot hand
      // back — and the Circle path has no receipt to read a log from. Read the
      // counter instead: the circle just created is the one before it.
      const count = (await publicClient!.readContract({
        address: rota,
        abi: ROTA_ABI,
        functionName: "circleCount",
      })) as bigint;
      if (count > 0n) setCircleId(count - 1n);
    } catch (error) {
      setFailure(classifyTxError(error));
    } finally {
      setWorking(false);
    }
  }

  if (!ROTA_ADDRESS) {
    return (
      <main>
        <h1>Start a circle</h1>
        <div className="notice notice-stop">
          <p className="notice-title">Rota isn&rsquo;t set up on this site yet.</p>
          <p className="small">Please try again later.</p>
        </div>
      </main>
    );
  }

  if (circleId !== undefined) {
    return (
      <main>
        <h1>Your circle is ready</h1>
        <p className="lede">
          Share this number with everyone joining. They&rsquo;ll need it to find
          the circle.
        </p>

        <div className="card" style={{ textAlign: "center", padding: "2rem 1.25rem" }}>
          <p className="small muted" style={{ marginBottom: "0.25rem" }}>
            Circle number
          </p>
          <p className="hero-figure">{circleId.toString()}</p>
        </div>

        <Link
          href={`/circle/${circleId}`}
          className="btn"
          style={{ textDecoration: "none" }}
        >
          Open my circle
        </Link>
        <p className="action-note">
          Nothing has been charged. Nobody pays anything until everyone has
          joined and the circle starts.
        </p>
      </main>
    );
  }

  return (
    <main>
      <Link href="/" className="back">
        ← Back
      </Link>
      <h1>Start a circle</h1>
      <p className="lede">
        Everyone puts in the same amount each round, and takes it in turns to
        receive the pot.
      </p>

      <WalletBar reason="Connect your wallet to set up a circle." />

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="amount">How much does each person put in?</label>
          <input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50.00"
            aria-describedby="amount-hint"
          />
          <p className="hint" id="amount-hint">
            In USDC, each round.
            {amount.trim() !== "" && !amountValid && (
              <> Enter an amount like 50 or 50.00.</>
            )}
          </p>
        </div>

        <div className="field">
          <label htmlFor="period">How often?</label>
          <select
            id="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.seconds} value={f.seconds}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="members">Who&rsquo;s in the circle?</label>
          <textarea
            id="members"
            value={membersText}
            onChange={(e) => setMembersText(e.target.value)}
            placeholder={"0x…\n0x…\n0x…"}
            aria-describedby="members-hint"
          />
          <p className="hint" id="members-hint">
            One wallet address per line, in the order people will be paid. The
            first person listed is paid first.
            {members.length > 0 && (
              <>
                {" "}
                <strong>
                  {members.length} {members.length === 1 ? "person" : "people"}{" "}
                  so far.
                </strong>
              </>
            )}
          </p>
        </div>

        {touched && problems.length > 0 && (
          <div className="notice notice-wait" role="alert">
            {problems.map((problem) => (
              <p key={problem} className="small">
                {problem}
              </p>
            ))}
          </div>
        )}

        <button type="submit" className="btn" disabled={!ready}>
          {working ? "Creating your circle…" : "Create this circle"}
        </button>
        <p className="action-note">
          {!isConnected
            ? "Connect your wallet first."
            : "This just sets up the circle. No money moves, and nobody is charged."}
        </p>
      </form>

      <ErrorNotice failure={failure ?? networkFailure} />
    </main>
  );
}
