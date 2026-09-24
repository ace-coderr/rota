"use client";

/**
 * The most consequential number on the page, given the size to match.
 *
 * It was a 1.125rem text box identical to the optional name field beside it,
 * which said that choosing how much of your money to commit every round is
 * the same kind of decision as typing someone's nickname. It is not.
 *
 * The unit sits inside the field as a quiet suffix rather than in a filled
 * slab: a grey block welded to the right of an input reads as a second
 * control, and people try to click it.
 */
const QUICK = ["1", "5", "10", "25", "50"];

export function AmountField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
}) {
  const current = value.trim();

  return (
    <>
      <div className={`amount-box${invalid ? " is-wrong" : ""}`}>
        <input
          id="amount"
          className="amount-input"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
          aria-describedby="amount-hint"
          aria-invalid={invalid || undefined}
        />
        <span className="amount-unit" aria-hidden="true">
          USDC
        </span>
      </div>

      {/*
        The five amounts a circle actually gets set to. Buttons rather than a
        datalist, because the point is that they can be reached with one tap
        on a phone — which is where most of the typing of decimal amounts
        into a text field goes wrong.

        aria-pressed, not a radio group: these fill the field, they are not a
        separate choice from it. Typing 10 lights the 10.
      */}
      <div className="chips" role="group" aria-label="Common amounts">
        {QUICK.map((quick) => (
          <button
            key={quick}
            type="button"
            className="chip-pick"
            aria-pressed={current === quick}
            onClick={() => onChange(quick)}
          >
            {quick}
          </button>
        ))}
      </div>
    </>
  );
}
