import type { GroupInvite, Prisma } from "../generated/prisma/client";
import { groupInviteLinks } from "./app-url.ts";
import { discardGroupCover, uploadGroupCover } from "./group-images.ts";
import {
  GroupError,
  GroupFullError,
  GROUP_DESCRIPTION_MAX,
  GROUP_MESSAGE_MAX,
  GROUP_NAME_MAX,
  GROUP_INVITE_NOTE_MAX,
  GROUP_OWNER_TITLE_MAX,
  type GroupRole,
} from "./groups-core.ts";
import {
  generateInviteToken,
  isInviteToken,
  planMembershipMerge,
} from "./groups-invite.ts";
import { reassignDayReviewsOnUserMerge } from "./group-reviews.ts";
import { generateJoinCode, normalizeJoinCode } from "./groups-join-code.ts";
import { pushToUser } from "./api/push.ts";
import { pushCopy, userLocale } from "./push-copy.ts";
import { clientCapReached } from "./plans.ts";
import { resolveLocale, type Locale } from "./i18n/locales.ts";
import { avatarUrl, personSelect } from "./profile.ts";
import { prisma } from "./prisma.ts";
import { resolveReachTarget } from "./reminders.ts";
import { sendTelegramBotMessage, telegramGroupsMiniAppUrl } from "./telegram-notify.ts";

export {
  GroupError,
  GROUP_DESCRIPTION_MAX,
  GROUP_IMAGE_MAX_BYTES,
  GROUP_MESSAGE_MAX,
  GROUP_NAME_MAX,
  GROUP_NOTICE_BODY_MAX,
  GROUP_NOTICE_TITLE_MAX,
  GROUP_OWNER_TITLE_MAX,
  type GroupRole,
} from "./groups-core.ts";

export type GroupListItem = {
  readonly description: string;
  readonly id: string;
  readonly imageUrl: string;
  // Null for members when the owner hides the member list, so the size stays private too.
  readonly memberCount: number | null;
  readonly membersVisible: boolean;
  // What sharing members show the owner.
  readonly shares: readonly GroupShareKind[];
  readonly name: string;
  readonly ownerAvatarUrl: string | null;
  readonly ownerName: string | null;
  readonly ownerTitle: string;
  // Items the owner added to the list that this member hasn't answered yet.
  readonly pendingShares: readonly GroupShareKind[];
  readonly role: GroupRole;
};

export const GROUP_SHARE_KINDS = ["summary", "meals", "photos", "weight", "activity"] as const;
export type GroupShareKind = (typeof GROUP_SHARE_KINDS)[number];
export const DEFAULT_GROUP_SHARES: readonly GroupShareKind[] = ["summary", "meals", "photos", "activity"];

export type GroupInvitePreview = {
  readonly description: string;
  readonly imageUrl: string;
  readonly locale: Locale;
  // Null for members when the owner hides the member list, so the size stays private too.
  readonly memberCount: number | null;
  readonly membersVisible: boolean;
  // What sharing members show the owner.
  readonly shares: readonly GroupShareKind[];
  readonly name: string;
  readonly ownerName: string | null;
  readonly ownerTitle: string;
  // A personal invite works once; the group's own code and link keep working.
  readonly singleUse: boolean;
  readonly token: string;
};

export type PersonalInviteView = {
  readonly code: string;
  readonly createdAt: string;
  readonly id: string;
  readonly note: string;
  readonly revokedAt: string | null;
  readonly telegramInviteUrl: string | null;
  readonly token: string;
  readonly usedAt: string | null;
  readonly usedByName: string | null;
  readonly webInviteUrl: string | null;
};

export type GroupMemberView = {
  readonly avatarUrl: string | null;
  readonly joinedAt: string;
  readonly name: string | null;
  readonly userId: string;
};

export type GroupMessageView = {
  readonly body: string;
  readonly createdAt: string;
  readonly fromName: string | null;
  // The member marked this comment helpful.
  readonly helpful: boolean;
  readonly id: string;
};

