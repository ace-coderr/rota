import { circle, circleError } from "@/lib/server/circle";

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
    const { code, message } = circleError(error);
    return Response.json({ code, message }, { status: 502 });
  }
}
