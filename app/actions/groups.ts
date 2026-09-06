"use server";

import { t } from "@lingui/core/macro";
import type { I18n } from "@lingui/core";
import { resolveAppUser, type ResolveAppUserResult } from "@/lib/app-user";
import { groupInviteLinks } from "@/lib/app-url";
import {
  createGroup,
  deleteGroup,
  getGroupInvitePreview,
  getJoinedGroupDetail,
  getMembershipForInvite,
  getOwnedGroupDetail,
  GroupError,
  joinGroupByToken,
  leaveGroup,
  listGroupsForUser,
  listMessagesForMember,
  removeGroupMember,
  requireOwnerCanViewMemberNutrition,
  rotateInviteToken,
  sendGroupMessage,
  updateGroup,
  type GroupInvitePreview,
  type GroupListItem,
  type GroupMemberDetail,
  type GroupMessageView,
  type GroupOwnerDetail,
  type JoinGroupResult,
} from "@/lib/groups";
import { getRequestI18n } from "@/lib/i18n/request-locale";
import { parseYmd } from "@/lib/timezone";
import {
  loadNutritionDay,
  loadNutritionDays,
  loadNutritionDiary,
  type NutritionDayPayload,
  type NutritionDaysPayload,
  type NutritionDiaryPayload,
} from "@/lib/summary";

export type GroupsAuthReason = "unauthenticated" | "telegram" | "invalid";

export type GroupsMutationResult =
  | { ok: true }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type GroupsListResult =
  | { ok: true; data: GroupListItem[] }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type GroupInvitePreviewResult =
  | { ok: true; data: GroupInvitePreview }
  | { ok: false; error: string; reason: "invalid" };

export type GroupInviteMembershipResult =
  | { ok: true; data: { groupId: string; role: "owner" | "member" } | null }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type JoinGroupActionResult =
  | { ok: true; data: JoinGroupResult }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type GroupOwnerDetailResult =
  | { ok: true; data: GroupOwnerDetail }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type GroupMemberDetailResult =
  | { ok: true; data: GroupMemberDetail }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type GroupMessagesResult =
  | { ok: true; data: GroupMessageView[] }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type SendGroupMessageResult =
  | { ok: true; data: GroupMessageView }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type RotateInviteResult =
  | {
      ok: true;
      data: { inviteToken: string; telegramInviteUrl: string | null; webInviteUrl: string | null };
    }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type MemberNutritionDiaryResult =
  | { ok: true; data: NutritionDiaryPayload }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type MemberNutritionDayResult =
  | { ok: true; data: NutritionDayPayload }
  | { ok: false; error: string; reason: GroupsAuthReason };

export type MemberNutritionDaysResult =
  | { ok: true; data: NutritionDaysPayload }
  | { ok: false; error: string; reason: GroupsAuthReason };

export async function getGroupInvitePreviewAction(token: string): Promise<GroupInvitePreviewResult> {
  const i18n = await getRequestI18n();
  try {
    const data = await getGroupInvitePreview(token.trim());
    return { data, ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`That invite link is not valid.`), ok: false, reason: "invalid" };
  }
}

export async function getInviteMembershipAction(input: {
  initData?: string;
  token: string;
}): Promise<GroupInviteMembershipResult> {
  const user = await resolveGroupsUser(input.initData, { allowAnonymous: true });
  if (!user.ok) {
    if (user.reason === "unauthenticated") {
      return { data: null, ok: true };
    }
    return user;
  }
  const data = await getMembershipForInvite({ token: input.token.trim(), userId: user.userId });
  return { data, ok: true };
}

export async function listGroupsAction(input: { initData?: string }): Promise<GroupsListResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const data = await listGroupsForUser(user.userId);
  return { data, ok: true };
}

export async function createGroupAction(formData: FormData): Promise<GroupsMutationResult> {
  const user = await resolveGroupsUser(stringField(formData, "initData") || undefined);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    await createGroup({
      description: stringField(formData, "description"),
      image: readImageFile(formData),
      name: stringField(formData, "name"),
      ownerId: user.userId,
    });
    return { ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not create that group.`), ok: false, reason: "invalid" };
  }
}

export async function updateGroupAction(formData: FormData): Promise<GroupsMutationResult> {
  const user = await resolveGroupsUser(stringField(formData, "initData") || undefined);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  const groupId = stringField(formData, "groupId");
  if (groupId.length === 0) {
    return { error: t(i18n)`Choose a group to update.`, ok: false, reason: "invalid" };
  }
  try {
    await updateGroup({
      description: optionalField(formData, "description"),
      groupId,
      image: readImageFile(formData),
      name: optionalField(formData, "name"),
      ownerId: user.userId,
    });
    return { ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not update that group.`), ok: false, reason: "invalid" };
  }
}

