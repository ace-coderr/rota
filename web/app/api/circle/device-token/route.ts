import { circle } from "@/lib/server/circle";
import { circleFailure, statusFor } from "@/lib/server/circle-errors";

/** Step 1 of social login: exchange a device id for a device token. */
export async function POST(request: Request) {
  try {
    const { deviceId } = (await request.json()) as { deviceId?: string };
    if (!deviceId) {
      return Response.json({ message: "deviceId is required" }, { status: 400 });
    }

    const response = await circle().createDeviceTokenForSocialLogin({ deviceId });
    return Response.json({
      deviceToken: response.data?.deviceToken,
      deviceEncryptionKey: response.data?.deviceEncryptionKey,
    });
  } catch (error) {
    const failure = circleFailure("device-token", error);
    return Response.json(failure, { status: statusFor(failure.kind) });
  }
}
