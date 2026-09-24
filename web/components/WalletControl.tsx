"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";

import { Button } from "@/components/Button";
import { DEFAULT_DEPLOYMENT, DEPLOYMENTS, deploymentFor } from "@/lib/deployments";
import { addressUrl } from "@/lib/explorer";
import { shortAddress } from "@/lib/format";
import { useCircleWallet } from "@/lib/wallet/circle";

/**
 * The one wallet control: a single bordered box reading
 *
 *   [ • arc · testnet | 0x8557…8F69 ]
 *
 * rather than a chip and a button that happened to sit next to each other.
 *
 * The network is always named. "Arc" on its own does not say whether the money
 * is real, which is the single most important thing about a chain, and it is
 * the one mistake here that cannot be undone.
 *
 * The address keeps its original casing. Checksummed hex encodes information
 * in its capitals — uppercasing it destroys the checksum and makes two
 * different addresses look alike, so the `text-transform: uppercase` that the
 * rest of the mono micro-type uses is explicitly cancelled here.
 *
 * On a chain Rota is not deployed on, the dot and the border turn amber.
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

  /*
   * A Circle session without a wallet is not signed in as far as this control
   * is concerned. It used to render the chip with the label "Signed in" and a
   * Copy address item that copied nothing, because status said ready while
   * the address was still undefined.
   */
  const circleHasWallet = circle.status === "ready" && Boolean(circle.address);
  const circleSettingUp =
    circle.status === "creating-wallet" || circle.status === "no-wallet";
  const signedIn = isConnected || circleHasWallet;
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
    // Mid-setup is its own thing: say so rather than offering Connect to
    // someone who has already signed in and is waiting on a wallet.
    if (circleSettingUp) {
      return (
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={connectOpen}
          onClick={onConnectClick}
        >
          {circle.status === "creating-wallet"
            ? "Setting up your wallet…"
            : "No wallet yet"}
        </Button>
      );
    }

    return (
      <Button size="sm" aria-expanded={connectOpen} onClick={onConnectClick}>
        {connectOpen ? "Close" : "Connect"}
      </Button>
    );
  }

  const shownChain = active ?? target;
  const explorer = shownChain?.explorer;
  // Always name the network. "Arc" alone does not say whether the money is
  // real, which is the single most important thing about a chain.
  const network = wrongNetwork ? undefined : shownChain?.network;

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
        <span className="wallet-chain">arc</span>
        {network ? (
          <span className="wallet-net">· {network}</span>
        ) : (
          <span className="wallet-net">· unknown network</span>
        )}
        <span className="wallet-rule" aria-hidden="true" />
        <span className="wallet-addr">
          {copied ? "Copied" : shortAddress(shown!)}
        </span>
      </button>

      {open && (
        <div className="wallet-menu" role="menu">
          {/*
            Switching is always offered, not only when the wallet is on a
            chain Rota is not on. Moving between testnet and mainnet is a
            thing people do deliberately, and hiding it behind an error state
            means the only way to reach testnet is to first get lost.
          */}
          {DEPLOYMENTS.length > 0 && (
            <div className="wallet-group">
              <span className="wallet-group-label">Switch network</span>
              {DEPLOYMENTS.map((d) => {
                const current = active?.chain.id === d.chain.id;
                return (
                  <button
                    key={d.chain.id}
                    type="button"
                    role="menuitem"
                    className="wallet-item wallet-item-net"
                    aria-current={current || undefined}
                    disabled={current}
                    onClick={() => {
                      switchChain({ chainId: d.chain.id });
                      setOpen(false);
                    }}
                  >
                    <span>arc · {d.network}</span>
                    {current && <span className="wallet-tick" aria-label="current">✓</span>}
                  </button>
                );
              })}
            </div>
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
