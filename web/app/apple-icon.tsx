import { ImageResponse } from "next/og";

import { markDataUri } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const alt = "Rota";

/**
 * The home screen icon: the mark in cream on electric blue.
 *
 * Drawn from lib/mark.ts like everything else, so it cannot drift from the
 * favicon. Satori will not render SVG elements, only an <img> pointing at
 * one, hence the data URI. No corner radius of our own — iOS applies its own
 * mask and a second rounding shows as a seam.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#0A1EFF",
        }}
      >
        {/* pad 5 on a 32 grid leaves ~15% clear, which is what survives the
            rounded mask on a home screen. */}
        {/* eslint-disable-next-line @next/next/no-img-element --
            satori has no next/image, and this never reaches a browser. */}
        <img
          src={markDataUri({ colour: "#F0EEE9", pad: 5 })}
          width={size.width}
          height={size.height}
          alt=""
        />
      </div>
    ),
    size,
  );
}
