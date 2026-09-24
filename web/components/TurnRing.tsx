/**
 * The circle at one moment in its rotation: every seat hollow except the one
 * being paid.
 *
 * It is the brand mark with the ring size taken from the actual circle rather
 * than fixed at eight, so a record of six turns is six drawings of the same
 * ring with the solid dot one seat further round. Someone can read who was
 * paid when without reading a single word.
 *
 * Server-renderable: no state, no effects, currentColor throughout.
 */
const STROKE = 1.25;

export function TurnRing({
  seats,
  active,
  size = 40,
}: {
  seats: number;
  active: number;
  size?: number;
}) {
  // A ring of one is a dot, and a ring of nought cannot be drawn at all.
  const count = Math.max(1, seats);

  // Chosen so the dots never touch, however many there are: at 20 members the
  // gap between neighbours is still wider than a dot.
  const view = 40;
  const centre = view / 2;
  const radius = 14;
  const dot = count > 12 ? 1.6 : count > 8 ? 2 : 2.4;

  return (
    <svg
      className="turn-ring"
      viewBox={`0 0 ${view} ${view}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth={STROKE}
      />
      {Array.from({ length: count }, (_, index) => {
        // Top first, then clockwise — the same order the payout list is in.
        const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
        const x = centre + radius * Math.cos(angle);
        const y = centre + radius * Math.sin(angle);
        const paid = index === active;
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={dot}
            fill={paid ? "currentColor" : "none"}
            stroke="currentColor"
            strokeOpacity={paid ? 1 : 0.55}
            strokeWidth={STROKE}
          />
        );
      })}
    </svg>
  );
}
