import { circle, circleBlockchain } from "@/lib/server/circle";
import {
  circleCodeOf,
  circleFailure,
  statusFor,
} from "@/lib/server/circle-errors";

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
    // Already initialised is not a failure: the caller lists wallets instead.
    // Checked before reporting, so it never reaches the log as an error.
    const code = circleCodeOf(error);
    if (code === 155106) return Response.json({ code, alreadyInitialised: true });

    const failure = circleFailure("initialize", error);
    return Response.json(failure, { status: statusFor(failure.kind) });
  }
}