export type GroupOwnerDetail = {
  readonly description: string;
  readonly id: string;
  readonly imageUrl: string;
  readonly inviteToken: string;
  readonly joinCode: string | null;
  // Members only (not the owner), with whether each shares their diary.
  // Members only (not the owner): whether each shares their diary, what of the group's list they
  // agreed to, and what they haven't answered yet.
  readonly members: readonly (GroupMemberView & {
    readonly pendingShares: readonly GroupShareKind[];
    readonly shares: readonly GroupShareKind[];
    readonly sharing: boolean;
  })[];
  readonly membersVisible: boolean;
  // What sharing members show the owner.
  readonly shares: readonly GroupShareKind[];
  readonly name: string;
  readonly ownerTitle: string;
  readonly role: "owner";
  readonly telegramInviteUrl: string | null;
  readonly webInviteUrl: string | null;
};

export type GroupMemberDetail = {
  readonly description: string;
  readonly id: string;
  readonly imageUrl: string;
  // Null for members when the owner hides the member list, so the size stays private too.
  readonly memberCount: number | null;
  // Everyone in the group, owner first (the enum orders owner before member); null when the owner hides the member list.
  readonly members: readonly GroupMemberView[] | null;
  readonly membersVisible: boolean;
  // What sharing members show the owner.
  readonly shares: readonly GroupShareKind[];
  readonly messages: readonly GroupMessageView[];
  readonly name: string;
  readonly ownerId: string;
  readonly ownerAvatarUrl: string | null;
  readonly ownerName: string | null;
  readonly ownerTitle: string;
  readonly role: "member";
  // What you agreed to show the owner (from the group's list), and what they've asked for since.
  readonly allowedShares: readonly GroupShareKind[];
  readonly pendingShares: readonly GroupShareKind[];
};

export type JoinGroupResult = {
  readonly alreadyMember: boolean;
  readonly groupId: string;
  readonly role: GroupRole;
};

