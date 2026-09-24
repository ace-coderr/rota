"use client";

import Link from "next/link";

import { Button } from "@/components/Button";
import { useState, useSyncExternalStore } from "react";
import { AmountField } from "@/components/AmountField";
import { Changing } from "@/components/Changing";
import { PeriodPicker, type Frequency } from "@/components/PeriodPicker";
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
 * Shortest first, and FIXED. These used to reorder as the amount was typed,
 * so that hourly and daily rose to the top of the dropdown for a circle small
 * enough to be a demonstration. That was the right instinct for a control
 * that shows one option at a time, and the wrong mechanism: it solved a
 * discoverability problem by moving things, and it only worked if you
 * happened to fill the fields in the order it expected.
 *
 * As five visible buttons there is nothing to discover, so the order can be
 * the honest one — ascending, hourly first, never moving under the cursor
 * someone is about to click with.
 */
const FREQUENCIES: readonly Frequency[] = [
  { pill: "Hourly", label: "every hour", seconds: "3600" },
  { pill: "Daily", label: "every day", seconds: "86400" },
  { pill: "Weekly", label: "every week", seconds: "604800" },
  { pill: "Fortnightly", label: "every fortnight", seconds: "1209600" },
  { pill: "Monthly", label: "every month", seconds: "2592000" },
];

const DEFAULT_PERIOD = "604800";

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

/**
 * One step: an anchor in the left rail, and the panel it belongs to.
 *
 * The marker is out in the rail rather than inside the box because it is a
 * position in a sequence, not a caption on a panel — three of them in a
 * column with a thread between reads as a route with an end, which is the
 * one thing a set of stacked boxes cannot say.
 *
 * `active` is only the starting opinion. The panel also comes forward on
 * :focus-within, so putting the cursor in a finished step brings it back
 * without this component needing to hear about it.
 */
function Step({
  n,
  title,
  done,
  active,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="step"
      data-done={done ? "" : undefined}
      data-active={active ? "" : undefined}
    >
      <div className="step-rail" aria-hidden="true">
        <span className="step-num">
          {done ? (
            <svg viewBox="0 0 16 16" className="step-tick">
              <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" />
            </svg>
          ) : (
            `0${n}`
          )}
        </span>
      </div>

      <div className="step-panel">
        <h2 className="step-title">
          <span className="step-title-n">0{n}</span>
          {title}
          {done && <span className="sr-only"> — done</span>}
        </h2>
        {children}
      </div>
    </section>
  );
}

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

  /*
   * A step is answered when it holds something usable. The schedule is
   * answered from the start, because it ships with a real default rather than
   * an empty control.
   */
  const stepAnswered = [amountValid, true, enoughPeople && rowsClean && youAreIn];

  /*
   * A step is DONE when it and everything before it is answered.
   *
   * The distinction matters on first load: the schedule is answered before
   * anyone touches it, so ticking it independently put a check against 02
   * while 01 was still blank, which reads as having skipped a step rather
   * than as not having started. A rail of markers is a claim about progress
   * through a sequence, so it has to be scored like one.
   */
  const stepDone = stepAnswered.map((_, i) =>
    stepAnswered.slice(0, i + 1).every(Boolean),
  );

  // The one the page is asking about: the first that is not finished. Focus
  // overrides this in CSS, so putting the cursor in a settled step brings it
  // forward without any of this having to know.
  const activeStep = stepDone.findIndex((done) => !done);

  const formattedPerPerson =
    perPerson !== undefined && decimals !== undefined
      ? `${Number(formatUnits(perPerson, decimals)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USDC`
      : undefined;


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
          {/* --------------------------------------------- 01 the money */}
          <Step n={1} title="The money" done={stepDone[0]} active={activeStep === 0}>
            <label htmlFor="amount">How much does each person put in?</label>

            <AmountField
              value={amount}
              onChange={setAmount}
              invalid={amount.trim() !== "" && !amountValid}
            />

            <p className="hint" id="amount-hint">
              {amount.trim() !== "" && !amountValid
                ? "Enter an amount like 50 or 50.00."
                : "Everyone puts in the same amount, every round."}
            </p>

            {/*
              The consequence of the number above, in the same block of the
              page rather than in a sentence further down. This is the figure
              that decides whether someone can afford to be in the circle at
              all, and it is not the one they typed.
            */}
            <div className="needline" aria-live="polite">
              <span className="needline-key">Each person needs</span>
              <span className="needline-value">
                {formattedPerPerson ? (
                  <Changing value={formattedPerPerson}>
                    {formattedPerPerson}
                  </Changing>
                ) : (
                  <span className="is-unset">
                    {amountValid ? "Add people first" : "Set an amount"}
                  </span>
                )}
              </span>
              {formattedPerPerson && (
                <span className="needline-why">
                  {members.length - 1}{" "}
                  {members.length - 1 === 1 ? "round" : "rounds"} of{" "}
                  {amount.trim()}, plus the network charge
                </span>
              )}
            </div>
          </Step>

          {/* ------------------------------------------ 02 the schedule */}
          <Step n={2} title="The schedule" done={stepDone[1]} active={activeStep === 1}>
            <span className="field-label" id="period-label">
              How often?
            </span>
            <div role="group" aria-labelledby="period-label">
              <PeriodPicker
                options={FREQUENCIES}
                value={period}
                onChange={setPeriod}
              />
            </div>

            {firstPayout && (
              <p className="step-live" aria-live="polite">
                First payout{" "}
                <strong>{whenFor(firstPayout, periodSeconds)}</strong>, then{" "}
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
          </Step>

          {/* --------------------------------------------- 03 who's in */}
          <Step n={3} title="Who’s in" done={stepDone[2]} active={activeStep === 2}>
            <p className="hint" style={{ margin: "0 0 1rem" }}>
              In the order they’ll be paid. You can paste a whole list into any
              address box.
            </p>

            <MemberRows rows={rows} setRows={setRows} you={you} />

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
          </Step>
        </div>

        <aside className="build-side">
          <div className="recap">
            <span className="recap-head">Your circle</span>

            <dl className="recap-rows">
              <div>
                <dt>Each person puts in</dt>
                <dd>
                  {amountValid ? (
                    <Changing value={amount.trim()}>
                      {amount.trim()} USDC
                    </Changing>
                  ) : (
                    <span className="is-unset">Not set yet</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>How often</dt>
                <dd>
                  <Changing value={period}>{everyInWords(BigInt(period))}</Changing>
                </dd>
              </div>
              <div>
                <dt>People</dt>
                <dd>
                  {members.length > 0 ? (
                    <Changing value={members.length}>{members.length}</Changing>
                  ) : (
                    <span className="is-unset">Nobody added yet</span>
                  )}
                </dd>
              </div>
              {myTurn > 0 && (
                <div>
                  <dt>You are paid</dt>
                  <dd>
                    <Changing value={myTurn}>{ordinal(myTurn)}</Changing>
                  </dd>
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

            {/*
              The line under the rule: what someone has to actually hold. A
              receipt puts its total below a divider because everything above
              it is working and this is the answer.
            */}
            <div className="recap-total">
              <dt>Each person needs</dt>
              <dd>
                {formattedPerPerson ? (
                  <Changing value={formattedPerPerson}>
                    {formattedPerPerson}
                  </Changing>
                ) : (
                  <span className="is-unset">
                    {amountValid ? "Once you add people" : "Once you set the amount"}
                  </span>
                )}
              </dd>
            </div>

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
