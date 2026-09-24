"use client";

export type Frequency = {
  /** On the button. */
  pill: string;
  /** In a sentence. */
  label: string;
  seconds: string;
};

/**
 * Five options, all of them on screen.
 *
 * This was a native select, which hides four of its five choices behind a
 * click — and the two short ones were the four-and-fifth, so a report came
 * back that hourly and daily had not shipped when they were in the build the
 * whole time. A control that hides the thing you are looking for is
 * indistinguishable from a control that does not have it.
 *
 * Real radios under the pills, not buttons with aria-checked: arrow-key
 * movement between options, the roving focus and the group semantics all
 * come free and correct, and they submit with the form.
 */
export function PeriodPicker({
  options,
  value,
  onChange,
}: {
  options: readonly Frequency[];
  value: string;
  onChange: (seconds: string) => void;
}) {
  return (
    <div className="pick">
      {options.map((option) => (
        <label className="pick-opt" key={option.seconds}>
          <input
            type="radio"
            name="period"
            value={option.seconds}
            checked={value === option.seconds}
            onChange={() => onChange(option.seconds)}
          />
          <span>{option.pill}</span>
        </label>
      ))}
    </div>
  );
}
