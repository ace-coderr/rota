"use client";

import type { TxFailure } from "@/lib/errors";

/**
 * Renders a classified failure. The raw contract error name / revert string is
 * shown on purpose during this functional pass so failures stay diagnosable.
 */
export function ErrorNotice({ failure }: { failure: TxFailure | undefined }) {
  if (!failure) return null;

  return (
    <div role="alert" data-kind={failure.kind}>
      <p>
        <strong>{failure.title}</strong>
      </p>
      {failure.detail && <p>{failure.detail}</p>}
      <p>
        <small>
          kind: <code>{failure.kind}</code>
          {failure.raw && (
            <>
              {" · "}on-chain error: <code>{failure.raw}</code>
            </>
          )}
        </small>
      </p>
    </div>
  );
}
