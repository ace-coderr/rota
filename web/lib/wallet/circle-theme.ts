import type {
  Resources,
  ThemeColor,
} from "@circle-fin/w3s-pw-web-sdk/dist/src/types";

import { markSvg } from "../mark";

/**
 * Rota's palette, applied to Circle's verification modal.
 *
 * WHAT THIS CAN AND CANNOT REACH, because it matters for what you see.
 *
 * The modal is an iframe served from https://pw-auth.circle.com. It is a
 * different origin, so nothing in this app's stylesheets can touch it — not a
 * global rule, not an injected style tag, not a :has() selector on the parent.
 * The ONLY channel in is the postMessage the SDK sends when you call
 * setThemeColor / setResources / setLocalizations. If a property is not a key
 * on one of those objects, it is genuinely unreachable rather than awkward.
 *
 * Reachable, and set below:
 *   - every surface, text, input, divider and button colour (~50 tokens)
 *   - the icons, including the blue circle on the email step
 *   - ONE font family for the whole modal
 *
 * NOT reachable, and left alone on purpose rather than worked around:
 *
 *   1. BORDER RADIUS. There is no radius, corner or shape token anywhere in
 *      the SDK's ThemeColor type. The modal, its inputs and its buttons keep
 *      Circle's rounded corners, and every other control in Rota is square.
 *      This is the one visible break and there is no way to close it from
 *      here.
 *
 *   2. TWO TYPEFACES. Resources.fontFamily is a single { name, url } for the
 *      entire modal — there is no per-element typography, so the code input
 *      cannot be given IBM Plex Mono while the prose keeps Source Sans 3.
 *      The modal is mostly sentences and buttons, with one six-digit field,
 *      so the single family goes to Source Sans 3 and the code renders in the
 *      body face. Setting it the other way would put every sentence in mono
 *      to fix one field.
 *
 *   3. FONT SIZE, WEIGHT AND TRACKING. Same reason: family only.
 */

/*
 * Straight from globals.css. Repeated as literals because this crosses an
 * origin boundary — the iframe cannot resolve a CSS custom property, so these
 * have to travel as values. If the palette changes there, it changes here.
 */
const INK = "#0a0a0a";
const CREAM = "#f0eee9";
const CREAM_SOFT = "#b9b5ab"; // --on-dark-soft
const EDGE_DARK = "#2a2a28";
const BLUE = "#0a1eff";
const BLUE_DEEP = "#0717c4";
/* The app's warn colour FOR DARK SURFACES. Near-black makes the light-surface
   red (#a3200f) almost unreadable, which is why .nav and .band-dark already
   swap to this amber. */
const WARN_ON_DARK = "#f5a524";

/** Browser-safe, unlike lib/mark's Buffer-based one. This runs client-side. */
function svgUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/*
 * width and height are not optional here.
 *
 * An SVG with a viewBox and no intrinsic size has none, and a browser asked to
 * render it without CSS dimensions falls back to 150x150 — measured, not
 * assumed. Inside our own pages that never shows, because every use sets a
 * size; inside Circle's iframe we do not control the img tag, so the icon has
 * to carry its own dimensions or risk arriving six times too big.
 */