export async function listGroupsForUser(userId: string): Promise<GroupListItem[]> {
  const memberships = await prisma.groupMember.findMany({
    include: {
      group: {
        include: {
          _count: { select: { members: true } },
          owner: { select: personSelect },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
    where: { userId },
  });
  return memberships.map((row) => ({
    description: row.group.description,
    id: row.group.id,
    imageUrl: row.group.imageUrl,
    memberCount: row.role === "member" && !row.group.membersVisible ? null : row.group._count.members,
    membersVisible: row.group.membersVisible,
    shares: row.group.shares,
    name: row.group.name,
    ownerAvatarUrl: avatarUrl(row.group.owner.profile),
    ownerName: row.group.owner.name,
    ownerTitle: row.group.ownerTitle,
    pendingShares: row.role === "member" ? pendingShares(row.group.shares, row.answeredShares) : [],
    role: row.role,
  }));
}

// What the owner sees of a member: the group's list, limited to what the member agreed to.
export function effectiveShares(groupShares: readonly GroupShareKind[], allowed: readonly GroupShareKind[]): GroupShareKind[] {
  return groupShares.filter((kind) => allowed.includes(kind));
}

export function pendingShares(groupShares: readonly GroupShareKind[], answered: readonly GroupShareKind[]): GroupShareKind[] {
  return groupShares.filter((kind) => !answered.includes(kind));
}

// The member answers the group's current list: they allow `allowed` (within it), and every item on
// it counts as answered, so the rest are declined until they change their mind.
export async function setMemberShares(input: {
  allowed: readonly GroupShareKind[];
  groupId: string;
  userId: string;
}): Promise<{ allowedShares: GroupShareKind[]; pendingShares: GroupShareKind[] }> {
  const member = await prisma.groupMember.findUnique({
    include: { group: { select: { shares: true } } },
    where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
  });
  if (!member || member.role !== "member") {
    throw new GroupError("You are not a member of that group.");
  }
  const allowedShares = GROUP_SHARE_KINDS.filter(
    (kind) => input.allowed.includes(kind) || (member.allowedShares.includes(kind) && !member.group.shares.includes(kind)),
  );
  const answeredShares = GROUP_SHARE_KINDS.filter((kind) => member.answeredShares.includes(kind) || member.group.shares.includes(kind));
  await prisma.groupMember.update({ data: { allowedShares, answeredShares }, where: { id: member.id } });
  return { allowedShares: effectiveShares(member.group.shares, allowedShares), pendingShares: [] };
}

// An invite is a group's own link token or typed code (reusable until the owner resets them), or a
// personal invite's token or code (good for one join, unless revoked).
type ResolvedInvite = {
  group: Prisma.GroupGetPayload<{ include: { _count: { select: { members: true } }; owner: { select: { name: true } } } }>;
  personal: GroupInvite | null;
};

const inviteGroupInclude = { _count: { select: { members: true } }, owner: { select: { name: true } } } as const;

async function resolveInvite(tokenOrCode: string): Promise<ResolvedInvite | null> {
  const value = tokenOrCode.trim();
  const joinCode = isInviteToken(value) ? null : normalizeJoinCode(value);
  if (!isInviteToken(value) && !joinCode) {
    return null;
  }
  const group = await prisma.group.findUnique({
    include: inviteGroupInclude,
    where: joinCode ? { joinCode } : { inviteToken: value },
  });
  if (group) {
    return { group, personal: null };
  }
  const personal = await prisma.groupInvite.findUnique({
    include: { group: { include: inviteGroupInclude } },
    where: joinCode ? { code: joinCode } : { token: value },
  });
  if (!personal || personal.usedAt || personal.revokedAt) {
    return null;
  }
  const { group: personalGroup, ...invite } = personal;
  return { group: personalGroup, personal: invite };
}

export async function getGroupInvitePreview(tokenOrCode: string): Promise<GroupInvitePreview> {
  const resolved = await resolveInvite(tokenOrCode);
  if (!resolved) {
    throw new GroupError("That invite link is not valid.");
  }
  const { group, personal } = resolved;
  return {
    description: group.description,
    imageUrl: group.imageUrl,
    locale: resolveLocale(group.locale),
    memberCount: group.membersVisible ? group._count.members : null,
    membersVisible: group.membersVisible,
    name: group.name,
    ownerName: group.owner.name,
    ownerTitle: group.ownerTitle,
    shares: group.shares,
    singleUse: personal !== null,
    token: personal?.token ?? group.inviteToken,
  };
}

export async function getMembershipForInvite(input: {
  token: string;
  userId: string;
}): Promise<{ groupId: string; role: GroupRole } | null> {
  const resolved = await resolveInvite(input.token);
  if (!resolved) {
    return null;
  }
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: resolved.group.id, userId: input.userId } },
  });
  if (!member) {
    return null;
  }
  return { groupId: resolved.group.id, role: member.role };
}

export async function createGroup(input: {
  description: string;
  image?: File;
  membersVisible?: boolean;
  name: string;
  ownerId: string;
  ownerTitle?: string;
  shares?: readonly GroupShareKind[];
}): Promise<GroupListItem> {
  const name = normalizeName(input.name);
  const description = normalizeDescription(input.description);
  const ownerTitle = normalizeOwnerTitle(input.ownerTitle ?? "");
  const inviteToken = await uniqueInviteToken();
  const joinCode = await uniqueJoinCode(name);
  const profile = await prisma.userProfile.findUnique({
    select: { locale: true },
    where: { userId: input.ownerId },
  });
  const group = await prisma.group.create({
    data: {
      description,
      imageBlobPath: "",
      imageUrl: "",
      inviteToken,
      joinCode,
      locale: resolveLocale(profile?.locale),
      members: {
        create: { role: "owner", userId: input.ownerId },
      },
      membersVisible: input.membersVisible ?? true,
      ownerTitle,
      shares: normalizeShares(input.shares ?? DEFAULT_GROUP_SHARES),
      name,
      ownerId: input.ownerId,
    },
  });
  if (!input.image || input.image.size === 0) {
    return {
      description: group.description,
      id: group.id,
      imageUrl: group.imageUrl,
      memberCount: 1,
      membersVisible: group.membersVisible,
      shares: group.shares,
      name: group.name,
      ownerAvatarUrl: null,
      ownerName: null,
      pendingShares: [],
      ownerTitle: group.ownerTitle,
      role: "owner",
    };
  }
  try {
    const cover = await uploadGroupCover({ file: input.image, groupId: group.id });
    const updated = await prisma.group.update({
      data: { imageBlobPath: cover.imageBlobPath, imageUrl: cover.imageUrl },
      where: { id: group.id },
    });
    return {
      description: updated.description,
      id: updated.id,
      imageUrl: updated.imageUrl,
      memberCount: 1,
      membersVisible: updated.membersVisible,
      shares: updated.shares,
      name: updated.name,
      ownerAvatarUrl: null,
      ownerName: null,
      pendingShares: [],
      ownerTitle: updated.ownerTitle,
      role: "owner",
    };
  } catch (error) {
    await prisma.group.delete({ where: { id: group.id } }).catch(() => undefined);
    throw error;
  }
}

