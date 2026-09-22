"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";

import { WalletBar } from "@/components/WalletBar";
import { DEFAULT_DEPLOYMENT, deploymentFor } from "@/lib/deployments";
import { shortAddress } from "@/lib/format";
import { useCircleWallet } from "@/lib/wallet/circle";

const GITHUB = "https://github.com/ace-coderr/rota";

/**
 * Fixed, always visible. Transparent over the hero so the headline owns the
 * screen, then solid near-black with a hairline once you scroll — so it never
 * floats over content it does not belong to.
 */
export function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const circle = useCircleWallet();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const signedIn = isConnected || circle.status === "ready";
  const shown = isConnected ? address : circle.address;
  const active = deploymentFor(chainId) ?? DEFAULT_DEPLOYMENT;

  // "Arc" on mainnet, "Arc testnet" on testnet — never a bare chain id.
  const chainLabel = active?.label ?? "Arc";

  return (
    <nav className={`nav ${scrolled ? "nav-solid" : ""}`}>
      <Link href="/" className="nav-mark">
        Rota
      </Link>

      <div className="nav-links">
        <Link href="/#how-it-works" className="nav-link">
          How it works
        </Link>
        <Link href="/#live-proof" className="nav-link">
          Proof
        </Link>
        <a
          href={GITHUB}
          className="nav-link"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>

      <div className="nav-wallet">
        {signedIn ? (
          <>
            <span className="chip">{chainLabel}</span>
            <button
              type="button"
              className="nav-btn"
              onClick={() => (isConnected ? disconnect() : circle.signOut())}
              title="Sign out"
            >
              {shown ? shortAddress(shown) : "Signed in"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="nav-btn nav-btn-filled"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
          >
            {panelOpen ? "Close" : "Connect"}
          </button>
        )}
      </div>

      {panelOpen && !signedIn && (
        <div className="nav-panel">
          <WalletBar reason="Sign in to start or join a circle." />
        </div>
      )}
    </nav>
  );
}
