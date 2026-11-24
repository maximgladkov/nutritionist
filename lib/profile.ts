import { prisma } from "./prisma.ts";
import { parseYmd } from "./timezone.ts";

// The person's own details (name, photo, gender, birth date, height) and the rules around them.

export const PROFILE_GENDERS = ["female", "male", "nonbinary", "undisclosed"] as const;
export type ProfileGender = (typeof PROFILE_GENDERS)[number];

export const HEIGHT_CM_MIN = 50;
export const HEIGHT_CM_MAX = 272;

// Details that can be filled in from connected apps.
export const FILL_FIELDS = ["birthDate", "gender", "heightCm", "name"] as const;
export type FillField = (typeof FILL_FIELDS)[number];

export type ProfileDetails = { birthDate?: string | null; gender?: string | null; heightCm?: number | null };

export function isBirthDate(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || parseYmd(value) === null) {
    return false;
  }
  return value >= "1900-01-01" && value <= now.toISOString().slice(0, 10);
}

export function isHeightCm(value: number): boolean {
  return Number.isFinite(value) && value >= HEIGHT_CM_MIN && value <= HEIGHT_CM_MAX;
}

export function readGender(value: string | null | undefined): ProfileGender | null {
  return PROFILE_GENDERS.find((gender) => gender === value) ?? null;
}

export function readSettled(fields: readonly string[] | undefined): FillField[] {
  return FILL_FIELDS.filter((field) => fields?.includes(field));
}

// Where an uploaded profile photo is served; null when there's none.
export function avatarUrl(profile: { avatarId: string | null } | null | undefined): string | null {
  return profile?.avatarId ? `/api/v1/uploads/${encodeURIComponent(profile.avatarId)}/content` : null;
}

// Include this on a user to show their name and photo.
export const personSelect = { name: true, profile: { select: { avatarId: true } } } as const;

// Someone else's profile photo opens for the people who see their name next to it in a group:
// - the owner of a group they're in, and any member of a group they own;
// - fellow members, while the group's member list is visible.
// Being invited isn't enough, and leaving ends it.
export async function canSeeAvatar(attachmentId: string, viewerId: string): Promise<boolean> {
  const group = await prisma.group.findFirst({
    select: { id: true },
    where: {
      members: { some: { user: { profile: { avatarId: attachmentId } } } },
      AND: { members: { some: { userId: viewerId } } },
      OR: [{ ownerId: viewerId }, { membersVisible: true }, { owner: { profile: { avatarId: attachmentId } } }],
    },
  });
  return group !== null;
}

// Set or cleared by the person, which settles it: connected apps no longer fill it in.
export async function saveProfileDetails(userId: string, patch: ProfileDetails & { name?: string | null }): Promise<void> {
  const { name, ...details } = patch;
  const fields = Object.keys(patch).filter((field) => patch[field as FillField] !== undefined) as FillField[];
  if (fields.length === 0) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.user.update({ data: { name }, where: { id: userId } });
    }
    const current = await tx.userProfile.findUnique({ select: { settledFields: true }, where: { userId } });
    const settledFields = [...new Set([...readSettled(current?.settledFields), ...fields])];
    const data = { ...details, settledFields };
    await tx.userProfile.upsert({ create: { userId, ...data }, update: data, where: { userId } });
  });
}

// From a connected app: only goes into details that are empty and that the person never set or
// cleared themselves. Returns the ones it filled.
export async function fillProfileDetails(
  userId: string,
  values: ProfileDetails & { name?: string | null },
): Promise<FillField[]> {
  return prisma.$transaction(async (tx) => {
    await tx.userProfile.upsert({ create: { userId }, update: {}, where: { userId } });
    const filled: FillField[] = [];
    // Each write checks again, so a detail typed or cleared meanwhile is never replaced.
    if (values.name) {
      const { count } = await tx.user.updateMany({
        data: { name: values.name },
        where: {
          NOT: { profile: { settledFields: { has: "name" } } },
          OR: [{ name: null }, { name: "" }],
          id: userId,
        },
      });
      if (count > 0) filled.push("name");
    }
    for (const field of ["birthDate", "gender", "heightCm"] as const) {
      const value = values[field];
      if (value === undefined || value === null) continue;
      const { count } = await tx.userProfile.updateMany({
        data: { [field]: value },
        where: { NOT: { settledFields: { has: field } }, [field]: null, userId },
      });
      if (count > 0) filled.push(field);
    }
    return filled;
  });
}
