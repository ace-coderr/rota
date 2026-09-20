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
      <h1>Rota</h1>
      <p>
        A rotating savings circle settled in USDC on Arc. Rota never holds your
        money.
      </p>

      <ul>
        <li>
          <Link href="/create">Start a circle</Link>
        </li>
        <li>
          {/* Joining a circle means opening it and approving, so it needs an
              id. Anyone who was added as a member is already in it. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) router.push(`/circle/${id}`);
            }}
          >
            <label htmlFor="circleId">Join a circle — circle id: </label>
            <input
              id="circleId"
              inputMode="numeric"
              value={circleId}
              onChange={(event) => setCircleId(event.target.value)}
              placeholder="0"
            />
            <button type="submit" disabled={!valid}>
              Open
            </button>
            {id !== "" && !valid && (
              <span role="alert"> Circle id must be a whole number.</span>
            )}
          </form>
        </li>
      </ul>
    </main>
  );
}
