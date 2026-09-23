"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";

import { Button } from "@/components/Button";
import { DEFAULT_DEPLOYMENT, deploymentFor } from "@/lib/deployments";
import { addressUrl } from "@/lib/explorer";
import { shortAddress } from "@/lib/format";
import { useCircleWallet } from "@/lib/wallet/circle";

/**
 * The one wallet control: a single bordered box reading
 *
 *   [ • Arc | 0x8557…8F69 ]
 *
 * rather than a chip and a button that happened to sit next to each other.
 *
 * The address keeps its original casing. Checksummed hex encodes information
 * in its capitals — uppercasing it destroys the checksum and makes two
 * different addresses look alike, so the `text-transform: uppercase` that the
 * rest of the mono micro-type uses is explicitly cancelled here.
 *
 * On a chain Rota is not deployed on, the dot and the border turn amber and
 * the label says so. That is the only state where the control offers a fourth
 * item, because otherwise there is no way out of it from the navbar.
 */
export function WalletControl({
  onConnectClick,
  connectOpen,
}: {
  onConnectClick: () => void;
  connectOpen: boolean;
}) {
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const circle = useCircleWallet();

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  const signedIn = isConnected || circle.status === "ready";
  const shown = (isConnected ? address : circle.address) ?? undefined;
  const active = deploymentFor(chainId);
  const wrongNetwork = signedIn && isConnected && active === undefined;
  const target = DEFAULT_DEPLOYMENT;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Let the "Copied" confirmation fall back to the address on its own.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!signedIn) {
    return (
      <Button size="sm" aria-expanded={connectOpen} onClick={onConnectClick}>
        {connectOpen ? "Close" : "Connect"}
      </Button>
    );
  }

  const label = wrongNetwork ? "Wrong network" : (active ?? target)?.label ?? "Arc";
  const explorer = (active ?? target)?.explorer;

  return (
    <div className="wallet" ref={root}>
      <button
        type="button"
        className={`wallet-box ${wrongNetwork ? "wallet-box-warn" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="wallet-dot" aria-hidden="true" />
        <span className="wallet-chain">{label}</span>
        <span className="wallet-rule" aria-hidden="true" />
        <span className="wallet-addr">
          {copied ? "Copied" : shown ? shortAddress(shown) : "Signed in"}
        </span>
      </button>

      {open && (
        <div className="wallet-menu" role="menu">
          {wrongNetwork && target && (
            <button
              type="button"
              role="menuitem"
              className="wallet-item"
              onClick={() => {
                switchChain({ chainId: target.chain.id });
                setOpen(false);
              }}
            >
              Switch to {target.label}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="wallet-item"
            disabled={!shown}
            onClick={() => {
              if (shown) navigator.clipboard?.writeText(shown).then(() => setCopied(true));
              setOpen(false);
            }}
          >
            Copy address
          </button>
          {shown && explorer && (
            <a
              role="menuitem"
              className="wallet-item"
              href={addressUrl(explorer, shown)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              View on explorer
            </a>
          )}
          <button
            type="button"
            role="menuitem"
            className="wallet-item"
            onClick={() => {
              if (isConnected) disconnect();
              else circle.signOut();
              setOpen(false);
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
