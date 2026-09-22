import type { Metadata } from "next";
import { IBM_Plex_Mono, Oswald, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Three families, one job each: condensed display, readable body, monospace
// for labels. Nothing else — and no images or logos anywhere in the app.
const display = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rota — save together",
  description:
    "A savings circle where everyone takes a turn. Your money stays in your own wallet until it is your turn to be paid.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
