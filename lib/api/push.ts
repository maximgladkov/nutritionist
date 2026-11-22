import { prisma } from "../prisma.ts";
import { apiDeps } from "./deps.ts";

// Best-effort push to every device of a user. Failures are logged, never thrown, so a push
// outage can't fail the request that triggered it.
export async function pushToUser(
  userId: string,
  message: { body: string; data?: Record<string, unknown>; title: string },
): Promise<number> {
  const devices = await prisma.pushDevice.findMany({ select: { token: true }, where: { userId } });
  if (devices.length === 0) {
    return 0;
  }
  try {
    await apiDeps().sendPush(devices.map((device) => ({ ...message, to: device.token })));
    return devices.length;
  } catch (error) {
    console.error("api: push failed", error);
    return 0;
  }
}
