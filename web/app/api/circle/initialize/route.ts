import { circle, circleError, circleBlockchain } from "@/lib/server/circle";

/**
 * Creates the user's wallet on the chain they are using. Returns a challenge
 * the user must approve — Circle never creates a wallet without consent.
 *
 * Code 155106 means the user already has wallets, which is a normal repeat
 * sign-in rather than a failure.
 */
export async function POST(request: Request) {
  try {
    const { userToken, chainId } = (await request.json()) as {
      userToken?: string;
      chainId?: number;
    };
    if (!userToken || !chainId) {
      return Response.json(
        { message: "userToken and chainId are required" },
        { status: 400 },
      );
    }

    const response = await circle().createUserPinWithWallets({
      userToken,
      blockchains: [circleBlockchain(chainId)],
      accountType: "EOA",
    });

    return Response.json({ challengeId: response.data?.challengeId });
  } catch (error) {
    const { code, message } = circleError(error);
    // Already initialised: the caller should list wallets instead.
    if (code === 155106) return Response.json({ code, message });
    return Response.json({ code, message }, { status: 502 });
  }
}
