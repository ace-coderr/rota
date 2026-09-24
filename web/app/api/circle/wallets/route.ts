import { circle } from "@/lib/server/circle";
import { circleFailure, statusFor } from "@/lib/server/circle-errors";

/** Lists the signed-in user's wallets. Read-only. */
export async function POST(request: Request) {
  try {
    const { userToken } = (await request.json()) as { userToken?: string };
    if (!userToken) {
      return Response.json({ message: "userToken is required" }, { status: 400 });
    }

    const response = await circle().listWallets({ userToken });
    const wallets = (response.data?.wallets ?? []).map((wallet) => ({
      id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain,
      accountType: wallet.accountType,
      state: wallet.state,
    }));

    /*
     * Logged because an empty list here is indistinguishable from a working
     * sign-in on the client: the user has a token, so they look signed in,
     * and the missing address only shows up as a chip reading "Signed in".
     * Never logs the user token.
     */
    console.info(
      "[circle] wallets",
      JSON.stringify({
        count: wallets.length,
        blockchains: wallets.map((w) => w.blockchain),
        states: wallets.map((w) => w.state),
        withAddress: wallets.filter((w) => w.address).length,
      }),
    );

    return Response.json({ wallets });
  } catch (error) {
    const failure = circleFailure("wallets", error);
    return Response.json(failure, { status: statusFor(failure.kind) });
  }
}