export async function updateGroup(input: {
  description?: string;
  groupId: string;
  image?: File;
  membersVisible?: boolean;
  name?: string;
  ownerId: string;
  ownerTitle?: string;
  // Back to the initials; a new image in the same request wins.
  removeImage?: boolean;
  shares?: readonly GroupShareKind[];
}): Promise<void> {
  await requireOwnedGroup(input.groupId, input.ownerId);
  const data: Prisma.GroupUpdateInput = {};
  if (input.name !== undefined) {
    data.name = normalizeName(input.name);
  }
  if (input.description !== undefined) {
    data.description = normalizeDescription(input.description);
  }
  if (input.membersVisible !== undefined) {
    data.membersVisible = input.membersVisible;
  }
  if (input.shares !== undefined) {
    data.shares = normalizeShares(input.shares);
  }
  if (input.ownerTitle !== undefined) {
    data.ownerTitle = normalizeOwnerTitle(input.ownerTitle);
  }
  if (input.image && input.image.size > 0) {
    const cover = await uploadGroupCover({ file: input.image, groupId: input.groupId });
    data.imageBlobPath = cover.imageBlobPath;
    data.imageUrl = cover.imageUrl;
  } else if (input.removeImage) {
    data.imageBlobPath = "";
    data.imageUrl = "";
  }
  if (Object.keys(data).length === 0) {
    throw new GroupError("Choose a name, description, or image to update.");
  }
  const before = await prisma.group.findUnique({
    select: { imageUrl: true, name: true, shares: true },
    where: { id: input.groupId },
  });
  await prisma.group.update({ data, where: { id: input.groupId } });
  if (data.imageUrl !== undefined && before?.imageUrl && before.imageUrl !== data.imageUrl) {
    await discardGroupCover(before.imageUrl);
  }
  const added = (data.shares as GroupShareKind[] | undefined)?.filter((kind) => !before?.shares.includes(kind)) ?? [];
  if (added.length > 0) {
    void notifyShareAsk({ added, groupId: input.groupId, groupName: before?.name ?? "", ownerId: input.ownerId });
  }
}

export async function deleteGroup(input: { groupId: string; ownerId: string }): Promise<void> {
  const group = await requireOwnedGroup(input.groupId, input.ownerId);
  await prisma.group.delete({ where: { id: input.groupId } });
  await discardGroupCover(group.imageUrl);
}

// Rotating revokes both the link and the typed code.
export async function rotateInviteToken(input: { groupId: string; ownerId: string }): Promise<string> {
  const group = await requireOwnedGroup(input.groupId, input.ownerId);
  const inviteToken = await uniqueInviteToken();
  const joinCode = await uniqueJoinCode(group.name);
  await prisma.group.update({ data: { inviteToken, joinCode }, where: { id: input.groupId } });
  return inviteToken;
}

