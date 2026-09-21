"use client";

import type { TxFailure } from "@/lib/errors";

const toneClass = {
  calm: "notice notice-calm",
  wait: "notice notice-wait",
  stop: "notice notice-stop",
} as const;

/**
 * A failure, said once, in a sentence. No error names, no revert strings, no
 * addresses — the functional pass surfaced those; this one does not.
 */
export function ErrorNotice({ failure }: { failure: TxFailure | undefined }) {
  if (!failure) return null;

  return (
    <div className={toneClass[failure.tone]} role="alert">
      <p className="notice-title">{failure.title}</p>
      {failure.detail && <p className="small">{failure.detail}</p>}
    </div>
  );
}
