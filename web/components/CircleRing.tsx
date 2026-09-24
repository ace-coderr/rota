"use client";

import { useEffect, useRef } from "react";

/**
 * The product, drawn.
 *
 * Eight members on a ring. One is highlighted — it is their turn. A token
 * leaves every other member and travels into them, which is exactly what
 * `disburse` does: wallet to wallet, nothing pooled in the middle. Then the
 * highlight advances to the next seat and it happens again.
 *
 * WHY THERE IS NO STATE HERE. The earlier version advanced the turn with
 * setInterval and re-keyed the tokens so their CSS animation restarted. Two
 * clocks — a JS timer and a CSS animation — drift apart, and a background tab
 * throttles the timer while the animation carries on, so the tokens end up
 * arriving at a seat that is no longer lit. This version has one clock. The
 * fan of spokes is identical every turn, just rotated 45°, so the advance is
 * a rotation of one group; at 48s it is exactly eight 6s token cycles, which
 * means the two animations cannot come apart however long the page is left
 * open. It also costs no renders, no timers and no main-thread work at all.
 *
 * Drawn from scratch with maths, not traced from anything: seats come from
 * cos/sin around a circle, and the tokens are translated along the vector to
 * the recipient.
 */
const MEMBERS = 8;
const CENTRE = 200;
const RADIUS = 140;

/** How far the ring leans toward the pointer. Enough to feel answered. */
const TILT_DEGREES = 3;

function seatAt(index: number) {
  // Start at the top and go clockwise, so the ring reads like a clock face.
  const angle = (index / MEMBERS) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTRE + RADIUS * Math.cos(angle),
    y: CENTRE + RADIUS * Math.sin(angle),
  };
}

const SEATS = Array.from({ length: MEMBERS }, (_, i) => seatAt(i));

/*
 * Inside the fan, the recipient is always seat 0. The group is what rotates,
 * so this one drawing serves all eight turns.
 */
const RECIPIENT = SEATS[0];
const PAYERS = SEATS.map((seat, index) => ({ seat, index })).filter(
  (s) => s.index !== 0,
);

/**
 * Opposite seats leave together, so the money arrives in symmetrical pairs
 * rather than sweeping round the ring like a second hand. Nearest first: the
 * fan closes inward, which is the shape of everyone paying one person.
 */
const departure = (index: number) =>
  Math.min(index, MEMBERS - index) * 130 - 130;

export function CircleRing() {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = wrap.current;
    if (!node) return;

    // A touch pointer has no hover position to answer, and anyone who has
    // asked for less motion has asked for this too.
    if (
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let frame = 0;
    let pointerX = 0;

    const apply = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0) return;
      const offset = (pointerX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const tilt = Math.max(-1, Math.min(1, offset)) * TILT_DEGREES;
      // Written straight to the node. Routing three degrees of lean through
      // React state would re-render the whole ring on every mouse move.
      node.style.setProperty("--tilt", `${tilt.toFixed(2)}deg`);
    };

    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="ring-wrap" ref={wrap}>
      <svg
        viewBox="0 0 400 400"
        role="img"
        aria-label={`A ring of ${MEMBERS} members. Each round, everyone's share moves straight to the one person whose turn it is, and then the turn passes on.`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Leans toward the pointer. Everything else sits inside it. */}
        <g className="ring-lean">
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

          {/* The eight seats. Symmetrical, so they do not rotate with the fan. */}
          {SEATS.map((seat, index) => (
            <circle
              key={`seat-${index}`}
              cx={seat.x}
              cy={seat.y}
              r="8"
              fill="none"
              stroke="#f0eee9"
              strokeWidth="1.5"
              strokeOpacity="0.75"
            />
          ))}

          {/*
            One turn, drawn once. The group rotates 45° at the end of every
            cycle, which is what makes the highlight advance rather than jump:
            the filled seat physically travels to the next chair.
          */}
          <g className="ring-fan">
            {/* Spokes, from everyone paying to the one being paid. */}
            {PAYERS.map(({ seat, index }) => (
              <line
                key={`spoke-${index}`}
                className="spoke"
                x1={seat.x}
                y1={seat.y}
                x2={RECIPIENT.x}
                y2={RECIPIENT.y}
                stroke="#f0eee9"
                strokeWidth="1"
                style={{ animationDelay: `${departure(index)}ms` }}
              />
            ))}

            {/*
              Arrival, drawn as water: two rings out of the seat as the last
              of the money lands. Scaled rather than re-radiused, so it is a
              compositor transform and never touches layout.
            */}
            <circle
              className="ripple"
              cx={RECIPIENT.x}
              cy={RECIPIENT.y}
              r="34"
              fill="none"
              stroke="#0a1eff"
              strokeWidth="1.5"
            />
            <circle
              className="ripple ripple-late"
              cx={RECIPIENT.x}
              cy={RECIPIENT.y}
              r="34"
              fill="none"
              stroke="#f0eee9"
              strokeWidth="1"
            />

            {/* Whose turn it is. Filled, and the only blue on the ring. */}
            <circle
              className="seat-live"
              cx={RECIPIENT.x}
              cy={RECIPIENT.y}
              r="9"
              fill="#0a1eff"
              stroke="#0a1eff"
              strokeWidth="1.5"
            />

            {/*
              The money. Each token starts on a payer and is translated the
              exact distance to the recipient — the same straight line the
              transfer takes.
            */}
            {PAYERS.map(({ seat, index }) => (
              <circle
                key={`token-${index}`}
                className="token"
                cx={seat.x}
                cy={seat.y}
                r="4"
                fill="#f0eee9"
                style={
                  {
                    "--dx": `${RECIPIENT.x - seat.x}px`,
                    "--dy": `${RECIPIENT.y - seat.y}px`,
                    animationDelay: `${departure(index)}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
