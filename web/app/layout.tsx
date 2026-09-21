import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// One typeface, everywhere — including amounts and addresses.
const sans = Source_Sans_3({
  variable: "--font-sans-stack",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rota — save together",
  description:
    "A savings circle where everyone takes a turn. Your money stays in your own wallet until it is someone's turn.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
