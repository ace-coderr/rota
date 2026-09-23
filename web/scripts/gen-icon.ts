/**
 * Writes app/icon.svg from lib/mark.ts.
 *
 * app/icon.svg has to be a literal file — Next serves it as-is and it cannot
 * import anything — so it is generated rather than hand-kept, and the mark
 * has exactly one definition. Re-run after changing the geometry:
 *
 *   node --experimental-strip-types scripts/gen-icon.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { markSvg } from "../lib/mark.ts";

/** Near-black on transparent, flipping to cream on a dark tab strip. */
const svg = markSvg({ colour: "#0A0A0A", dark: "#F0EEE9" });

const out = join(import.meta.dirname, "..", "app", "icon.svg");
writeFileSync(out, `${svg}\n`, "utf8");
console.log(`wrote ${out} (${svg.length} bytes)`);
