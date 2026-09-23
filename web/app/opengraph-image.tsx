import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import {
  CAP_HEIGHT,
  CENTRE,
  EXTENT,
  LOCKUP,
  TRACKING,
  VIEW,
  WORD_SIZE,
  WORD_WEIGHT,
  markDataUri,
} from "@/lib/mark";

export const alt = "Rota — savings circles where nobody holds the pot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CREAM = "#F0EEE9";
const NEAR_BLACK = "#0A0A0A";
const BLUE = "#0A1EFF";

/*
 * Fonts are committed rather than fetched. Satori will not take woff2, which
 * is all next/font leaves behind, and a build that reaches for Google Fonts
 * is a build that can fail offline. Both faces are OFL — see
 * assets/FONT-LICENSE-OFL.txt.
 */
const oswaldBold = readFile(join(process.cwd(), "assets/Oswald-Bold.ttf"));
const oswald500 = readFile(join(process.cwd(), "assets/Oswald-Medium.ttf"));
const plexMono = readFile(join(process.cwd(), "assets/IBMPlexMono-Medium.ttf"));

/*
 * The horizontal lockup, rebuilt in flexbox because satori has no SVG text.
 * Every number below comes from lib/mark.ts, so the card's wordmark is the
 * same wordmark as the navbar's.
 */
const FONT = 184;
/** Grid units to pixels at this size. */
const UNIT = FONT / WORD_SIZE;
const MARK_PX = VIEW * UNIT;
const CAP_PX = FONT * CAP_HEIGHT;

/**
 * Oswald's ascent and descent are 1.193 and 0.289 em. With line-height 1 the
 * line box is centred on that 1.482em span, which leaves this much room above
 * the cap line — the offset needed to put the word's cap centre on the mark's
 * centre rather than its line box centre on it.
 */
const CAP_INSET = FONT * (1.193 - (1.193 + 0.289 - 1) / 2 - CAP_HEIGHT);
const WORD_TOP = MARK_PX / 2 - CAP_PX / 2 - CAP_INSET;
/**
 * The mark's <img> is its whole 32-unit grid, so its box runs a unit and a
 * half past its ink on each side. LOCKUP.x is where the SVG lockup puts the
 * text's origin, sidebearing already discounted, so measuring from the grid's
 * right edge reproduces the same gap here.
 *
 * Measured on the rendered PNG, not trusted: forgetting the R's sidebearing
 * put the word 11px too far right, which no amount of squinting would catch.
 */
const WORD_LEFT = (LOCKUP.x - VIEW) * UNIT;

/**
 * The mark's ink starts a unit and a half inside its box. Everything on this
 * card is left-aligned on its ink, so the box hangs left by that much.
 */
const MARK_BLEED = -(CENTRE - EXTENT) * UNIT;

export default async function OpenGraphImage() {
  const [bold, medium, mono] = await Promise.all([
    oswaldBold,
    oswald500,
    plexMono,
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: NEAR_BLACK,
          color: CREAM,
          padding: "72px 80px",
          fontFamily: "Oswald",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element --
              satori has no next/image, and this never reaches a browser. */}
          <img
            src={markDataUri({ colour: CREAM })}
            width={MARK_PX}
            height={MARK_PX}
            style={{ marginLeft: MARK_BLEED }}
            alt=""
          />
          <div
            style={{
              marginTop: WORD_TOP,
              marginLeft: WORD_LEFT,
              fontSize: FONT,
              fontWeight: WORD_WEIGHT,
              lineHeight: 1,
              letterSpacing: TRACKING * UNIT,
            }}
          >
            ROTA
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 500,
            lineHeight: 1.15,
            maxWidth: 720,
          }}
        >
          Savings circles where nobody holds the pot
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontFamily: "IBM Plex Mono",
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: 4,
            color: BLUE,
          }}
        >
          <div style={{ display: "flex" }}>ARC</div>
          <div style={{ display: "flex", opacity: 0.5 }}>/</div>
          <div style={{ display: "flex" }}>USDC</div>
          <div style={{ display: "flex", opacity: 0.5 }}>/</div>
          <div style={{ display: "flex" }}>NON-CUSTODIAL</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Oswald", data: bold, weight: WORD_WEIGHT, style: "normal" },
        { name: "Oswald", data: medium, weight: 500, style: "normal" },
        { name: "IBM Plex Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
