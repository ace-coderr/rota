"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { shortAddress } from "@/lib/format";
import { DEFAULT_DEPLOYMENT, deploymentFor } from "@/lib/deployments";

/**
 * Connecting is plumbing, not the point of any screen, so it stays quiet
 * until it needs attention — then it becomes the one thing to do.
 */
export function WalletBar({ reason }: { reason?: string }) {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Wrong network means "no Rota deployed on the chain you are on", not
  // "not the one chain we know about" — there are two now.
  const active = deploymentFor(chainId);
  const wrongNetwork = isConnected && !active;
  const target = DEFAULT_DEPLOYMENT;

  if (!isConnected) {
    return (
      <div className="card card-quiet">
        <p style={{ marginBottom: "1rem" }}>
          {reason ?? "Connect your wallet to see your circle."}
        </p>
        {connectors.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            No wallet found on this device. Install one, then reload this page.
          </p>
        ) : (
          connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              className="btn"
              disabled={isPending}
              onClick={() => connect({ connector })}
            >
              {isPending ? "Connecting…" : "Connect wallet"}
            </button>
          ))
        )}
      </div>
    );
  }

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
            onClick={() =>
              target && switchChain({ chainId: target.chain.id })
            }
          >
            {isSwitching ? "Switching…" : `Switch to ${target?.label ?? "Arc"}`}
          </button>
        </div>
      )}

      <p className="small muted" style={{ marginBottom: "1.5rem" }}>
        Signed in as {address ? shortAddress(address) : ""}{" "}
        <button
          type="button"
          className="btn-link"
          onClick={() => disconnect()}
        >
          Sign out
        </button>
      </p>
    </>
  );
}
