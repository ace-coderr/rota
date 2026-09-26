import type { Chain } from "viem";

import { deploymentFor } from "@/lib/deployments";
import {
  readClient,
  relayerAddress,
  relayerConfigured,
  relayerFunding,
} from "@/lib/server/relayer";

/**
 * Who pays for automatic rounds, and whether it still can.
 *
 * Public on purpose. Everything here is already on chain and readable by
 * anyone: an address, and what that address holds. Publishing it is the point
 * — a member should be able to see for themselves that the thing paying their
 * circle's gas is an ordinary wallet with an ordinary balance, and check it on
 * the explorer. The private key is never touched by this route; the address is
 * derived from it server-side and only the address leaves.
 *
 * It is also what lets the circle page say "paid automatically" rather than
 * "paid by 0x9f2c…". Attribution needs the address, and the address is not a
 * secret.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!relayerConfigured()) {
    // Not an error. A Rota with no relayer is a Rota where members press the
    // button themselves, which is the arrangement the contract is built for.
    return Response.json({ configured: false });
  }

  const chainId = Number(
    new URL(request.url).searchParams.get("chainId") ?? Number.NaN,
  );
  const deployment = deploymentFor(
    Number.isFinite(chainId) ? chainId : undefined,
  );

  let address: string;
  try {
    address = relayerAddress();
  } catch (error) {
    console.error("[relayer] key is set but unusable", error);
    return Response.json({ configured: false });
  }

  if (!deployment) {
    return Response.json({ configured: true, address });
  }

  try {
    const funding = await relayerFunding(
      readClient(deployment.chain as Chain),
      address as `0x${string}`,
    );
    console.log(
      "[relayer] status",
      JSON.stringify({
        chainId: deployment.chain.id,
        usdc: funding.formatted,
        low: funding.low,
      }),
    );
    return Response.json({
      configured: true,
      address,
      chainId: deployment.chain.id,
      usdc: funding.formatted,
      low: funding.low,
      minimum: funding.minimum,
    });
  } catch (error) {
    // A failed balance read must not take the address with it: attribution on
    // the circle page only needs the address, and works without a balance.
    console.error("[relayer] balance read failed", error);
    return Response.json({ configured: true, address });
  }
}
