"use client";

import { useEffect, useRef, useState } from "react";
import { isAddress } from "viem";

export type Row = { id: string; address: string; name: string };

export const MAX_MEMBERS = 20;

let counter = 0;
export const newRow = (): Row => ({
  id: `row-${++counter}`,
  address: "",
  name: "",
});

/** Anything that is wrong with one row, judged against all the others. */
export function rowProblem(
  rows: Row[],
  index: number,
  you: string | undefined,
): string | undefined {
  const value = rows[index].address.trim();
  if (value === "") return undefined;
  if (!isAddress(value)) {
    return "That isn’t a wallet address — they start with 0x and are 42 characters.";
  }
  const first = rows.findIndex(
    (r) => r.address.trim().toLowerCase() === value.toLowerCase(),
  );
  if (first !== index) return `Already listed as person ${first + 1}.`;
  void you;
  return undefined;
}

/**
 * One row per person, rather than a textarea people have to guess the format
 * of. The order of the rows is the order they are paid, which is why they can
 * be moved rather than only added and removed.
 *
 * Each row is built to read as somebody: a position in the rotation, then
 * their address, then their name with an initial that appears as it is
 * typed. The reorder and remove controls stay out of the way until the row is
 * hovered or holds focus — three permanently greyed buttons on every row is
 * a wall of disabled-looking furniture around the two fields that matter.
 *
 * Pasting several lines into any address field still works, because that is
 * how anyone who already has a list will try to use this.
 */
export function MemberRows({
  rows,
  setRows,
  you,
}: {
  rows: Row[];
  setRows: (next: Row[]) => void;
  you: string | undefined;
}) {
  /** The row added by the last press of "Add person", if any. */
  const [entered, setEntered] = useState<string | undefined>();
  const enteredField = useRef<HTMLInputElement | null>(null);

  /*
   * A row someone asked for should be a row they can type in. Without this
   * the cursor stays on the Add button, which on a phone means the keyboard
   * closes and the new field has to be found and tapped.
   */
  useEffect(() => {
    if (entered) enteredField.current?.focus();
  }, [entered]);

  const update = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to], next[index]];
    setRows(next);
  };

  const add = () => {
    const row = newRow();
    setRows([...rows, row]);
    setEntered(row.id);
  };

  /**
   * A multi-line paste becomes rows. Each line may be "0x… Name", which is
   * the shape the old textarea accepted, so a list copied out of it still
   * lands correctly.
   */
  const onPaste = (index: number) => (event: React.ClipboardEvent) => {
    const text = event.clipboardData.getData("text");
    if (!/[\r\n]/.test(text.trim())) return;
    event.preventDefault();

    const parsed = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [address, ...rest] = line.split(/[\s,]+/);
        return { ...newRow(), address, name: rest.join(" ").trim() };
      });
    if (parsed.length === 0) return;

    const next = [...rows];
    next.splice(index, 1, ...parsed);
    setRows(next.slice(0, MAX_MEMBERS));
  };

  return (
    <div className="people">
      <ol className="people-list">
        {rows.map((row, index) => {
          const problem = rowProblem(rows, index, you);
          const isYou =
            you !== undefined &&
            row.address.trim().toLowerCase() === you.toLowerCase();
          const initial = row.name.trim().charAt(0).toUpperCase();

          return (
            <li
              className={`prow${row.id === entered ? " is-new" : ""}`}
              key={row.id}
            >
              <span className="prow-pos" aria-hidden="true">
                {index + 1}
              </span>

              <div className="prow-fields">
                <input
                  ref={row.id === entered ? enteredField : undefined}
                  aria-label={`Wallet address for person ${index + 1}`}
                  value={row.address}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="0x…"
                  className={`prow-addr${problem ? " is-wrong" : ""}`}
                  aria-invalid={problem ? true : undefined}
                  onPaste={onPaste(index)}
                  onChange={(e) => update(index, { address: e.target.value })}
                />

                <div className="prow-named">
                  {/*
                    The slot is always here and always the same width, so the
                    name field does not jump sideways on the first keystroke.
                    It only draws itself once there is a letter to show.
                  */}
                  <span
                    className="prow-avatar"
                    data-filled={initial ? "" : undefined}
                    aria-hidden="true"
                  >
                    {initial}
                  </span>
                  <input
                    aria-label={`Name for person ${index + 1}, optional`}
                    value={row.name}
                    className="prow-name"
                    placeholder="Name (optional)"
                    onChange={(e) => update(index, { name: e.target.value })}
                  />
                </div>
              </div>

              <div className="prow-tools">
                <button
                  type="button"
                  className="row-btn"
                  aria-label={`Move person ${index + 1} earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="row-btn"
                  aria-label={`Move person ${index + 1} later`}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="row-btn"
                  aria-label={`Remove person ${index + 1}`}
                  disabled={rows.length <= 2}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>

              {isYou && !problem && <p className="row-note">That’s you.</p>}
              {problem && (
                <p className="row-problem" role="alert">
                  {problem}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {/*
        Deliberately outside the button system, like .text-action is. The
        system's job is to make decisions look identical to each other; this
        is an opening in the list rather than a decision, and a dashed edge
        the width of the rows says "another one goes here" without competing
        with the one filled button on the screen.
      */}
      <button
        type="button"
        className="add-person"
        disabled={rows.length >= MAX_MEMBERS}
        onClick={add}
      >
        <span aria-hidden="true">+</span> Add person
      </button>

      {rows.length >= MAX_MEMBERS && (
        <p className="hint">A circle can have at most {MAX_MEMBERS} people.</p>
      )}
    </div>
  );
}
