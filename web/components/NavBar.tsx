"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { RotaWordmark } from "@/components/Logo";
import { WalletBar } from "@/components/WalletBar";
import { WalletControl } from "@/components/WalletControl";
import { useCircleWallet } from "@/lib/wallet/circle";

const GITHUB = "https://github.com/ace-coderr/rota";

/**
 * One navbar for the whole site, rendered from the root layout.
 *
 * Two surfaces, because the site has two volumes. The editorial pages open on
 * a near-black hero, so the bar starts transparent and only goes solid once
 * you have scrolled past it. The plain pages are cream from the first pixel,
 * where a transparent bar would be cream on cream: those get a cream bar with
 * a hairline under it from the start.
 *
 * Which is which comes from the route, not from a prop, so a page cannot
 * forget to say and end up with an invisible navbar.
 */
const DARK_ROUTES = [/^\/$/, /^\/proof(\/|$)/];

export function NavBar() {
  const pathname = usePathname();
  const onDark = DARK_ROUTES.some((route) => route.test(pathname ?? "/"));

  const [scrolled, setScrolled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const { isConnected } = useAccount();
  const circle = useCircleWallet();
  const signedIn = isConnected || circle.status === "ready";

  useEffect(() => {
    if (!onDark) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onDark]);

  const surface = onDark ? (scrolled ? "nav-solid" : "") : "nav-light";

  return (
    <nav className={`nav ${surface}`}>
      <Link href="/" className="nav-mark" aria-label="Rota, home">
        <RotaWordmark size={26} label="" />
      </Link>

      <div className="nav-links">
        <Link href="/#how-it-works" className="nav-link">
          How it works
        </Link>
        <Link href="/#live-proof" className="nav-link">
          Proof
        </Link>
        <a href={GITHUB} className="nav-link" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>

      <div className="nav-wallet">
        <WalletControl
          connectOpen={panelOpen}
          onConnectClick={() => setPanelOpen((open) => !open)}
        />
      </div>

      {panelOpen && !signedIn && (
        <div className="nav-panel">
          <WalletBar reason="Sign in to start or join a circle." />
        </div>
      )}
    </nav>
  );
}
