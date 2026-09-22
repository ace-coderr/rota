"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The editorial volume: the argument for trusting Rota, made with type alone.
 * No imagery, no logos, nothing borrowed.
 */
export default function Home() {
  const router = useRouter();
  const [circleId, setCircleId] = useState("");

  const id = circleId.trim();
  const valid = /^\d+$/.test(id);

  return (
    <>
      <header className="hero">
        <div className="band-inner">
          <span className="label label-rule">Rota / Savings circles on Arc</span>
          <h1 className="display">
            Save
            <br />
            together,
            <br />
            <em>take turns.</em>
          </h1>
        </div>
      </header>

      <section className="band band-blue">
        <div className="band-inner">
          <p className="lede" style={{ marginBottom: 0, fontWeight: 600 }}>
            Everyone puts in the same amount each round, and one person receives
            everyone&rsquo;s share. Next round, someone else does — until
            everyone has had a turn.
          </p>
        </div>
      </section>

      <section className="band band-cream">
        <div className="band-inner">
          <span className="label label-rule">01 / How it works</span>
          <ol className="steps">
            <li className="step">
              <span className="step-n">01</span>
              <div className="step-body">
                <h3>Agree the amount</h3>
                <p>
                  One person sets up the circle: how much each person puts in,
                  how often, and who is in it.
                </p>
              </div>
            </li>
            <li className="step">
              <span className="step-n">02</span>
              <div className="step-body">
                <h3>Everyone joins</h3>
                <p>
                  Each member gives Rota permission to move their share when
                  their turn comes round. Nothing moves yet.
                </p>
              </div>
            </li>
            <li className="step">
              <span className="step-n">03</span>
              <div className="step-body">
                <h3>Take turns</h3>
                <p>
                  Each round, everyone&rsquo;s share goes straight to whoever&rsquo;s
                  turn it is. Wallet to wallet, in one go.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="band band-dark">
        <div className="band-inner">
          <span className="label label-rule">02 / The promise</span>
          <h2 className="display-sm" style={{ marginBottom: "1.5rem" }}>
            Your money never leaves your wallet until it&rsquo;s someone&rsquo;s
            turn to be paid.
          </h2>
          <p style={{ fontSize: "1.125rem" }}>
            Rota can&rsquo;t hold your money, and can&rsquo;t take it. There is
            no pooled account and no balance sitting anywhere — each person&rsquo;s
            share moves directly to the person being paid, at the moment
            it&rsquo;s paid.
          </p>
          <p style={{ fontSize: "1.125rem" }}>
            You can withdraw your permission at any time, from inside the app.
          </p>
        </div>
      </section>

      <section className="band band-cream">
        <div className="band-inner">
          <span className="label label-rule">03 / What it costs</span>
          <p className="display-sm" style={{ marginBottom: "1rem" }}>
            A 20-person round settles for under 2 cents.
          </p>
          <p>
            Measured on Arc, where the network charge is paid in the same USDC
            you&rsquo;re saving — so there&rsquo;s no second currency to buy or
            keep topped up.
          </p>
        </div>
      </section>

      <section className="band band-dark">
        <div className="band-inner">
          <span className="label label-rule">04 / Start</span>

          <Link href="/create" className="btn" style={{ marginBottom: "1rem" }}>
            Start a circle
          </Link>
          <p style={{ color: "var(--on-dark)", fontSize: "1.0625rem" }}>
            You&rsquo;ll need the wallet address of everyone joining.
          </p>

          <hr
            className="divider"
            style={{ borderColor: "var(--edge-dark)", margin: "2.5rem 0" }}
          />

          <span className="label">Already been invited?</span>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) router.push(`/circle/${id}`);
            }}
          >
            <div className="field" style={{ marginBottom: "1rem" }}>
              <label htmlFor="circleId" style={{ color: "var(--on-dark)" }}>
                Enter the circle number you were given
              </label>
              <input
                id="circleId"
                inputMode="numeric"
                value={circleId}
                onChange={(event) => setCircleId(event.target.value)}
                placeholder="for example, 1"
              />
              {id !== "" && !valid && (
                <p
                  className="hint"
                  role="alert"
                  style={{ color: "var(--on-dark)" }}
                >
                  A circle number is digits only, like 1 or 12.
                </p>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={!valid}
              style={{ color: "var(--white)", borderColor: "var(--white)" }}
            >
              Open my circle
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