export async function deleteGroupAction(input: {
  groupId: string;
  initData?: string;
}): Promise<GroupsMutationResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    await deleteGroup({ groupId: input.groupId.trim(), ownerId: user.userId });
    return { ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not delete that group.`), ok: false, reason: "invalid" };
  }
}

export async function rotateInviteTokenAction(input: {
  groupId: string;
  initData?: string;
}): Promise<RotateInviteResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    const inviteToken = await rotateInviteToken({ groupId: input.groupId.trim(), ownerId: user.userId });
    return { data: { inviteToken, ...groupInviteLinks(inviteToken) }, ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not reset that invite link.`), ok: false, reason: "invalid" };
  }
}

export async function joinGroupAction(input: {
  initData?: string;
  token: string;
}): Promise<JoinGroupActionResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    const data = await joinGroupByToken({ token: input.token.trim(), userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not join that group.`), ok: false, reason: "invalid" };
  }
}

export async function leaveGroupAction(input: {
  groupId: string;
  initData?: string;
}): Promise<GroupsMutationResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    await leaveGroup({ groupId: input.groupId.trim(), userId: user.userId });
    return { ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not leave that group.`), ok: false, reason: "invalid" };
  }
}

export async function removeGroupMemberAction(input: {
  groupId: string;
  initData?: string;
  memberId: string;
}): Promise<GroupsMutationResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    await removeGroupMember({
      groupId: input.groupId.trim(),
      memberId: input.memberId.trim(),
      ownerId: user.userId,
    });
    return { ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not remove that person.`), ok: false, reason: "invalid" };
  }
}

export async function getOwnedGroupDetailAction(input: {
  groupId: string;
  initData?: string;
}): Promise<GroupOwnerDetailResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    const data = await getOwnedGroupDetail({ groupId: input.groupId.trim(), ownerId: user.userId });
    return { data, ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not load that group.`), ok: false, reason: "invalid" };
  }
}

export async function getJoinedGroupDetailAction(input: {
  groupId: string;
  initData?: string;
}): Promise<GroupMemberDetailResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    const data = await getJoinedGroupDetail({ groupId: input.groupId.trim(), userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not load that group.`), ok: false, reason: "invalid" };
  }
}

export async function listMemberMessagesAction(input: {
  groupId: string;
  initData?: string;
  memberId: string;
}): Promise<GroupMessagesResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    const data = await listMessagesForMember({
      groupId: input.groupId.trim(),
      memberId: input.memberId.trim(),
      ownerId: user.userId,
    });
    return { data, ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not load those messages.`), ok: false, reason: "invalid" };
  }
}

export async function sendGroupMessageAction(input: {
  body: string;
  groupId: string;
  initData?: string;
  memberId: string;
}): Promise<SendGroupMessageResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    const data = await sendGroupMessage({
      body: input.body,
      groupId: input.groupId.trim(),
      memberId: input.memberId.trim(),
      ownerId: user.userId,
    });
    return { data, ok: true };
  } catch (error) {
    return { error: groupErrorMessage(i18n, error, t(i18n)`Could not send that message.`), ok: false, reason: "invalid" };
  }
}

