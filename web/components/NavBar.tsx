"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
const DARK_ROUTES = [/^\/$/, /^\/proof(\/|$)/, /^\/how-it-works$/];

export function NavBar() {
  const pathname = usePathname();
  const onDark = DARK_ROUTES.some((route) => route.test(pathname ?? "/"));

  const [scrolled, setScrolled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const { isConnected, status: accountStatus } = useAccount();
  const circle = useCircleWallet();
  const signedIn = isConnected || circle.status === "ready";

  /*
   * Signing in on the marketing page should land you on your circles.
   *
   * The hard part is not the redirect, it is not doing it to someone who
   * merely revisited the landing page with a session already in place. Two
   * different signals, because the two sign-in paths fail differently:
   *
   * - Circle (Google, email): `signInCount` only moves in the SDK's login
   *   callback. Google leaves the site and comes back to "/", so the session
   *   arrives during a fresh page load and is otherwise indistinguishable
   *   from a restore — status alone cannot tell them apart.
   *
   * - An injected wallet never leaves the page, so a transition is enough,
   *   as long as we first see it SETTLED and signed out. wagmi reports
   *   "reconnecting" while it restores, and treating that as signed out
   *   would redirect every returning visitor.
   */
  const router = useRouter();
  const firstCount = useRef<number | null>(null);
  const sawSignedOut = useRef(false);

  useEffect(() => {
    if (firstCount.current === null) {
      firstCount.current = circle.signInCount;
    }

    const settling =
      accountStatus === "connecting" ||
      accountStatus === "reconnecting" ||
      circle.status === "loading" ||
      circle.status === "signing-in";

    if (!settling && !signedIn) sawSignedOut.current = true;

    const justSignedIn =
      circle.signInCount > (firstCount.current ?? 0) ||
      (sawSignedOut.current && signedIn);

    if (justSignedIn && (pathname === "/" || pathname === "")) {
      sawSignedOut.current = false;
      firstCount.current = circle.signInCount;
      router.push("/circles");
    }
  }, [circle.signInCount, circle.status, accountStatus, signedIn, pathname, router]);

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
        {/* Only once there is an address, because the page has nothing to say
            without one and a dead link in the bar is worse than no link. */}
        {signedIn && (
          <Link href="/circles" className="nav-link">
            My circles
          </Link>
        )}
        {/* The explainer, not the landing page's three cards. Anyone who
            reaches for this link has already decided the summary was not
            enough, so sending them to a section of it is a dead end. */}
        <Link href="/how-it-works" className="nav-link">
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
