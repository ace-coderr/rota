"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { EXPECTED_CHAIN_ID } from "@/lib/wagmi";

/**
 * Connect / disconnect, plus the wrong-network state. Kept deliberately plain:
 * this is the functional pass.
 */
export function WalletBar() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const wrongNetwork = isConnected && chainId !== EXPECTED_CHAIN_ID;

  return (
    <div>
      <hr />
      {isConnected ? (
        <p>
          Connected: <code>{address}</code>{" "}
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
        </p>
      ) : (
        <p>
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              disabled={isPending}
              onClick={() => connect({ connector })}
            >
              Connect {connector.name}
            </button>
          ))}
          {connectors.length === 0 && <em>No wallet connector detected.</em>}
        </p>
      )}

      {wrongNetwork && (
        <p role="alert">
          <strong>Wrong network.</strong> Your wallet is on chain {chainId}. Rota
          runs on Arc testnet (chain {EXPECTED_CHAIN_ID}).{" "}
          <button
            type="button"
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })}
          >
            {isSwitching ? "Switching…" : "Switch to Arc testnet"}
          </button>
        </p>
      )}
      <hr />
    </div>
  );
}