export async function getMemberNutritionDiaryAction(input: {
  groupId: string;
  initData?: string;
  memberId: string;
}): Promise<MemberNutritionDiaryResult> {
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    await requireOwnerCanViewMemberNutrition({
      groupId: input.groupId.trim(),
      memberId: input.memberId.trim(),
      ownerId: user.userId,
    });
    const data = await loadNutritionDiary({ userId: input.memberId.trim() });
    return { data, ok: true };
  } catch (error) {
    const message =
      error instanceof RangeError
        ? error.message
        : groupErrorMessage(i18n, error, t(i18n)`Could not load that summary.`);
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function getMemberNutritionDayAction(input: {
  date: string;
  groupId: string;
  initData?: string;
  memberId: string;
}): Promise<MemberNutritionDayResult> {
  const i18n = await getRequestI18n();
  if (!parseYmd(input.date)) {
    return { error: t(i18n)`Choose a valid date.`, ok: false, reason: "invalid" };
  }
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const userI18n = await getRequestI18n(user.userId);
  try {
    await requireOwnerCanViewMemberNutrition({
      groupId: input.groupId.trim(),
      memberId: input.memberId.trim(),
      ownerId: user.userId,
    });
    const data = await loadNutritionDay({ date: input.date, userId: input.memberId.trim() });
    return { data, ok: true };
  } catch (error) {
    const message =
      error instanceof RangeError
        ? error.message
        : groupErrorMessage(userI18n, error, t(userI18n)`Could not load that day.`);
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function getMemberNutritionDaysAction(input: {
  from: string;
  groupId: string;
  initData?: string;
  memberId: string;
  to: string;
}): Promise<MemberNutritionDaysResult> {
  const i18n = await getRequestI18n();
  if (!parseYmd(input.from) || !parseYmd(input.to)) {
    return { error: t(i18n)`Choose a valid date range.`, ok: false, reason: "invalid" };
  }
  const user = await resolveGroupsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const userI18n = await getRequestI18n(user.userId);
  try {
    await requireOwnerCanViewMemberNutrition({
      groupId: input.groupId.trim(),
      memberId: input.memberId.trim(),
      ownerId: user.userId,
    });
    const data = await loadNutritionDays({
      from: input.from,
      to: input.to,
      userId: input.memberId.trim(),
    });
    return { data, ok: true };
  } catch (error) {
    const message =
      error instanceof RangeError
        ? error.message
        : groupErrorMessage(userI18n, error, t(userI18n)`Could not load those days.`);
    return { error: message, ok: false, reason: "invalid" };
  }
}

async function resolveGroupsUser(
  initData: string | undefined,
  options?: { allowAnonymous?: boolean },
): Promise<
  { ok: true; userId: string } | { ok: false; error: string; reason: "unauthenticated" | "telegram" }
> {
  const user = await resolveAppUser(initData);
  const i18n = await getRequestI18n(user.ok ? user.userId : undefined);
  if (!user.ok && user.reason === "unauthenticated") {
    if (options?.allowAnonymous) {
      return { error: t(i18n)`Sign in to continue.`, ok: false, reason: "unauthenticated" };
    }
    return { error: t(i18n)`Sign in to continue.`, ok: false, reason: "unauthenticated" };
  }
  if (!user.ok) {
    return { error: appUserErrorMessage(i18n, user), ok: false, reason: "telegram" };
  }
  return user;
}

function appUserErrorMessage(i18n: I18n, user: Extract<ResolveAppUserResult, { ok: false }>): string {
  if (user.error.includes("expired")) {
    return t(i18n)`Telegram login expired. Close and open the summary again.`;
  }
  if (user.error.includes("not configured")) {
    return t(i18n)`Telegram is not configured.`;
  }
  return t(i18n)`Open this from the Telegram bot.`;
}

function groupErrorMessage(i18n: I18n, error: unknown, fallback: string): string {
  if (error instanceof GroupError) {
    return localizeGroupError(i18n, error.message);
  }
  return fallback;
}

function localizeGroupError(i18n: I18n, message: string): string {
  switch (message) {
    case "Choose a group name.":
      return t(i18n)`Choose a group name.`;
    case "Choose a shorter group name.":
      return t(i18n)`Choose a shorter group name.`;
    case "Choose a shorter description.":
      return t(i18n)`Choose a shorter description.`;
    case "Write a message.":
      return t(i18n)`Write a message.`;
    case "Choose a shorter message.":
      return t(i18n)`Choose a shorter message.`;
    case "Choose a smaller image.":
      return t(i18n)`Choose a smaller image.`;
    case "Choose a JPEG, PNG, GIF, or WebP image.":
      return t(i18n)`Choose a JPEG, PNG, GIF, or WebP image.`;
    case "That invite link is not valid.":
      return t(i18n)`That invite link is not valid.`;
    case "You cannot edit that group.":
      return t(i18n)`You cannot edit that group.`;
    case "You are not in that group.":
      return t(i18n)`You are not in that group.`;
    case "You are not a member of that group.":
      return t(i18n)`You are not a member of that group.`;
    case "Owners can delete the group instead of leaving.":
      return t(i18n)`Owners can delete the group instead of leaving.`;
    case "Owners cannot be removed.":
      return t(i18n)`Owners cannot be removed.`;
    case "That person is not in this group.":
      return t(i18n)`That person is not in this group.`;
    case "Choose a name, description, or image to update.":
      return t(i18n)`Choose a name, description, or image to update.`;
    case "Could not create that group.":
      return t(i18n)`Could not create that group.`;
    default:
      return message;
  }
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function optionalField(formData: FormData, name: string): string | undefined {
  if (!formData.has(name)) {
    return undefined;
  }
  return stringField(formData, name);
}

function readImageFile(formData: FormData): File | undefined {
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return undefined;
  }
  return image;
}
