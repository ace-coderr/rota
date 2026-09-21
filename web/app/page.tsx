"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [circleId, setCircleId] = useState("");

  const id = circleId.trim();
  const valid = /^\d+$/.test(id);

  return (
    <main>
      <h1>Save together, take turns</h1>
      <p className="lede">
        Everyone puts in the same amount each round, and one person takes the
        whole pot. Next round, someone else does — until everyone has had a
        turn.
      </p>

      <div className="card card-quiet">
        <p style={{ marginBottom: "0.25rem" }}>
          <strong>Your money never leaves your wallet</strong> until it&rsquo;s
          someone&rsquo;s turn to be paid. Rota can&rsquo;t hold it, and
          can&rsquo;t take it.
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          A 20-person round settles for under 2 cents.
        </p>
      </div>

      <Link href="/create" className="btn" style={{ textDecoration: "none" }}>
        Start a circle
      </Link>
      <p className="action-note">
        You&rsquo;ll need the wallet address of everyone joining.
      </p>

      <hr className="divider" />

      <h2 style={{ marginTop: 0 }}>Already been invited?</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) router.push(`/circle/${id}`);
        }}
      >
        <div className="field">
          <label htmlFor="circleId">Enter the circle number you were given</label>
          <input
            id="circleId"
            inputMode="numeric"
            value={circleId}
            onChange={(event) => setCircleId(event.target.value)}
            placeholder="for example, 1"
          />
          {id !== "" && !valid && (
            <p className="hint" role="alert">
              A circle number is digits only, like 1 or 12.
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-secondary" disabled={!valid}>
          Open my circle
        </button>
      </form>
    </main>
  );
}
