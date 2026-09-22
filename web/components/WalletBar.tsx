"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { DEFAULT_DEPLOYMENT, deploymentFor } from "@/lib/deployments";
import { shortAddress } from "@/lib/format";
import {
  circleConfigured,
  googleConfigured,
  useCircleWallet,
} from "@/lib/wallet/circle";

/**
 * Three ways in, in the order most people will want them: a Google account,
 * an email address, or a wallet they already have. The first two create a
 * Circle user-controlled wallet — the member holds the keys, and every action
 * is approved by them, never by us.
 */
export function WalletBar({ reason }: { reason?: string }) {
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
      setError(
        err instanceof Error ? err.message : "That didn’t work. Please try again.",
      );
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
            <button
              type="button"
              className="btn"
              disabled={isSwitching || !target}
              onClick={() => target && switchChain({ chainId: target.chain.id })}
            >
              {isSwitching ? "Switching…" : `Switch to ${target?.label ?? "Arc"}`}
            </button>
          </div>
        )}

        <p className="small muted" style={{ marginBottom: "1.5rem" }}>
          Signed in as {shown ? shortAddress(shown) : ""}{" "}
          <button
            type="button"
            className="btn-link"
            onClick={() => (isConnected ? disconnect() : circle.signOut())}
          >
            Sign out
          </button>
        </p>
      </>
    );
  }

  // ------------------------------------------------- waiting for the code

  if (circle.status === "awaiting-otp") {
    return (
      <div className="card card-quiet">
        <p style={{ marginBottom: "1rem" }}>
          We’ve emailed you a code. Enter it to finish signing in.
        </p>
        <button type="button" className="btn" onClick={circle.verifyEmailCode}>
          Enter my code
        </button>
        <button
          type="button"
          className="btn-link"
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
    <div className="card card-quiet">
      <p style={{ marginBottom: "1rem" }}>
        {reason ?? "Sign in to see your circle."}
      </p>

      {circle.status === "creating-wallet" && (
        <p className="small muted">Setting up your wallet…</p>
      )}

      {googleConfigured && (
        <button
          type="button"
          className="btn"
          disabled={working}
          onClick={() => guard("google", circle.signInWithGoogle)}
          style={{ marginBottom: "0.75rem" }}
        >
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>
      )}

      {circleConfigured && !showEmail && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={working}
          onClick={() => setShowEmail(true)}
          style={{ marginBottom: "0.75rem" }}
        >
          Continue with email
        </button>
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
          <button
            type="button"
            className="btn"
            style={{ marginTop: "0.75rem" }}
            disabled={!emailValid || working}
            onClick={() => guard("email", () => circle.sendEmailCode(email.trim()))}
          >
            {busy === "email" ? "Sending…" : "Email me a code"}
          </button>
        </div>
      )}

      {!showWallet ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={working}
          onClick={() => setShowWallet(true)}
        >
          I have a wallet
        </button>
      ) : connectors.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          No wallet found on this device. Install one, then reload this page.
        </p>
      ) : (
        connectors.map((connector) => (
          <button
            key={connector.uid}
            type="button"
            className="btn btn-secondary"
            disabled={isPending}
            onClick={() => connect({ connector })}
          >
            {isPending ? "Connecting…" : `Connect ${connector.name}`}
          </button>
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
