import type { SessionContext } from "eve/context";
import { normalizeCountryCode } from "../../lib/countries";
import { prisma } from "../../lib/prisma";
import { getLiveUserId } from "./require-user";

export async function resolveLookupCountry(
  override: string | undefined,
  ctx: SessionContext,
): Promise<string | undefined> {
  if (override !== undefined && override !== "") {
    const normalized = normalizeCountryCode(override);
    if (!normalized) {
      throw new Error("country must be a 2-letter ISO 3166-1 code");
    }
    return normalized;
  }

  const userId = await getLiveUserId(ctx);
  if (!userId) {
    return undefined;
  }
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { country: true },
  });
  return profile?.country ?? undefined;
}