export async function joinGroupByToken(input: {
  sharing?: boolean;
  token: string;
  userId: string;
}): Promise<JoinGroupResult> {
  const resolved = await resolveInvite(input.token);
  if (!resolved) {
    throw new GroupError("That invite link is not valid.");
  }
  const { group, personal } = resolved;
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: input.userId } },
  });
  if (existing) {
    // Opening a personal invite you don't need leaves it for its person.
    return { alreadyMember: true, groupId: group.id, role: existing.role };
  }
  if (await clientCapReached(group.ownerId, input.userId, new Date())) {
    throw new GroupFullError();
  }
  await prisma.$transaction(async (tx) => {
    if (personal) {
      // Claims the invite only if nobody used or revoked it in the meantime.
      const claimed = await tx.groupInvite.updateMany({
        data: { usedAt: new Date(), usedById: input.userId },
        where: { id: personal.id, revokedAt: null, usedAt: null },
      });
      if (claimed.count === 0) {
        throw new GroupError("That invite link is not valid.");
      }
    }
    await tx.groupMember.create({
      // Joining agrees to everything the group lists right now.
      data: {
        allowedShares: group.shares,
        answeredShares: group.shares,
        groupId: group.id,
        role: "member",
        sharing: input.sharing ?? true,
        userId: input.userId,
      },
    });
  });
  return { alreadyMember: false, groupId: group.id, role: "member" };
}

function personalInviteView(row: GroupInvite & { usedBy: { name: string | null } | null }): PersonalInviteView {
  const links = groupInviteLinks(row.token);
  return {
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    note: row.note,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    telegramInviteUrl: links.telegramInviteUrl,
    token: row.token,
    usedAt: row.usedAt?.toISOString() ?? null,
    usedByName: row.usedBy?.name ?? null,
    webInviteUrl: links.webInviteUrl,
  };
}

// A code and link for one person; it stops working once someone joins with it.
export async function createPersonalInvite(input: {
  groupId: string;
  note?: string;
  ownerId: string;
}): Promise<PersonalInviteView> {
  const group = await requireOwnedGroup(input.groupId, input.ownerId);
  const note = (input.note ?? "").trim().replace(/\s+/gu, " ");
  if (note.length > GROUP_INVITE_NOTE_MAX) {
    throw new GroupError("Choose a shorter note.");
  }
  const row = await prisma.groupInvite.create({
    data: {
      code: await uniqueJoinCode(group.name),
      createdById: input.ownerId,
      groupId: input.groupId,
      note,
      token: await uniqueInviteToken(),
    },
    include: { usedBy: { select: { name: true } } },
  });
  return personalInviteView(row);
}

