import {
  CENTRE,
  EXTENT,
  LOCKUP,
  STACKED,
  STROKE,
  VIEW,
  WORD_SIZE,
  WORD_WEIGHT,
  seats,
} from "@/lib/mark";

/**
 * Rota's mark and wordmark.
 *
 * Eight seats on a circle, seven hollow and one solid: whose turn it is. The
 * solid seat sits at the top right rather than on an axis, so the ring reads
 * as part-way round rather than parked.
 *
 * Everything is drawn in currentColor, so a lockup takes the colour of
 * whatever it is placed on and nothing needs a light and a dark version.
 */

type LogoProps = {
  /**
   * Height of the mark's drawing grid, in pixels. The horizontal lockup and
   * the mark alone render it at exactly this size; the stacked lockup draws
   * it larger on purpose (see MARK_SCALE).
   */
  size?: number;
  /** Overrides the inherited colour. Leave unset to inherit. */
  color?: string;
  /**
   * What a screen reader hears. Pass an empty string where the logo sits
   * beside the same words in text and would only be read twice.
   */
  label?: string;
  className?: string;
};

/** The eight seats, as elements. Shared by all three lockups. */
function Seats({ dx = 0 }: { dx?: number }) {
  return (
    <>
      {seats().map((seat, i) =>
        seat.solid ? (
          <circle
            key={i}
            cx={seat.x + dx}
            cy={seat.y}
            r={seat.r}
            fill="currentColor"
          />
        ) : (
          <circle
            key={i}
            cx={seat.x + dx}
            cy={seat.y}
            r={seat.r}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
          />
        ),
      )}
    </>
  );
}

function wrapper(label: string | undefined, color: string | undefined) {
  return {
    ...(label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true }),
    ...(color ? { style: { color } } : {}),
  };
}

/** The mark alone. Square. */
export function RotaMark({
  size = 32,
  color,
  label = "Rota",
  className,
}: LogoProps) {
  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      className={className}
      {...wrapper(label, color)}
    >
      <Seats />
    </svg>
  );
}

/**
 * The word, as SVG text.
 *
 * textLength fixes the width whatever font resolves, so a webfont arriving
 * late cannot push the wordmark out of its own box; lengthAdjust="spacing"
 * spends the difference on tracking without stretching the letterforms.
 */
function Word({
  x,
  y,
  textLength,
  anchor,
}: {
  x: number;
  y: number;
  textLength: number;
  anchor?: "middle";
}) {
  return (
    <text
      x={x}
      y={y}
      textLength={textLength}
      lengthAdjust="spacing"
      textAnchor={anchor}
      fill="currentColor"
      fontFamily="var(--font-display), Oswald, 'Arial Narrow', sans-serif"
      fontWeight={WORD_WEIGHT}
      fontSize={WORD_SIZE}
    >
      ROTA
    </text>
  );
}

/** Mark left, word right, cap height centred on the mark. */
export function RotaWordmark({
  size = 32,
  color,
  label = "Rota",
  className,
}: LogoProps) {
  const scale = size / VIEW;
  return (
    <svg
      viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.height}`}
      width={LOCKUP.width * scale}
      height={LOCKUP.height * scale}
      className={className}
      {...wrapper(label, color)}
    >
      <Seats />
      <Word x={LOCKUP.x} y={LOCKUP.baseline} textLength={LOCKUP.textLength} />
    </svg>
  );
}

/** Mark above, word below, both on the same optical centre line. */
export function RotaWordmarkStacked({
  size = 32,
  color,
  label = "Rota",
  className,
}: LogoProps) {
  const scale = size / VIEW;
  return (
    <svg
      viewBox={`0 0 ${STACKED.width} ${STACKED.height}`}
      width={STACKED.width * scale}
      height={STACKED.height * scale}
      className={className}
      {...wrapper(label, color)}
    >
      <g transform={`translate(${STACKED.markOffset} 0) scale(${STACKED.scale})`}>
        <Seats />
      </g>
      <Word
        x={STACKED.x}
        y={STACKED.baseline}
        textLength={STACKED.textLength}
        anchor="middle"
      />
    </svg>
  );
}

/** Where the mark's ink ends, for anyone aligning something to it. */
export const MARK_INK_EDGE = CENTRE + EXTENT;
