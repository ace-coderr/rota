"use client";

import { useEffect, useState } from "react";

/**
 * The product, drawn.
 *
 * Eight members on a ring. One is highlighted — it is their turn. A token
 * leaves every other member and travels straight into them, which is exactly
 * what `disburse` does: wallet to wallet, nothing pooled in the middle. Then
 * the highlight moves on.
 *
 * Drawn from scratch with maths, not traced from anything: positions come from
 * cos/sin around a circle, and the tokens are translated along the vector to
 * the recipient. Thin strokes, cream and blue on near-black.
 */
const MEMBERS = 8;
const CENTRE = 200;
const RADIUS = 140;
const CYCLE_MS = 3000;

function seatAt(index: number) {
  // Start at the top and go clockwise, so the ring reads like a clock face.
  const angle = (index / MEMBERS) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTRE + RADIUS * Math.cos(angle),
    y: CENTRE + RADIUS * Math.sin(angle),
  };
}

const SEATS = Array.from({ length: MEMBERS }, (_, i) => seatAt(i));

export function CircleRing() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;

    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % MEMBERS),
      CYCLE_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  const recipient = SEATS[active];

  return (
    <div className="ring-wrap">
      <svg
        viewBox="0 0 400 400"
        role="img"
        aria-label={`A ring of ${MEMBERS} members. Each round, everyone's share moves straight to the one person whose turn it is.`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* The ring itself: a hairline, like every other border on the page. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke="#f0eee9"
          strokeOpacity="0.22"
          strokeWidth="1"
        />

        {/* Lines only from the people who are paying this round. */}
        {SEATS.map((seat, index) =>
          index === active ? null : (
            <line
              key={`line-${index}`}
              x1={seat.x}
              y1={seat.y}
              x2={recipient.x}
              y2={recipient.y}
              stroke="#f0eee9"
              strokeOpacity="0.14"
              strokeWidth="1"
            />
          ),
        )}

        {/* A soft mark under the recipient so the eye lands there first. */}
        <circle
          className="pulse"
          cx={recipient.x}
          cy={recipient.y}
          r={26}
          fill="#0a1eff"
          fillOpacity="0.35"
        />

        {/* Members. The recipient is filled; everyone else is an outline. */}
        {SEATS.map((seat, index) => {
          const isRecipient = index === active;
          return (
            <circle
              key={`seat-${index}`}
              cx={seat.x}
              cy={seat.y}
              r={isRecipient ? 11 : 8}
              fill={isRecipient ? "#0a1eff" : "none"}
              stroke={isRecipient ? "#0a1eff" : "#f0eee9"}
              strokeWidth="1.5"
              style={{ transition: "r 300ms ease, fill 300ms ease" }}
            />
          );
        })}

        {/*
          The money. Each token starts on a payer and is translated the exact
          distance to the recipient, staggered so they arrive in sequence.
          Keyed on `active` so the animation restarts when the turn advances.
        */}
        {SEATS.map((seat, index) => {
          if (index === active) return null;
          const dx = recipient.x - seat.x;
          const dy = recipient.y - seat.y;
          const order = (index - active + MEMBERS) % MEMBERS;

          return (
            <circle
              key={`token-${active}-${index}`}
              className="token"
              cx={seat.x}
              cy={seat.y}
              r="4"
              fill="#f0eee9"
              style={
                {
                  "--dx": `${dx}px`,
                  "--dy": `${dy}px`,
                  animationDelay: `${order * 90}ms`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </svg>
    </div>
  );
}
