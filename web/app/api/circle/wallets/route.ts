import { circle, circleError } from "@/lib/server/circle";

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
    }));

    return Response.json({ wallets });
  } catch (error) {
    const { code, message } = circleError(error);
    return Response.json({ code, message }, { status: 502 });
  }
}
