import { circle } from "@/lib/server/circle";
import { circleFailure, statusFor } from "@/lib/server/circle-errors";

/** Polls a transaction until it reaches a terminal state. Read-only. */
export async function POST(request: Request) {
  try {
    const { userToken, id } = (await request.json()) as {
      userToken?: string;
      id?: string;
    };
    if (!userToken || !id) {
      return Response.json(
        { message: "userToken and id are required" },
        { status: 400 },
      );
    }

    const response = await circle().getTransaction({ userToken, id });
    const tx = response.data?.transaction;

    return Response.json({
      state: tx?.state,
      txHash: tx?.txHash,
      errorReason: tx?.errorReason,
    });
  } catch (error) {
    const failure = circleFailure("transaction", error);
    return Response.json(failure, { status: statusFor(failure.kind) });
  }
}
