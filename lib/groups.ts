import type { Prisma } from "../generated/prisma/client";
import { groupInviteLinks } from "./app-url.ts";
import { uploadGroupCover } from "./group-images.ts";
import {
  GroupError,
  GROUP_DESCRIPTION_MAX,
  GROUP_MESSAGE_MAX,
  GROUP_NAME_MAX,
  GROUP_OWNER_TITLE_MAX,
  type GroupRole,
} from "./groups-core.ts";
import {
  generateInviteToken,
  isInviteToken,
  planMembershipMerge,
} from "./groups-invite.ts";
import { generateJoinCode, normalizeJoinCode } from "./groups-join-code.ts";
import { resolveLocale, type Locale } from "./i18n/locales.ts";
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
  readonly memberCount: number;
  readonly membersVisible: boolean;
  readonly name: string;
  readonly ownerName: string | null;
  readonly ownerTitle: string;
  readonly role: GroupRole;
};

export type GroupInvitePreview = {
  readonly description: string;
  readonly imageUrl: string;
  readonly locale: Locale;
  readonly memberCount: number;
  readonly membersVisible: boolean;
  readonly name: string;
  readonly ownerName: string | null;
  readonly ownerTitle: string;
  readonly token: string;
};

export type GroupMemberView = {
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
  readonly members: readonly (GroupMemberView & { readonly sharing: boolean })[];
  readonly membersVisible: boolean;
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
  readonly memberCount: number;
  // Everyone in the group, owner first (the enum orders owner before member); null when the owner hides the member list.
  readonly members: readonly GroupMemberView[] | null;
  readonly membersVisible: boolean;
  readonly messages: readonly GroupMessageView[];
  readonly name: string;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly ownerTitle: string;
  readonly role: "member";
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
          owner: { select: { name: true } },
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
    memberCount: row.group._count.members,
    membersVisible: row.group.membersVisible,
    name: row.group.name,
    ownerName: row.group.owner.name,
    ownerTitle: row.group.ownerTitle,
    role: row.role,
  }));
}

// An invite is either the long link token or the short code people type in the app.
function inviteWhere(tokenOrCode: string): Prisma.GroupWhereUniqueInput | null {
  if (isInviteToken(tokenOrCode)) {
    return { inviteToken: tokenOrCode };
  }
  const joinCode = normalizeJoinCode(tokenOrCode);
  return joinCode ? { joinCode } : null;
}

export async function getGroupInvitePreview(tokenOrCode: string): Promise<GroupInvitePreview> {
  const where = inviteWhere(tokenOrCode);
  const group = where
    ? await prisma.group.findUnique({
        include: { _count: { select: { members: true } }, owner: { select: { name: true } } },
        where,
      })
    : null;
  if (!group) {
    throw new GroupError("That invite link is not valid.");
  }
  return {
    description: group.description,
    imageUrl: group.imageUrl,
    locale: resolveLocale(group.locale),
    memberCount: group._count.members,
    membersVisible: group.membersVisible,
    name: group.name,
    ownerName: group.owner.name,
    ownerTitle: group.ownerTitle,
    token: group.inviteToken,
  };
}

export async function getMembershipForInvite(input: {
  token: string;
  userId: string;
}): Promise<{ groupId: string; role: GroupRole } | null> {
  const where = inviteWhere(input.token);
  if (!where) {
    return null;
  }
  const group = await prisma.group.findUnique({ select: { id: true }, where });
  if (!group) {
    return null;
  }
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: input.userId } },
  });
  if (!member) {
    return null;
  }
  return { groupId: group.id, role: member.role };
}

export async function createGroup(input: {
  description: string;
  image?: File;
  membersVisible?: boolean;
  name: string;
  ownerId: string;
  ownerTitle?: string;
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
      name: group.name,
      ownerName: null,
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
      name: updated.name,
      ownerName: null,
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
  if (input.ownerTitle !== undefined) {
    data.ownerTitle = normalizeOwnerTitle(input.ownerTitle);
  }
  if (input.image && input.image.size > 0) {
    const cover = await uploadGroupCover({ file: input.image, groupId: input.groupId });
    data.imageBlobPath = cover.imageBlobPath;
    data.imageUrl = cover.imageUrl;
  }
  if (Object.keys(data).length === 0) {
    throw new GroupError("Choose a name, description, or image to update.");
  }
  await prisma.group.update({ data, where: { id: input.groupId } });
}

export async function deleteGroup(input: { groupId: string; ownerId: string }): Promise<void> {
  await requireOwnedGroup(input.groupId, input.ownerId);
  await prisma.group.delete({ where: { id: input.groupId } });
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
  const where = inviteWhere(input.token);
  const group = where ? await prisma.group.findUnique({ where }) : null;
  if (!group) {
    throw new GroupError("That invite link is not valid.");
  }
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: input.userId } },
  });
  if (existing) {
    return { alreadyMember: true, groupId: group.id, role: existing.role };
  }
  await prisma.groupMember.create({
    data: { groupId: group.id, role: "member", sharing: input.sharing ?? true, userId: input.userId },
  });
  return { alreadyMember: false, groupId: group.id, role: "member" };
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
        include: { user: { select: { name: true } } },
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
        joinedAt: row.joinedAt.toISOString(),
        name: row.user.name,
        sharing: row.sharing,
        userId: row.userId,
      })),
    membersVisible: group.membersVisible,
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
          owner: { select: { name: true } },
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
        include: { user: { select: { name: true } } },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        where: { groupId: input.groupId },
      })
    : null;
  const messages = await prisma.groupMessage.findMany({
    include: { fromUser: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    where: { groupId: input.groupId, toUserId: input.userId },
  });
  return {
    description: member.group.description,
    id: member.group.id,
    imageUrl: member.group.imageUrl,
    memberCount: member.group._count.members,
    members:
      members?.map((row) => ({ joinedAt: row.joinedAt.toISOString(), name: row.user.name, userId: row.userId })) ?? null,
    membersVisible: member.group.membersVisible,
    messages: messages.map((row) => ({
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      fromName: row.fromUser.name,
      helpful: row.helpfulAt !== null,
      id: row.id,
    })),
    name: member.group.name,
    ownerId: member.group.ownerId,
    ownerName: member.group.owner.name,
    ownerTitle: member.group.ownerTitle,
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
  groupId: string;
  memberId: string;
  ownerId: string;
}): Promise<GroupMessageView> {
  const group = await requireOwnedMember(input);
  const body = normalizeMessage(input.body);
  const created = await prisma.groupMessage.create({
    data: {
      body,
      fromUserId: input.ownerId,
      groupId: input.groupId,
      toUserId: input.memberId,
    },
    include: { fromUser: { select: { name: true } } },
  });
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
  await tx.groupMessage.updateMany({
    data: { fromUserId: survivorId },
    where: { fromUserId: absorbedId },
  });
  await tx.groupMessage.updateMany({
    data: { toUserId: survivorId },
    where: { toUserId: absorbedId },
  });
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
    const existing = await prisma.group.findUnique({ select: { id: true }, where: { joinCode } });
    if (!existing) {
      return joinCode;
    }
  }
  throw new GroupError("Could not create that group.");
}

async function uniqueInviteToken(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteToken = generateInviteToken();
    const existing = await prisma.group.findUnique({
      select: { id: true },
      where: { inviteToken },
    });
    if (!existing) {
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

async function notifyMemberOfMessage(input: {
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
