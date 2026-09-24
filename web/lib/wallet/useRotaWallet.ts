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

  /*
   * An address, not just a status. A Circle sign-in yields a user token
   * immediately but the wallet is a separate object that may not exist yet,
   * so `status === "ready"` alone once meant "signed in, addressless" —
   * isReady said true, address was undefined, and every consumer downstream
   * believed there was a wallet. /create's "your own address isn't in the
   * list" check reads `you === undefined || …`, so it passed vacuously and
   * would have let someone create a circle they were not in.
   */
  const circleReady =
    circleConfigured && circle.status === "ready" && Boolean(circle.address);
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
    // Never true without an address: everything downstream assumes one.
    isReady: kind !== "none" && Boolean(address),
    send,
  };
}
