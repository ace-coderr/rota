"use client";

import { encodeFunctionData, type Abi, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { circleConfigured, useCircleWallet } from "./circle";

/**
 * One way to send a contract call, whichever kind of wallet the member has.
 *
 * Both paths encode the same call with the same ABI and the same arguments —
 * the injected path hands it to the wallet extension, the Circle path hands
 * the identical calldata to a challenge the member approves. join, start and
 * disburse therefore behave the same either way, because they *are* the same
 * transaction.
 */
export type WalletKind = "injected" | "circle" | "none";

export type ContractCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

export function useRotaWallet() {
  const { address: injectedAddress, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const circle = useCircleWallet();

  const circleReady = circleConfigured && circle.status === "ready";
  const kind: WalletKind = isConnected
    ? "injected"
    : circleReady
      ? "circle"
      : "none";

  const address =
    kind === "injected"
      ? injectedAddress
      : kind === "circle"
        ? circle.address
        : undefined;

  async function send(call: ContractCall, forChainId: number) {
    if (kind === "injected") {
      const hash = await writeContractAsync({
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args as unknown[],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      return;
    }

    if (kind === "circle") {
      const data = encodeFunctionData({
        abi: call.abi,
        functionName: call.functionName,
        args: call.args as unknown[],
      });
      await circle.execute(call.address, data, forChainId);
      return;
    }

    throw new Error("No wallet is connected.");
  }

  return {
    kind,
    address,
    chainId: kind === "circle" ? undefined : chainId,
    isReady: kind !== "none",
    send,
  };
}
