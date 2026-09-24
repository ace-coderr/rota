"use client";

import Link from "next/link";

import { Button } from "@/components/Button";
import { useState, useSyncExternalStore } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useGasPrice, usePublicClient } from "wagmi";

import { ErrorNotice } from "@/components/ErrorNotice";
import {
  MAX_MEMBERS,
  MemberRows,
  newRow,
  rowProblem,
  type Row,
} from "@/components/MemberRows";
import { WalletBar } from "@/components/WalletBar";
import {
  classifyTxError,
  wrongNetworkFailure,
  type TxFailure,
} from "@/lib/errors";
import { ROTA_ABI } from "@/lib/rota";
import {
  DEFAULT_DEPLOYMENT,
  NOTHING_CONFIGURED,
  deploymentFor,
} from "@/lib/deployments";
import { ConfigNotice } from "@/components/ConfigNotice";
import { useRotaWallet } from "@/lib/wallet/useRotaWallet";
import { useUsdcDecimals } from "@/lib/useRota";
import { feeBuffer } from "@/lib/money";
import { everyInWords, whenInWords } from "@/lib/format";
import { inviteLink } from "@/lib/people";

/*
 * How often money changes hands.
 *
 * `short` marks the two periods that exist so a circle can be seen working
 * inside one sitting — a demonstration, a test on testnet, or a group that
 * genuinely settles daily. They are real options, not a debug mode: the
 * contract takes any period in seconds and treats them all the same.
 */
const FREQUENCIES = [
  { label: "Every hour", seconds: "3600", short: true },
  { label: "Every day", seconds: "86400", short: true },
  { label: "Every week", seconds: "604800", short: false },
  { label: "Every fortnight", seconds: "1209600", short: false },
  { label: "Every month", seconds: "2592000", short: false },
];

const DEFAULT_PERIOD = "604800";

/**
 * Below about a pound a round, a circle is being shown rather than saved into,
 * and nobody demonstrating one wants to wait a week for the second payout —
 * so the short periods come first. Above it they go to the bottom, where they
 * cannot be picked for a real circle by accident.
 *
 * Only the order changes. The full list is always there, and the choice is
 * held as a value rather than an index, so reordering can never quietly move
 * someone onto a different schedule than the one they picked.
 */
const SHORT_PERIOD_CEILING = 1;

function orderedFrequencies(amount: string) {
  const value = Number(amount.trim());
  const small =
    Number.isFinite(value) && value > 0 && value < SHORT_PERIOD_CEILING;
  return small
    ? FREQUENCIES
    : [
        ...FREQUENCIES.filter((f) => !f.short),
        ...FREQUENCIES.filter((f) => f.short),
      ];
}

/*
 * The clock, read once when this module loads in the browser.
 *
 * The schedule is written out in real dates, and a clock read during render
 * disagrees with the one the server did. useSyncExternalStore is how the rest
 * of this codebase reads browser-only state: the server snapshot is undefined,
 * the client snapshot is a constant, so it never loops and never mismatches.
 */
const LOADED_AT = Date.now();
const subscribeNever = () => () => {};

const onDay = (at: Date) =>
  at.toLocaleDateString(undefined, { day: "numeric", month: "long" });

/**
 * A date is the wrong unit for an hourly circle.
 *
 * "First payout 24 September, then every hour until 24 September" is both
 * true and useless — every payout in the whole circle falls on the same day.
 * Below a day the schedule switches to the clock, which is what `whenInWords`
 * already says everywhere else in the app ("today at 4pm").
 */
const whenFor = (at: Date, periodSeconds: number) =>
  periodSeconds < 86400
    ? whenInWords(BigInt(Math.floor(at.getTime() / 1000)))
    : onDay(at);

