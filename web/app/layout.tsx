import type { Metadata } from "next";
import { IBM_Plex_Mono, Oswald, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { SiteFooter } from "@/components/SiteFooter";
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

const TITLE = "Rota — savings circles where nobody holds the pot";
const DESCRIPTION =
  "Everyone puts in the same amount each round and one person receives everyone's share, until everyone has had a turn. Each share moves straight from one wallet to another, so nothing is ever pooled and Rota never holds your money.";

/*
 * title.template gives every other page its own name in a tab and in a link
 * preview; the site name alone on all of them tells nobody anything.
 *
 * The Open Graph and Twitter images are not listed here. Next finds
 * app/opengraph-image.tsx by convention and writes the og:image tags itself,
 * with the absolute URL and the dimensions filled in — naming them again by
 * hand is how a card ends up pointing at a file that no longer exists.
 */
/*
 * og:image has to be an absolute URL, so Next needs to know the site's
 * origin. Vercel supplies it at build time, which means link previews work on
 * production without anyone adding a variable; NEXT_PUBLIC_SITE_URL overrides
 * it for a custom domain. Undefined locally, where it does not matter.
 */
const origin =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined);

export const metadata: Metadata = {
  metadataBase: origin ? new URL(origin) : undefined,
  title: { default: TITLE, template: "%s — Rota" },
  description: DESCRIPTION,
  applicationName: "Rota",
  openGraph: {
    type: "website",
    siteName: "Rota",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        {/*
          The shell lives here, not in each page. /create and /circle used to
          render neither, which made them look like a different site reached
          by accident.
        */}
        <Providers>
          <NavBar />
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
