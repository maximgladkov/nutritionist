import { z } from "zod";
import { sniffImageMediaType } from "../../image-bytes.ts";
import { prisma } from "../../prisma.ts";
import {
  fillProfileDetails,
  isBirthDate,
  isHeightCm,
  type ProfileDetails,
} from "../../profile.ts";
import { openSecret } from "../../secret-box.ts";
import { apiDeps } from "../deps.ts";
import { notFound } from "../errors.ts";
import { readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { birthDateSchema, genderSchema, heightSchema } from "../schemas.ts";
import { toMeView } from "./me.ts";
import { API_UPLOAD_SESSION, requireOwnedAttachments } from "./uploads.ts";

async function telegramProfile(userId: string) {
  const identity = await prisma.channelIdentity.findFirst({ where: { provider: "telegram", userId } });
  return identity ? apiDeps().telegram.profile(identity.providerUserId) : null;
}

async function fatSecretHeight(userId: string): Promise<number | null> {
  const row = await prisma.fatSecretConnection.findUnique({ where: { userId } });
  if (row?.status !== "connected" || !row.accessToken || !row.accessSecret) {
    return null;
  }
  try {
    const access = { secret: openSecret(row.accessSecret), token: openSecret(row.accessToken) };
    const heightCm = await apiDeps().fatSecret.heightCm(access);
    return heightCm !== null && isHeightCm(heightCm) ? heightCm : null;
  } catch (error) {
    console.warn("api: FatSecret profile unavailable", error);
    return null;
  }
}

// Fills in what the profile is missing from the phone (Apple Health) and the linked services, in
// that order. WhatsApp gives a name only when the account is made, and Apple only at sign-in, so
// neither has anything to ask for here.
async function fillFromApps(userId: string, fromPhone: ProfileDetails) {
  const filled = await fillProfileDetails(userId, fromPhone);
  const me = await toMeView(userId);
  const [telegram, heightCm] = await Promise.all([
    telegramProfile(userId),
    me.heightCm === null && !me.settledFields.includes("heightCm") ? fatSecretHeight(userId) : null,
  ]);
  const birthDate = telegram?.birthDate && isBirthDate(telegram.birthDate) ? telegram.birthDate : null;
  filled.push(...(await fillProfileDetails(userId, { birthDate, heightCm, name: telegram?.name })));
  return { filled, me: await toMeView(userId), telegramPhoto: Boolean(telegram?.photoFileId) };
}

// Deletes a photo that stopped being the profile photo, unless it's used somewhere else too.
async function discardAvatar(userId: string, attachmentId: string): Promise<void> {
  const row = await prisma.userAttachment.findFirst({
    where: {
      avatarOf: null,
      catalogImages: { none: {} },
      id: attachmentId,
      mealPhotos: { none: {} },
      progressPhotos: { none: {} },
      sessionId: API_UPLOAD_SESSION,
      userId,
    },
  });
  if (!row) {
    return;
  }
  await prisma.userAttachment.delete({ where: { id: row.id } });
  apiDeps().background(() => apiDeps().blobs.remove(row.blobUrl));
}

async function setAvatar(userId: string, avatarId: string | null): Promise<void> {
  const before = await prisma.userProfile.findUnique({ select: { avatarId: true }, where: { userId } });
  await prisma.userProfile.upsert({ create: { avatarId, userId }, update: { avatarId }, where: { userId } });
  if (before?.avatarId && before.avatarId !== avatarId) {
    await discardAvatar(userId, before.avatarId);
  }
}

export const profileRoutes: RouteDefinition[] = [
  {
    // Safe to call often: only details that are empty, and that the person never set or cleared, change.
    async handler({ request, user }) {
      const fromPhone = await readJson(
        request,
        z
          .object({
            birthDate: birthDateSchema.optional(),
            gender: genderSchema.optional(),
            heightCm: heightSchema.optional(),
          })
          .strict(),
      );
      return fillFromApps(user.id, fromPhone);
    },
    method: "POST",
    path: "/me/profile-fill",
  },
  {
    async handler({ request, user }) {
      const { uploadId } = await readJson(request, z.object({ uploadId: z.string().min(1) }));
      const [row] = await requireOwnedAttachments(user.id, [uploadId]);
      await setAvatar(user.id, row!.id);
      return toMeView(user.id);
    },
    method: "PUT",
    path: "/me/avatar",
  },
  {
    async handler({ user }) {
      await setAvatar(user.id, null);
      return toMeView(user.id);
    },
    method: "DELETE",
    path: "/me/avatar",
  },
  {
    // The person's Telegram photo, for the app to crop; nothing is saved here.
    async handler({ user }) {
      const profile = await telegramProfile(user.id);
      const bytes = profile?.photoFileId ? await apiDeps().telegram.photo(profile.photoFileId) : null;
      const mediaType = bytes ? sniffImageMediaType(bytes.subarray(0, 16)) : null;
      if (!bytes || !mediaType) {
        throw notFound("There's no photo on your Telegram account.");
      }
      return new Response(Buffer.from(bytes), {
        headers: { "Cache-Control": "private, no-store", "Content-Type": mediaType },
      });
    },
    method: "GET",
    path: "/me/telegram-photo",
  },
];