const ordinal = (n: number) => {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

export default function CreatePage() {
  const { chainId } = useAccount();
  const { data: decimals } = useUsdcDecimals();
  const wallet = useRotaWallet();
  const isConnected = wallet.isReady;
  const deployment = deploymentFor(chainId);
  const publicClient = usePublicClient({ chainId: deployment?.chain.id });

  const { data: gasPrice } = useGasPrice({ chainId: deployment?.chain.id });

  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow()]);

  const now = useSyncExternalStore(
    subscribeNever,
    () => LOADED_AT as number | undefined,
    () => undefined,
  );
  const [failure, setFailure] = useState<TxFailure | undefined>();
  const [circleId, setCircleId] = useState<bigint | undefined>();
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Names never leave this browser — they travel to the other members in the
   * invite link's #fragment, which is not sent to any server and never
   * touches the chain.
   */
  const entries = rows
    .map((row) => ({ address: row.address.trim(), name: row.name.trim() }))
    .filter((entry) => entry.address !== "");
  const members = entries.map((entry) => entry.address);
  const you = wallet.address;

  const amountValid =
    /^\d+(\.\d{1,6})?$/.test(amount.trim()) && Number(amount) > 0;

  // Every row judges itself, in place. A single list of failures at the foot
  // of a form makes you count rows to work out which one it means.
  const rowsClean = rows.every((_, i) => rowProblem(rows, i, you) === undefined);
  const enoughPeople = members.length >= 2;
  const youAreIn =
    you === undefined ||
    members.some((m) => m.toLowerCase() === you.toLowerCase());

  /** What one person has to hold to see the whole circle through. */
  const perPerson =
    amountValid && decimals !== undefined && enoughPeople
      ? parseUnits(amount.trim(), decimals) * BigInt(members.length - 1) +
        feeBuffer(gasPrice)
      : undefined;

  const periodSeconds = Number(period);
  const firstPayout =
    now !== undefined ? new Date(now + periodSeconds * 1000) : undefined;
  const lastPayout =
    now !== undefined && enoughPeople
      ? new Date(now + periodSeconds * 1000 * members.length)
      : undefined;

  const myTurn = you
    ? members.findIndex((m) => m.toLowerCase() === you.toLowerCase()) + 1
    : 0;


  const ROTA_ADDRESS = deployment?.rota;
  const networkFailure =
    isConnected && !deployment
      ? wrongNetworkFailure(chainId, -1)
      : undefined;
  const ready =
    isConnected &&
    !networkFailure &&
    amountValid &&
    enoughPeople &&
    members.length <= MAX_MEMBERS &&
    rowsClean &&
    youAreIn &&
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

  // Two different failures were both showing as "not set up": no chain
  // configured at all, and a wallet connected to a chain Rota is not on.
  // Only the first is a configuration problem.
  if (!ROTA_ADDRESS) {
    return (
      <main className="sheet">
        <h1>Start a circle</h1>
        {NOTHING_CONFIGURED ? (
          <ConfigNotice />
        ) : (
          <div className="notice notice-wait">
            <p className="notice-title">
              Your wallet is on a network Rota isn&rsquo;t on.
            </p>
            <p className="small">
              Switch to {DEFAULT_DEPLOYMENT?.label ?? "Arc"} to start a circle.
            </p>
          </div>
        )}
        <WalletBar reason="Connect your wallet to set up a circle." />
      </main>
    );
  }

  const namedMembers = Object.fromEntries(
    entries
      .filter((entry) => entry.name)
      .map((entry) => [entry.address.toLowerCase(), entry.name]),
  );

  if (circleId !== undefined) {
    const invite = inviteLink(
      typeof window === "undefined" ? "" : window.location.origin,
      circleId.toString(),
      namedMembers,
    );

    return (
      <main className="sheet">
        <h1>Your circle is ready</h1>
        <p className="lede">
          Share this number with everyone joining. They&rsquo;ll need it to find
          the circle.
        </p>

        <div className="card" style={{ textAlign: "center", padding: "2rem 1.25rem" }}>
          <span className="label" style={{ marginBottom: "0.5rem" }}>
            Circle number
          </span>
          <p className="sum">{circleId.toString()}</p>
        </div>

        <h2>Send this link to everyone</h2>
        <p>
          It opens the circle for them, with the names you typed already filled
          in.
        </p>
        <div className="share">{invite}</div>
        <Button
          variant="secondary"
          size="lg"
          block
          onClick={() => {
            navigator.clipboard?.writeText(invite).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Copied" : "Copy the link"}
        </Button>
        <p className="action-note">
          The names are only in the link itself. They are never sent to us and
          never go on the blockchain.
        </p>

        <hr className="divider" />

        <Button href={`/circle/${circleId}`} size="lg" block>
          Open my circle
        </Button>
        <p className="action-note">
          Nothing has been charged. Nobody pays anything until everyone has
          joined and the circle starts.
        </p>
      </main>
    );
  }

  return (
    <main className="sheet sheet-wide">
      <Link href="/" className="back">
        ← Back
      </Link>
      <h1>Start a circle</h1>
      <p className="lede">
        Everyone puts in the same amount each round, and takes it in turns to
        receive everyone else&rsquo;s share.
      </p>

      {/*
        Two columns on a laptop: the decisions on the left, and what they add
        up to on the right, where it stays in view while you work. One column
        below that, which puts the summary directly above the button — the
        same reading order, stacked.

        Signing in is not a panel floating above the form. You can build the
        whole circle first; the sign-in takes the submit's place at the moment
        it is actually needed.
      */}
      <form onSubmit={onSubmit} className="build">
        <div className="build-steps">
        {/* ------------------------------------------------ 01 the money */}
        <section className="step">
          <span className="step-n">01 — The money</span>

          <label htmlFor="amount">How much does each person put in?</label>
          <div className="input-suffix">
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50.00"
              aria-describedby="amount-hint"
            />
            <span aria-hidden="true">USDC each round</span>
          </div>

          <p className="hint" id="amount-hint">
            {amount.trim() !== "" && !amountValid
              ? "Enter an amount like 50 or 50.00."
              : "In USDC, every round."}
          </p>

          {perPerson !== undefined && decimals !== undefined && (
            <p className="step-live">
              Each person needs about{" "}
              <strong>
                {Number(formatUnits(perPerson, decimals)).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}{" "}
                USDC
              </strong>{" "}
              in their wallet to finish the circle — {members.length - 1}{" "}
              {members.length - 1 === 1 ? "round" : "rounds"} of {amount.trim()},
              plus the network charge.
            </p>
          )}
        </section>

        {/* --------------------------------------------- 02 the schedule */}
        <section className="step">
          <span className="step-n">02 — The schedule</span>

          <label htmlFor="period">How often?</label>
          <select
            id="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {orderedFrequencies(amount).map((f) => (
              <option key={f.seconds} value={f.seconds}>
                {f.label}
              </option>
            ))}
          </select>

          {firstPayout && (
            <p className="step-live">
              First payout <strong>{whenFor(firstPayout, periodSeconds)}</strong>, then{" "}
              {everyInWords(BigInt(period))}
              {lastPayout ? (
                <>
                  {" "}
                  until <strong>{whenFor(lastPayout, periodSeconds)}</strong>.
                </>
              ) : (
                "."
              )}
            </p>
          )}
        </section>

        {/* ------------------------------------------------ 03 who's in */}
        <section className="step">
          <span className="step-n">03 — Who’s in</span>
          <p className="hint" style={{ margin: "0 0 1rem" }}>
            In the order they’ll be paid. You can paste a whole list into any
            address box.
          </p>

          <MemberRows rows={rows} setRows={setRows} you={you} />

          {members.length > 0 && (
            <div className="order">
              <span className="order-label">Payout order</span>
              <ol>
                {entries.map((entry, i) => (
                  <li key={`${entry.address}-${i}`}>
                    {entry.name ||
                      (you && entry.address.toLowerCase() === you.toLowerCase()
                        ? "You"
                        : `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!enoughPeople && members.length > 0 && (
            <p className="row-problem" role="alert">
              A circle needs at least two people.
            </p>
          )}
          {!youAreIn && members.length > 0 && (
            <p className="row-problem" role="alert">
              Your own address isn’t in the list. You have to be in the circle
              to start it.
            </p>
          )}
        </section>

        </div>

        <aside className="build-side">
          <div className="recap">
            <span className="step-n">Your circle</span>

            <dl className="recap-rows">
              <div>
                <dt>Each person puts in</dt>
                <dd>{amountValid ? `${amount.trim()} USDC` : "—"}</dd>
              </div>
              <div>
                <dt>How often</dt>
                <dd>{everyInWords(BigInt(period))}</dd>
              </div>
              <div>
                <dt>People</dt>
                <dd>{members.length || "—"}</dd>
              </div>
              <div>
                <dt>Each person needs</dt>
                <dd>
                  {perPerson !== undefined && decimals !== undefined
                    ? `${Number(formatUnits(perPerson, decimals)).toLocaleString(
                        undefined,
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                      )} USDC`
                    : "—"}
                </dd>
              </div>
              {myTurn > 0 && (
                <div>
                  <dt>You are paid</dt>
                  <dd>{ordinal(myTurn)}</dd>
                </div>
              )}
            </dl>

            {entries.length > 0 && (
              <div className="recap-order">
                <span className="order-label">Payout order</span>
                <ol>
                  {entries.map((entry, i) => (
                    <li key={`recap-${entry.address}-${i}`}>
                      {entry.name ||
                        (you && entry.address.toLowerCase() === you.toLowerCase()
                          ? "You"
                          : `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`)}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {firstPayout && enoughPeople && (
              <p className="recap-note">
                First payout {whenFor(firstPayout, periodSeconds)}
                {lastPayout
                  ? `, last ${whenFor(lastPayout, periodSeconds)}`
                  : ""}
                .
              </p>
            )}

            <div className="recap-action">
              {isConnected ? (
                <>
                  <Button type="submit" size="lg" block disabled={!ready}>
                    {working ? "Creating your circle…" : "Create this circle"}
                  </Button>
                  <p className="action-note">
                    This just sets up the circle. No money moves, and nobody is
                    charged.
                  </p>
                </>
              ) : (
                <div className="recap-signin">
                  <p className="recap-signin-title">
                    Sign in to create this circle
                  </p>
                  <WalletBar bare reason="" />
                  <p className="action-note">
                    Nothing you have typed is lost, and nothing is charged.
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </form>

      <ErrorNotice failure={failure ?? networkFailure} />
    </main>
  );
}
