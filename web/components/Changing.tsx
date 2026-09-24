"use client";

import type { ReactNode } from "react";

/**
 * A value that shows it has just changed.
 *
 * The recap sits beside the form rather than under the field being edited, so
 * a figure can change several inches from where someone is looking and they
 * will not see it happen. This is the whole of the motion budget on this
 * page: a quarter of a second of settle, on a value that actually moved.
 *
 * The key is what does the work — a new `value` gives the span a new key, so
 * React replaces the element and the animation runs from the start. Without
 * it the same node is reused, the animation never restarts, and nothing
 * moves. Reduced motion turns it off in CSS; the value is correct either way,
 * because the animation only ever fades something already in the DOM.
 */
export function Changing({
  value,
  children,
}: {
  value: string | number;
  children: ReactNode;
}) {
  return (
    <span className="changing" key={String(value)}>
      {children}
    </span>
  );
}
