"use client";

import { isAddress } from "viem";

import { Button } from "@/components/Button";

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
 * One row per member, rather than a textarea people have to guess the format
 * of. The order of the rows is the order people are paid, which is why they
 * can be moved rather than only added and removed.
 *
 * Pasting several lines into any address field still works, because that is
 * how anyone with a list already will try to use this.
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
  const update = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to], next[index]];
    setRows(next);
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
    <div className="rows">
      {rows.map((row, index) => {
        const problem = rowProblem(rows, index, you);
        const isYou =
          you !== undefined &&
          row.address.trim().toLowerCase() === you.toLowerCase();
        return (
          <div className="row" key={row.id}>
            <span className="row-n" aria-hidden="true">
              {index + 1}
            </span>

            <div className="row-fields">
              <input
                aria-label={`Wallet address for person ${index + 1}`}
                value={row.address}
                spellCheck={false}
                autoComplete="off"
                placeholder="0x…"
                className={`row-addr ${problem ? "is-wrong" : ""}`}
                onPaste={onPaste(index)}
                onChange={(e) => update(index, { address: e.target.value })}
              />
              <input
                aria-label={`Name for person ${index + 1}, optional`}
                value={row.name}
                placeholder="Name (optional)"
                onChange={(e) => update(index, { name: e.target.value })}
              />
            </div>

            <div className="row-tools">
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
          </div>
        );
      })}

      <Button
        size="sm"
        variant="secondary"
        disabled={rows.length >= MAX_MEMBERS}
        onClick={() => setRows([...rows, newRow()])}
      >
        Add person
      </Button>
      {rows.length >= MAX_MEMBERS && (
        <p className="hint">A circle can have at most {MAX_MEMBERS} people.</p>
      )}
    </div>
  );
}