function stroke(path: string, colour = CREAM, width = 1.75) {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ` +
      `width="24" height="24" fill="none" ` +
      `stroke="${colour}" stroke-width="${width}" stroke-linecap="square">${path}</svg>`,
  );
}

/**
 * Icons.
 *
 * These are not decoration. Circle's defaults are drawn for a white modal, so
 * on a near-black one the close and back controls are black on black — the
 * modal would look like it had no way out. Replacing them is the difference
 * between a themed modal and a broken one.
 */
/* Typed against the SDK's own interface: a misspelled key is a build error
   here, where the alternative is the iframe quietly ignoring it. */
export const circleResources: Resources = {
  // The blue circle on the email step becomes Rota's mark.
  emailIcon: svgUri(markSvg({ colour: CREAM })),
  naviClose: stroke('<path d="M5 5 L19 19"/><path d="M19 5 L5 19"/>'),
  naviBack: stroke('<path d="M14 5 L7 12 L14 19"/>'),
  dropdownArrow: stroke('<path d="M6 9.5 L12 15.5 L18 9.5"/>'),
  selectCheckMark: stroke('<path d="M5 12.5 L10 17.5 L19 6.5"/>'),
  errorInfo: stroke(
    '<circle cx="12" cy="12" r="9"/><path d="M12 7 L12 13"/><path d="M12 16.5 L12 17"/>',
    WARN_ON_DARK,
  ),
  tipIcon: stroke(
    '<circle cx="12" cy="12" r="9"/><path d="M12 11 L12 17"/><path d="M12 7 L12 7.5"/>',
    CREAM_SOFT,
  ),
  fontFamily: {
    name: "Source Sans 3",
    url: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap",
  },
};

/**
 * Colour.
 *
 * Two rules carried over from the app rather than invented here:
 *
 * - On a near-black surface the accent blue is not a text colour. #0a1eff on
 *   #0a0a0a is 2.9:1, which fails for text and is marginal even for a shape,
 *   which is why globals.css already resets --focus-ring to cream on .nav,
 *   .foot and .band-dark. Blue appears here only as a button FILL, with cream
 *   on top of it at 8.6:1 — the same way the app uses it, one filled button
 *   per screen.
 *
 * - Disabled is its own inert state, not a faded active one. The SDK gives a
 *   primary button no disabled border, only a background, so the closest
 *   available is a muted fill rather than the app's hairline-and-no-fill.
 *   That is a small divergence and it is deliberate.
 */
export const circleTheme: ThemeColor = {
  backdrop: INK,
  backdropOpacity: 0.72,
  bg: INK,
  divider: EDGE_DARK,

  textMain: CREAM,
  textMain2: CREAM,
  textAuxiliary: CREAM_SOFT,
  textAuxiliary2: CREAM_SOFT,
  textSummary: CREAM_SOFT,
  textSummaryHighlight: CREAM,
  textPlaceholder: CREAM_SOFT,
  textDetailToggle: CREAM,
  textInteractive: CREAM,
  interactiveBg: INK,

  /*
   * Rota has no green. Success reads as ordinary cream emphasis rather than
   * borrowing a colour the rest of the app never uses — the alternative was
   * inventing one, and the palette is meant to be closed.
   */
  success: CREAM,
  error: WARN_ON_DARK,

  // The modal titles ship with a purple-to-blue gradient. Two identical stops
  // is how you turn a gradient off through an API that only takes gradients.
  titleGradients: [CREAM, CREAM],

  inputBg: INK,
  inputBgDisabled: EDGE_DARK,
  inputText: CREAM,
  inputBorderFocused: CREAM,
  inputBorderFocusedError: WARN_ON_DARK,

  dropdownBg: INK,
  dropdownBorderIsOpen: CREAM,
  dropdownBorderError: WARN_ON_DARK,

  // The six-digit code's dots.
  pinDotBase: INK,
  pinDotBaseBorder: CREAM_SOFT,
  pinDotActivated: CREAM,
  enteredPinText: CREAM,

  mainBtnBg: BLUE,
  mainBtnBgOnHover: BLUE_DEEP,
  mainBtnBgDisabled: EDGE_DARK,
  mainBtnText: CREAM,
  mainBtnTextOnHover: CREAM,
  mainBtnTextDisabled: CREAM_SOFT,

  secondBtnText: CREAM,
  secondBtnTextOnHover: CREAM,
  secondBtnTextDisabled: CREAM_SOFT,
  secondBtnBorder: CREAM,
  secondBtnBorderOnHover: CREAM,
  secondBtnBorderDisabled: EDGE_DARK,
  secondBtnBgOnHover: EDGE_DARK,

  plainBtnText: CREAM,
  plainBtnTextOnHover: CREAM,
  plainBtnTextDisabled: CREAM_SOFT,
  plainBtnBg: INK,
  plainBtnBgOnHover: EDGE_DARK,

  // A cream panel on a near-black modal, the same inversion the navbar's
  // dropdown uses.
  tooltipBg: CREAM,
  tooltipText: INK,

  recoverPinHintTitle: INK,
  recoverPinHintTitleBg: CREAM,
  recoverPinHint: CREAM_SOFT,
};
