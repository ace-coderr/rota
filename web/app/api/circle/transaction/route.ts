import { circle, circleError } from "@/lib/server/circle";

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
    const { code, message } = circleError(error);
    return Response.json({ code, message }, { status: 502 });
  }
}
