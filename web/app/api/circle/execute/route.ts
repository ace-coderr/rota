import { circle } from "@/lib/server/circle";
import { circleFailure, statusFor } from "@/lib/server/circle-errors";

/**
 * Creates a contract-execution challenge.
 *
 * The user still has to approve it in Circle's own UI before anything is
 * signed — this route cannot move anyone's money on its own. That is the
 * whole point of user-controlled wallets, and why Rota never uses
 * developer-controlled ones.
 *
 * callData is pre-encoded by the caller with viem, which avoids Circle's
 * string-typed ABI parameter format and keeps the encoding identical to the
 * injected-wallet path.
 */
export async function POST(request: Request) {
  try {
    const { userToken, walletId, contractAddress, callData } =
      (await request.json()) as {
        userToken?: string;
        walletId?: string;
        contractAddress?: string;
        callData?: string;
      };

    if (
      !userToken ||
      !walletId ||
      !contractAddress ||
      !callData ||
      !/^0x[0-9a-fA-F]*$/.test(callData) ||
      callData.length % 2 !== 0
    ) {
      return Response.json(
        {
          message:
            "userToken, walletId, contractAddress and 0x-prefixed even-length callData are required",
        },
        { status: 400 },
      );
    }

    const response = await circle().createUserTransactionContractExecutionChallenge({
      userToken,
      walletId,
      contractAddress,
      callData: callData as `0x${string}`,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    return Response.json({
      challengeId: response.data?.challengeId,
    });
  } catch (error) {
    const failure = circleFailure("execute", error);
    return Response.json(failure, { status: statusFor(failure.kind) });
  }
}
