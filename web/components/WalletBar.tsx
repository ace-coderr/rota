"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { Button } from "@/components/Button";
import { DEFAULT_DEPLOYMENT, deploymentFor } from "@/lib/deployments";
import { shortAddress } from "@/lib/format";
import {
  circleConfigured,
  describeCircleError,
  googleConfigured,
  useCircleWallet,
} from "@/lib/wallet/circle";

/**
 * Three ways in, in the order most people will want them: a Google account,
 * an email address, or a wallet they already have. The first two create a
 * Circle user-controlled wallet — the member holds the keys, and every action
 * is approved by them, never by us.
 */
export function WalletBar({
  reason,
  bare = false,
}: {
  reason?: string;
  /**
   * Render without the card wrapper, for when this already sits inside one.
   * A card inside a card reads as a dialogue that failed to open.
   */
  bare?: boolean;
}) {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const circle = useCircleWallet();

  const [showEmail, setShowEmail] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const active = deploymentFor(chainId);
  const wrongNetwork = isConnected && !active;
  const target = DEFAULT_DEPLOYMENT;

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function guard(label: string, run: () => Promise<void> | void) {
    setError(undefined);
    setBusy(label);
    try {
      await run();
    } catch (err) {
      /*
       * describeCircleError keeps the server's classification and appends the
       * reference, so a report of "it failed" can be matched to the logged
       * line. Anything else falls back, but the raw text of an unknown error
       * is still never shown.
       */
      setError(describeCircleError(err));
    } finally {
      setBusy(undefined);
    }
  }

  // ------------------------------------------------------------ signed in

  if (isConnected || circle.status === "ready") {
    const shown = isConnected ? address : circle.address;
    return (
      <>
        {wrongNetwork && (
          <div className="notice notice-wait">
            <p className="notice-title">Your wallet is on the wrong network.</p>
            <p>Switch it to {target?.label ?? "Arc"} to carry on.</p>
            <Button
              block
              disabled={isSwitching || !target}
              onClick={() => target && switchChain({ chainId: target.chain.id })}
            >
              {isSwitching ? "Switching…" : `Switch to ${target?.label ?? "Arc"}`}
            </Button>
          </div>
        )}

        <div className="signed-strip">
          <span>
            Signed in as{" "}
            <span className="addr">{shown ? shortAddress(shown) : ""}</span>
          </span>
          <button
            type="button"
            className="text-action"
            onClick={() => (isConnected ? disconnect() : circle.signOut())}
          >
            Sign out
          </button>
        </div>
      </>
    );
  }

  // ------------------------------------------------- waiting for the code

  if (circle.status === "awaiting-otp") {
    return (
      <div className={bare ? "" : "card card-quiet"}>
        <p style={{ marginBottom: "1rem" }}>
          We’ve emailed you a code. Enter it to finish signing in.
        </p>
        <Button block onClick={circle.verifyEmailCode}>
          Enter my code
        </Button>
        <button
          type="button"
          className="text-action"
          style={{ marginTop: "1rem" }}
          onClick={circle.signOut}
        >
          Start again
        </button>
      </div>
    );
  }

  const working =
    busy !== undefined ||
    circle.status === "signing-in" ||
    circle.status === "creating-wallet";

  // ------------------------------------------------------------ signed out

  return (
    <div className={bare ? "" : "card card-quiet"}>
      <p style={{ marginBottom: "1rem" }}>
        {reason ?? "Sign in to see your circle."}
      </p>

      {circle.status === "creating-wallet" && (
        <p className="small muted">Setting up your wallet…</p>
      )}

      {googleConfigured && (
        <Button
          block
          disabled={working}
          onClick={() => guard("google", circle.signInWithGoogle)}
        >
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </Button>
      )}

      {circleConfigured && !showEmail && (
        <Button
          block
          variant="secondary"
          disabled={working}
          onClick={() => setShowEmail(true)}
        >
          Continue with email
        </Button>
      )}

      {circleConfigured && showEmail && (
        <div className="field" style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="circle-email">Your email address</label>
          <input
            id="circle-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          <Button
            block
            style={{ marginTop: "0.75rem" }}
            disabled={!emailValid || working}
            onClick={() => guard("email", () => circle.sendEmailCode(email.trim()))}
          >
            {busy === "email" ? "Sending…" : "Email me a code"}
          </Button>
        </div>
      )}

      {!showWallet ? (
        <Button block variant="secondary" disabled={working} onClick={() => setShowWallet(true)}>
          I have a wallet
        </Button>
      ) : connectors.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          No wallet found on this device. Install one, then reload this page.
        </p>
      ) : (
        connectors.map((connector) => (
          <Button
            key={connector.uid}
            block
            variant="secondary"
            disabled={isPending}
            onClick={() => connect({ connector })}
          >
            {isPending ? "Connecting…" : `Connect ${connector.name}`}
          </Button>
        ))
      )}

      {!circleConfigured && (
        <p className="small muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          Google and email sign-in aren’t set up on this site yet.
        </p>
      )}

      {(error || circle.message) && (
        <p className="small" role="alert" style={{ marginTop: "1rem", marginBottom: 0 }}>
          {error ?? circle.message}
        </p>
      )}
    </div>
  );
}
