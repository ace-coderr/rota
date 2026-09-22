import { circle, circleError } from "@/lib/server/circle";

/** Step 1 of email sign-in: Circle emails a one-time code. */
export async function POST(request: Request) {
  try {
    const { deviceId, email } = (await request.json()) as {
      deviceId?: string;
      email?: string;
    };
    if (!deviceId || !email) {
      return Response.json(
        { message: "deviceId and email are required" },
        { status: 400 },
      );
    }

    const response = await circle().createDeviceTokenForEmailLogin({
      deviceId,
      email,
    });
    return Response.json({
      deviceToken: response.data?.deviceToken,
      deviceEncryptionKey: response.data?.deviceEncryptionKey,
      otpToken: response.data?.otpToken,
    });
  } catch (error) {
    const { code, message } = circleError(error);
    return Response.json({ code, message }, { status: 502 });
  }
}