// Personal invites still waiting to be used, then the ones used or revoked in the last 30 days.
export async function listPersonalInvites(input: { groupId: string; ownerId: string }): Promise<PersonalInviteView[]> {
  await requireOwnedGroup(input.groupId, input.ownerId);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.groupInvite.findMany({
    include: { usedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
    where: {
      groupId: input.groupId,
      OR: [{ revokedAt: null, usedAt: null }, { usedAt: { gte: since } }, { revokedAt: { gte: since } }],
    },
  });
  return rows.map(personalInviteView);
}

export async function revokePersonalInvite(input: { groupId: string; inviteId: string; ownerId: string }): Promise<void> {
  await requireOwnedGroup(input.groupId, input.ownerId);
  const revoked = await prisma.groupInvite.updateMany({
    data: { revokedAt: new Date() },
    where: { groupId: input.groupId, id: input.inviteId, revokedAt: null, usedAt: null },
  });
  if (revoked.count === 0) {
    throw new GroupError("Invite not found.");
  }
}

// Clears a revoked invite from the owner's list. Unused ones are revoked first and used ones stay,
// since they record who joined with them.
export async function removePersonalInvite(input: { groupId: string; inviteId: string; ownerId: string }): Promise<void> {
  await requireOwnedGroup(input.groupId, input.ownerId);
  const removed = await prisma.groupInvite.deleteMany({
    where: { groupId: input.groupId, id: input.inviteId, revokedAt: { not: null } },
  });
  if (removed.count === 0) {
    throw new GroupError("Invite not found.");
  }
}

export async function leaveGroup(input: { groupId: string; userId: string }): Promise<void> {
  const member = await prisma.groupMember.findUnique({
    include: { group: { select: { ownerId: true } } },
    where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
  });
  if (!member) {
    throw new GroupError("You are not in that group.");
  }
  if (member.group.ownerId === input.userId || member.role === "owner") {
    throw new GroupError("Owners can delete the group instead of leaving.");
  }
  await prisma.groupMember.delete({ where: { id: member.id } });
}

export async function removeGroupMember(input: {
  groupId: string;
  memberId: string;
  ownerId: string;
}): Promise<void> {
  const group = await requireOwnedGroup(input.groupId, input.ownerId);
  if (input.memberId === group.ownerId) {
    throw new GroupError("Owners cannot be removed.");
  }
  const deleted = await prisma.groupMember.deleteMany({
    where: { groupId: input.groupId, role: "member", userId: input.memberId },
  });
  if (deleted.count === 0) {
    throw new GroupError("That person is not in this group.");
  }
}

export async function getOwnedGroupDetail(input: {
  groupId: string;
  ownerId: string;
}): Promise<GroupOwnerDetail> {
  const group = await prisma.group.findUnique({
    include: {
      members: {
        include: { user: { select: personSelect } },
        orderBy: { joinedAt: "asc" },
      },
    },
    where: { id: input.groupId },
  });
  if (!group || group.ownerId !== input.ownerId) {
    throw new GroupError("You cannot edit that group.");
  }
  const links = groupInviteLinks(group.inviteToken);
  return {
    description: group.description,
    id: group.id,
    imageUrl: group.imageUrl,
    inviteToken: group.inviteToken,
    joinCode: group.joinCode,
    members: group.members
      .filter((row) => row.userId !== group.ownerId)
      .map((row) => ({
        avatarUrl: avatarUrl(row.user.profile),
        joinedAt: row.joinedAt.toISOString(),
        name: row.user.name,
        pendingShares: pendingShares(group.shares, row.answeredShares),
        shares: effectiveShares(group.shares, row.allowedShares),
        sharing: row.sharing,
        userId: row.userId,
      })),
    membersVisible: group.membersVisible,
    shares: group.shares,
    name: group.name,
    ownerTitle: group.ownerTitle,
    role: "owner",
    telegramInviteUrl: links.telegramInviteUrl,
    webInviteUrl: links.webInviteUrl,
  };
}

export async function getJoinedGroupDetail(input: {
  groupId: string;
  userId: string;
}): Promise<GroupMemberDetail> {
  const member = await prisma.groupMember.findUnique({
    include: {
      group: {
        include: {
          _count: { select: { members: true } },
          owner: { select: personSelect },
        },
      },
    },
    where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
  });
  if (!member || member.role === "owner") {
    throw new GroupError("You are not a member of that group.");
  }
  const members = member.group.membersVisible
    ? await prisma.groupMember.findMany({
        include: { user: { select: personSelect } },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        where: { groupId: input.groupId },
      })
    : null;
  const messages = await prisma.groupMessage.findMany({
    include: { fromUser: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    where: { draftFor: null, groupId: input.groupId, toUserId: input.userId },
  });
  return {
    description: member.group.description,
    id: member.group.id,
    imageUrl: member.group.imageUrl,
    memberCount: member.group.membersVisible ? member.group._count.members : null,
    members:
      members?.map((row) => ({
        avatarUrl: avatarUrl(row.user.profile),
        joinedAt: row.joinedAt.toISOString(),
        name: row.user.name,
        userId: row.userId,
      })) ?? null,
    membersVisible: member.group.membersVisible,
    shares: member.group.shares,
    messages: messages.map((row) => ({
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      fromName: row.fromUser.name,
      helpful: row.helpfulAt !== null,
      id: row.id,
    })),
    name: member.group.name,
    ownerId: member.group.ownerId,
    ownerAvatarUrl: avatarUrl(member.group.owner.profile),
    ownerName: member.group.owner.name,
    ownerTitle: member.group.ownerTitle,
    allowedShares: effectiveShares(member.group.shares, member.allowedShares),
    pendingShares: pendingShares(member.group.shares, member.answeredShares),
    role: "member",
  };
}

export async function listMessagesForMember(input: {
  groupId: string;
  memberId: string;
  ownerId: string;
}): Promise<GroupMessageView[]> {
  await requireOwnedMember(input);
  const messages = await prisma.groupMessage.findMany({
    include: { fromUser: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    where: { groupId: input.groupId, toUserId: input.memberId },
  });
  return messages.map((row) => ({
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    fromName: row.fromUser.name,
    helpful: row.helpfulAt !== null,
    id: row.id,
  }));
}

export async function sendGroupMessage(input: {
  body: string;
  // The member's day this waits on: it's kept from them until the owner marks that day reviewed.
  draftFor?: string | null;
  groupId: string;
  memberId: string;
  ownerId: string;
}): Promise<GroupMessageView> {
  const group = await requireOwnedMember(input);
  const body = normalizeMessage(input.body);
  const created = await prisma.groupMessage.create({
    data: {
      body,
      draftFor: input.draftFor ?? null,
      fromUserId: input.ownerId,
      groupId: input.groupId,
      toUserId: input.memberId,
    },
    include: { fromUser: { select: { name: true } } },
  });
  if (input.draftFor) {
    return { body: created.body, createdAt: created.createdAt.toISOString(), fromName: created.fromUser.name, helpful: false, id: created.id };
  }
  void notifyMemberOfMessage({
    body,
    groupName: group.name,
    memberId: input.memberId,
  }).catch((error) => {
    console.error("group message notify failed", error);
  });
  return {
    body: created.body,
    createdAt: created.createdAt.toISOString(),
    fromName: created.fromUser.name,
    helpful: false,
    id: created.id,
  };
}

export async function requireOwnerCanViewMemberNutrition(input: {
  groupId: string;
  memberId: string;
  ownerId: string;
}): Promise<void> {
  await requireOwnedMember(input);
}

export async function reassignGroupsOnUserMerge(
  tx: Prisma.TransactionClient,
  survivorId: string,
  absorbedId: string,
): Promise<void> {
  await tx.group.updateMany({ data: { ownerId: survivorId }, where: { ownerId: absorbedId } });
  await tx.groupNotice.updateMany({ data: { authorId: survivorId }, where: { authorId: absorbedId } });
  await tx.groupInvite.updateMany({ data: { createdById: survivorId }, where: { createdById: absorbedId } });
  await tx.groupInvite.updateMany({ data: { usedById: survivorId }, where: { usedById: absorbedId } });
  await tx.groupMessage.updateMany({
    data: { fromUserId: survivorId },
    where: { fromUserId: absorbedId },
  });
  await tx.groupMessage.updateMany({
    data: { toUserId: survivorId },
    where: { toUserId: absorbedId },
  });
  await reassignDayReviewsOnUserMerge(tx, survivorId, absorbedId);
  const [survivorMembers, absorbedMembers] = await Promise.all([
    tx.groupMember.findMany({ where: { userId: survivorId } }),
    tx.groupMember.findMany({ where: { userId: absorbedId } }),
  ]);
  const plan = planMembershipMerge(survivorMembers, absorbedMembers);
  if (plan.promoteIds.length > 0) {
    await tx.groupMember.updateMany({
      data: { role: "owner" },
      where: { id: { in: plan.promoteIds } },
    });
  }
  if (plan.deleteIds.length > 0) {
    await tx.groupMember.deleteMany({ where: { id: { in: plan.deleteIds } } });
  }
  if (plan.moveIds.length > 0) {
    await tx.groupMember.updateMany({
      data: { userId: survivorId },
      where: { id: { in: plan.moveIds } },
    });
  }
}

function normalizeName(value: string): string {
  const name = value.trim().replace(/\s+/gu, " ");
  if (name.length === 0) {
    throw new GroupError("Choose a group name.");
  }
  if (name.length > GROUP_NAME_MAX) {
    throw new GroupError("Choose a shorter group name.");
  }
  return name;
}

function normalizeDescription(value: string): string {
  const description = value.trim();
  if (description.length > GROUP_DESCRIPTION_MAX) {
    throw new GroupError("Choose a shorter description.");
  }
  return description;
}

function normalizeMessage(value: string): string {
  const body = value.trim();
  if (body.length === 0) {
    throw new GroupError("Write a message.");
  }
  if (body.length > GROUP_MESSAGE_MAX) {
    throw new GroupError("Choose a shorter message.");
  }
  return body;
}

// Tells members who haven't answered the new items that the owner asks for them.
async function notifyShareAsk(input: { added: GroupShareKind[]; groupId: string; groupName: string; ownerId: string }): Promise<void> {
  const [owner, members] = await Promise.all([
    prisma.user.findUnique({ select: { name: true }, where: { id: input.ownerId } }),
    prisma.groupMember.findMany({ select: { answeredShares: true, userId: true }, where: { groupId: input.groupId, role: "member" } }),
  ]);
  await Promise.all(
    members.map(async (member) => {
      const asked = input.added.filter((kind) => !member.answeredShares.includes(kind));
      if (asked.length === 0) {
        return 0;
      }
      const copy = pushCopy(await userLocale(member.userId));
      const who = owner?.name?.trim().split(/\s+/u)[0] || copy.yourCoach;
      return pushToUser(member.userId, {
        body: copy.shareAsk(who, asked),
        data: { groupId: input.groupId, type: "group_share_ask" },
        title: input.groupName,
      });
    }),
  ).catch((error: unknown) => console.error("group share ask notify failed", error));
}

function normalizeShares(value: readonly GroupShareKind[]): GroupShareKind[] {
  const shares = GROUP_SHARE_KINDS.filter((kind) => value.includes(kind));
  if (shares.length === 0) {
    throw new GroupError("Choose at least one thing members share.");
  }
  return shares;
}

function normalizeOwnerTitle(value: string): string {
  const title = value.trim().replace(/\s+/gu, " ");
  if (title.length > GROUP_OWNER_TITLE_MAX) {
    throw new GroupError("Choose a shorter title.");
  }
  return title;
}

async function uniqueJoinCode(name: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const joinCode = generateJoinCode(name);
    const [group, invite] = await Promise.all([
      prisma.group.findUnique({ select: { id: true }, where: { joinCode } }),
      prisma.groupInvite.findUnique({ select: { id: true }, where: { code: joinCode } }),
    ]);
    if (!group && !invite) {
      return joinCode;
    }
  }
  throw new GroupError("Could not create that group.");
}

async function uniqueInviteToken(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteToken = generateInviteToken();
    const [group, invite] = await Promise.all([
      prisma.group.findUnique({ select: { id: true }, where: { inviteToken } }),
      prisma.groupInvite.findUnique({ select: { id: true }, where: { token: inviteToken } }),
    ]);
    if (!group && !invite) {
      return inviteToken;
    }
  }
  throw new GroupError("Could not create that group.");
}

async function requireOwnedGroup(groupId: string, ownerId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group || group.ownerId !== ownerId) {
    throw new GroupError("You cannot edit that group.");
  }
  return group;
}

async function requireOwnedMember(input: { groupId: string; memberId: string; ownerId: string }) {
  const group = await requireOwnedGroup(input.groupId, input.ownerId);
  if (input.memberId === input.ownerId) {
    throw new GroupError("That person is not in this group.");
  }
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: input.groupId, userId: input.memberId } },
  });
  if (!member || member.role !== "member") {
    throw new GroupError("That person is not in this group.");
  }
  return group;
}

export async function notifyMemberOfMessage(input: {
  body: string;
  groupName: string;
  memberId: string;
}): Promise<void> {
  const target = await resolveReachTarget(input.memberId);
  if (!target || target.channel !== "telegram") {
    return;
  }
  const preview = input.body.length > 180 ? `${input.body.slice(0, 177)}...` : input.body;
  const webAppUrl = telegramGroupsMiniAppUrl();
  await sendTelegramBotMessage({
    chatId: target.chatId,
    text: `${input.groupName}\n${preview}`,
    webAppButton: webAppUrl ? { text: "Open", url: webAppUrl } : undefined,
  });
}
