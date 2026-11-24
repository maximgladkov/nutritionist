import { z } from "zod";
import {
  createGroup,
  createPersonalInvite,
  effectiveShares,
  deleteGroup,
  GROUP_SHARE_KINDS,
  type GroupShareKind,
  getGroupInvitePreview,
  getJoinedGroupDetail,
  getMembershipForInvite,
  getOwnedGroupDetail,
  joinGroupByToken,
  leaveGroup,
  listGroupsForUser,
  listPersonalInvites,
  removeGroupMember,
  requireOwnerCanViewMemberNutrition,
  removePersonalInvite,
  revokePersonalInvite,
  setMemberShares,
  rotateInviteToken,
  sendGroupMessage,
  updateGroup,
} from "../../groups.ts";
import { groupInviteLinks } from "../../app-url.ts";
import { prisma } from "../../prisma.ts";
import {
  countUnreadNotices,
  createGroupNotice,
  deleteGroupNotice,
  listGroupNotices,
  updateGroupNotice,
  type GroupNoticeView,
} from "../../group-notices.ts";
import { GROUP_INVITE_NOTE_MAX, GROUP_NOTICE_BODY_MAX, GROUP_NOTICE_TITLE_MAX } from "../../groups-core.ts";
import { formatDateInTimeZone } from "../../timezone.ts";
import { readSummaryContext } from "../../summary.ts";
import { requireUser } from "../auth.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, forbidden, notFound } from "../errors.ts";
import { noContent, readJson, readQuery } from "../http.ts";
import { pushToUser } from "../push.ts";
import type { RouteDefinition } from "../router.ts";
import { ymdSchema } from "../schemas.ts";
import { weightsView } from "./body.ts";
import { loadDayBuckets, loadDayView } from "./diary.ts";
import { readAttachmentBytes, requireOwnedAttachments } from "./uploads.ts";

type Membership = {
  allowedShares: GroupShareKind[];
  groupId: string;
  lastReadAt: Date | null;
  noticesReadAt: Date | null;
  role: "owner" | "member";
  sharing: boolean;
  userId: string;
};

async function requireMembership(groupId: string, userId: string): Promise<Membership> {
  const member = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  if (!member) {
    throw notFound("Group not found.");
  }
  return member;
}

// Comments the owner sent this member since they last opened them; their own replies don't count.
async function unreadCount(member: Membership): Promise<number> {
  return prisma.groupMessage.count({
    where: {
      createdAt: member.lastReadAt ? { gt: member.lastReadAt } : undefined,
      fromUserId: { not: member.userId },
      groupId: member.groupId,
      toUserId: member.userId,
    },
  });
}

async function unreadNoticeCount(member: Membership): Promise<number> {
  return countUnreadNotices(member.groupId, member);
}

async function loadNotices(member: Membership): Promise<GroupNoticeView[]> {
  return listGroupNotices(member.groupId, member);
}

type MessageRow = {
  body: string;
  createdAt: Date;
  fromUser: { name: string | null };
  fromUserId: string;
  helpfulAt: Date | null;
  id: string;
  replyToId: string | null;
  targetDate: string | null;
  targetMealItemId: string | null;
  toUserId: string;
};

// The food a comment is about, as it is in the member's diary now; null once it was deleted.
type TargetFood = {
  amount: number;
  brand: string | null;
  date: string;
  energyKcal: number | null;
  label: string;
  name: string;
  servingLabel: string | null;
  unit: string;
};

async function loadTargetFoods(rows: readonly MessageRow[], memberId: string): Promise<Map<string, TargetFood>> {
  const ids = [...new Set(rows.flatMap((row) => (row.targetMealItemId ? [row.targetMealItemId] : [])))];
  if (ids.length === 0) {
    return new Map();
  }
  const [items, context] = await Promise.all([
    prisma.mealItem.findMany({
      include: { meal: { select: { eatenAt: true, label: true } } },
      where: { id: { in: ids }, meal: { userId: memberId } },
    }),
    readSummaryContext(memberId),
  ]);
  return new Map(
    items.map((item) => [
      item.id,
      {
        amount: item.amount,
        brand: item.brand,
        date: formatDateInTimeZone(item.meal.eatenAt, context.timezone),
        energyKcal: item.energyKcal,
        label: item.meal.label,
        name: item.name,
        servingLabel: item.servingLabel,
        unit: item.unit,
      },
    ]),
  );
}

function messageView(row: MessageRow, foods: ReadonlyMap<string, TargetFood> = new Map()) {
  return {
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    fromName: row.fromUser.name,
    fromUserId: row.fromUserId,
    helpful: row.helpfulAt !== null,
    id: row.id,
    replyToId: row.replyToId,
    target: row.targetMealItemId
      ? { food: foods.get(row.targetMealItemId) ?? null, mealItemId: row.targetMealItemId, type: "mealItem" as const }
      : row.targetDate
        ? { date: row.targetDate, type: "day" as const }
        : null,
    toUserId: row.toUserId,
  };
}

const messageInclude = { fromUser: { select: { name: true } } } as const;

async function coverFile(userId: string, uploadId: string | undefined): Promise<File | undefined> {
  if (!uploadId) {
    return undefined;
  }
  const [row] = await requireOwnedAttachments(userId, [uploadId]);
  if (!row) {
    return undefined;
  }
  const bytes = await readAttachmentBytes(row);
  return new File([Buffer.from(bytes)], row.filename ?? "cover", { type: row.mediaType });
}

// The member shares their diary with this owner; returns what the group lets the owner see.
async function requireSharingMember(groupId: string, ownerId: string, memberId: string): Promise<GroupShareKind[]> {
  await requireOwnerCanViewMemberNutrition({ groupId, memberId, ownerId });
  const member = await requireMembership(groupId, memberId);
  if (!member.sharing) {
    throw new ApiError(403, "not_sharing", "This member has paused sharing their diary with the group.");
  }
  const group = await prisma.group.findUnique({ select: { shares: true }, where: { id: groupId } });
  return effectiveShares(group?.shares ?? [], member.allowedShares);
}

function requireShare(shares: readonly GroupShareKind[], kind: GroupShareKind): void {
  if (!shares.includes(kind)) {
    throw new ApiError(403, "not_shared", "This group doesn't share that with its owner.");
  }
}

type DayViewForOwner = Awaited<ReturnType<typeof loadDayView>>;

// Leaves out what the group doesn't share: the day's totals and goals (summary), the foods logged
// (meals), their photos, and Apple Health activity.
function dayForOwner(day: DayViewForOwner, shares: readonly GroupShareKind[]) {
  const has = (kind: GroupShareKind) => shares.includes(kind);
  const empty = Object.fromEntries(Object.keys(day.totals).map((key) => [key, null])) as typeof day.totals;
  return {
    ...day,
    activity: has("activity") ? day.activity : null,
    goals: has("summary") ? day.goals : Object.fromEntries(Object.keys(day.goals).map((key) => [key, null])),
    meals: has("meals") ? day.meals.map((meal) => (has("photos") ? meal : { ...meal, photos: [] })) : [],
    remaining: has("summary") ? day.remaining : {},
    shares,
    totals: has("summary") || has("meals") ? day.totals : empty,
  };
}

const groupBodySchema = z.object({
  description: z.string().max(500).optional(),
  membersVisible: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  ownerTitle: z.string().max(60).optional(),
  shares: z.array(z.enum(GROUP_SHARE_KINDS)).min(1, "Choose at least one thing members share.").optional(),
  uploadId: z.string().min(1).optional(),
});

const noticeBodySchema = z.object({
  body: z.string().max(GROUP_NOTICE_BODY_MAX),
  pinned: z.boolean().optional(),
  title: z.string().max(GROUP_NOTICE_TITLE_MAX),
});

export const groupRoutes: RouteDefinition[] = [
  {
    async handler({ user }) {
      const [groups, memberships] = await Promise.all([
        listGroupsForUser(user.id),
        prisma.groupMember.findMany({ where: { userId: user.id } }),
      ]);
      const byGroup = new Map(memberships.map((member) => [member.groupId, member]));
      return {
        groups: await Promise.all(
          groups.map(async (group) => {
            const member = byGroup.get(group.id);
            return {
              ...group,
              sharing: member?.sharing ?? true,
              unreadCount: member ? await unreadCount(member) : 0,
              unreadNotices: member ? await unreadNoticeCount(member) : 0,
            };
          }),
        ),
      };
    },
    method: "GET",
    path: "/groups",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(request, groupBodySchema.extend({ name: z.string().trim().min(1).max(80) }));
      const group = await createGroup({
        description: body.description ?? "",
        image: await coverFile(user.id, body.uploadId),
        membersVisible: body.membersVisible,
        name: body.name,
        ownerId: user.id,
        ownerTitle: body.ownerTitle,
        shares: body.shares,
      });
      return { group: await getOwnedGroupDetail({ groupId: group.id, ownerId: user.id }) };
    },
    method: "POST",
    path: "/groups",
  },
  {
    async handler({ params, user }) {
      const groupId = params.id ?? "";
      const member = await requireMembership(groupId, user.id);
      const notices = await loadNotices(member);
      if (member.role === "owner") {
        return { group: { ...(await getOwnedGroupDetail({ groupId, ownerId: user.id })), notices } };
      }
      const detail = await getJoinedGroupDetail({ groupId, userId: user.id });
      return {
        group: {
          ...detail,
          notices,
          sharing: member.sharing,
          unreadCount: await unreadCount(member),
          unreadNotices: notices.filter((notice) => notice.unread).length,
        },
      };
    },
    method: "GET",
    path: "/groups/:id",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(request, groupBodySchema);
      await updateGroup({
        description: body.description,
        groupId: params.id ?? "",
        image: await coverFile(user.id, body.uploadId),
        membersVisible: body.membersVisible,
        name: body.name,
        ownerId: user.id,
        ownerTitle: body.ownerTitle,
        shares: body.shares,
      });
      return { group: await getOwnedGroupDetail({ groupId: params.id ?? "", ownerId: user.id }) };
    },
    method: "PATCH",
    path: "/groups/:id",
  },
  {
    async handler({ params, user }) {
      await deleteGroup({ groupId: params.id ?? "", ownerId: user.id });
      return noContent();
    },
    method: "DELETE",
    path: "/groups/:id",
  },
  {
    async handler({ params, user }) {
      const inviteToken = await rotateInviteToken({ groupId: params.id ?? "", ownerId: user.id });
      return { inviteToken, ...groupInviteLinks(inviteToken) };
    },
    method: "POST",
    path: "/groups/:id/invite/rotate",
  },
  {
    auth: false,
    async handler({ params, request }) {
      const token = params.token ?? "";
      const invite = await getGroupInvitePreview(token);
      const user = await requireUser(request).catch(() => null);
      const membership = user ? await getMembershipForInvite({ token, userId: user.id }) : null;
      return { invite, membership };
    },
    method: "GET",
    path: "/invites/:token",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(request, z.object({ sharing: z.boolean().optional() }));
      return joinGroupByToken({ sharing: body.sharing, token: params.token ?? "", userId: user.id });
    },
    method: "POST",
    path: "/invites/:token/join",
  },
  {
    async handler({ params, user }) {
      await leaveGroup({ groupId: params.id ?? "", userId: user.id });
      return noContent();
    },
    method: "POST",
    path: "/groups/:id/leave",
  },
  {
    async handler({ params, user }) {
      await removeGroupMember({ groupId: params.id ?? "", memberId: params.userId ?? "", ownerId: user.id });
      return noContent();
    },
    method: "DELETE",
    path: "/groups/:id/members/:userId",
  },
  {
    // Members pause or resume sharing, and answer what the group asks them to share.
    async handler({ params, request, user }) {
      const body = await readJson(
        request,
        z.object({ allowedShares: z.array(z.enum(GROUP_SHARE_KINDS)).optional(), sharing: z.boolean().optional() }),
      );
      const member = await requireMembership(params.id ?? "", user.id);
      if (member.role === "owner") {
        throw forbidden("Owners don't share a diary with their own group.");
      }
      if (body.sharing !== undefined) {
        await prisma.groupMember.update({
          data: { sharing: body.sharing },
          where: { groupId_userId: { groupId: member.groupId, userId: user.id } },
        });
      }
      const shares = body.allowedShares
        ? await setMemberShares({ allowed: body.allowedShares, groupId: member.groupId, userId: user.id })
        : null;
      return { sharing: body.sharing ?? member.sharing, ...(shares ?? {}) };
    },
    method: "PATCH",
    path: "/groups/:id/membership",
  },
  {
    async handler({ params, url, user }) {
      const groupId = params.id ?? "";
      const member = await requireMembership(groupId, user.id);
      const query = readQuery(url, z.object({ memberId: z.string().min(1).optional() }));
      if (member.role === "owner" && !query.memberId) {
        throw new ApiError(400, "invalid_request", "Pass memberId to read a member's thread.");
      }
      if (member.role === "owner") {
        await requireOwnerCanViewMemberNutrition({ groupId, memberId: query.memberId ?? "", ownerId: user.id });
      }
      const memberId = member.role === "owner" ? (query.memberId ?? "") : user.id;
      const rows = await prisma.groupMessage.findMany({
        include: messageInclude,
        orderBy: { createdAt: "desc" },
        take: 200,
        where: { groupId, toUserId: memberId },
      });
      const foods = await loadTargetFoods(rows, memberId);
      return { messages: rows.map((row) => messageView(row, foods)) };
    },
    method: "GET",
    path: "/groups/:id/messages",
  },
  {
    // The owner starts threads (optionally about a day or a food) and replies; members reply to the
    // owner's threads. Every message in a thread lives in the member's conversation (toUserId).
    async handler({ params, request, user }) {
      const groupId = params.id ?? "";
      const body = await readJson(
        request,
        z.object({
          body: z.string(),
          memberId: z.string().min(1).optional(),
          replyToId: z.string().min(1).optional(),
          target: z
            .union([z.object({ date: ymdSchema, type: z.literal("day") }), z.object({ mealItemId: z.string().min(1), type: z.literal("mealItem") })])
            .optional(),
        }),
      );
      const member = await requireMembership(groupId, user.id);
      const parent = body.replyToId
        ? await prisma.groupMessage.findFirst({ where: { groupId, id: body.replyToId } })
        : null;
      if (body.replyToId && !parent) {
        throw notFound("That comment is not in this group.");
      }
      if (member.role === "member") {
        if (!parent || parent.toUserId !== user.id) {
          throw forbidden("Members can only reply to comments from the group owner.");
        }
        const text = body.body.trim();
        if (!text) {
          throw new ApiError(400, "invalid_request", "Write a message.");
        }
        const row = await prisma.groupMessage.create({
          data: {
            body: text.slice(0, 4000),
            fromUserId: user.id,
            groupId,
            replyToId: parent.replyToId ?? parent.id,
            targetDate: parent.targetDate,
            targetMealItemId: parent.targetMealItemId,
            toUserId: user.id,
          },
          include: { ...messageInclude, group: { select: { name: true, ownerId: true } } },
        });
        void pushToUser(row.group.ownerId, {
          body: row.body,
          data: { groupId, memberId: user.id, messageId: row.id, type: "group_reply" },
          title: row.fromUser.name ? `${row.fromUser.name} · ${row.group.name}` : row.group.name,
        });
        return { message: messageView(row, await loadTargetFoods([row], user.id)) };
      }
      const memberId = parent?.toUserId ?? body.memberId;
      if (!memberId) {
        throw new ApiError(400, "invalid_request", "Pass memberId or replyToId.");
      }
      if (body.target?.type === "mealItem") {
        const item = await prisma.mealItem.findFirst({ where: { id: body.target.mealItemId, meal: { userId: memberId } } });
        if (!item) {
          throw notFound("That food is not in this member's diary.");
        }
      }
      const sent = await sendGroupMessage({ body: body.body, groupId, memberId, ownerId: user.id });
      const target = parent
        ? { targetDate: parent.targetDate, targetMealItemId: parent.targetMealItemId }
        : {
            targetDate: body.target?.type === "day" ? body.target.date : null,
            targetMealItemId: body.target?.type === "mealItem" ? body.target.mealItemId : null,
          };
      const row = await prisma.groupMessage.update({
        data: { ...target, replyToId: parent ? (parent.replyToId ?? parent.id) : null },
        include: { ...messageInclude, group: { select: { name: true } } },
        where: { id: sent.id },
      });
      void pushToUser(memberId, {
        body: row.body,
        data: { groupId, messageId: row.id, type: "group_message" },
        title: row.fromUser.name ? `${row.fromUser.name} · ${row.group.name}` : row.group.name,
      });
      return { message: messageView(row, await loadTargetFoods([row], memberId)) };
    },
    method: "POST",
    path: "/groups/:id/messages",
  },
  {
    async handler({ params, user }) {
      const member = await requireMembership(params.id ?? "", user.id);
      const now = apiDeps().now();
      await prisma.groupMember.update({
        data: { lastReadAt: now },
        where: { groupId_userId: { groupId: member.groupId, userId: user.id } },
      });
      return { lastReadAt: now.toISOString() };
    },
    method: "POST",
    path: "/groups/:id/messages/read",
  },
  {
    // Members mark the owner's comments as helpful (or take it back).
    async handler({ params, request, user }) {
      const groupId = params.id ?? "";
      const body = await readJson(request, z.object({ helpful: z.boolean() }));
      await requireMembership(groupId, user.id);
      const message = await prisma.groupMessage.findFirst({
        where: { fromUserId: { not: user.id }, groupId, id: params.messageId ?? "", toUserId: user.id },
      });
      if (!message) {
        throw notFound("That comment is not in this group.");
      }
      const row = await prisma.groupMessage.update({
        data: { helpfulAt: body.helpful ? (message.helpfulAt ?? apiDeps().now()) : null },
        include: messageInclude,
        where: { id: message.id },
      });
      return { message: messageView(row, await loadTargetFoods([row], user.id)) };
    },
    method: "PUT",
    path: "/groups/:id/messages/:messageId/helpful",
  },
  {
    async handler({ params, user }) {
      const member = await requireMembership(params.id ?? "", user.id);
      return { notices: await loadNotices(member) };
    },
    method: "GET",
    path: "/groups/:id/notices",
  },
  {
    async handler({ params, request, user }) {
      const groupId = params.id ?? "";
      await requireMembership(groupId, user.id);
      const body = await readJson(request, noticeBodySchema);
      return { notice: await createGroupNotice({ ...body, groupId, ownerId: user.id }) };
    },
    method: "POST",
    path: "/groups/:id/notices",
  },
  {
    async handler({ params, request, user }) {
      const groupId = params.id ?? "";
      await requireMembership(groupId, user.id);
      const body = await readJson(request, noticeBodySchema.partial());
      return { notice: await updateGroupNotice({ ...body, groupId, noticeId: params.noticeId ?? "", ownerId: user.id }) };
    },
    method: "PATCH",
    path: "/groups/:id/notices/:noticeId",
  },
  {
    async handler({ params, user }) {
      const groupId = params.id ?? "";
      await requireMembership(groupId, user.id);
      await deleteGroupNotice({ groupId, noticeId: params.noticeId ?? "", ownerId: user.id });
      return noContent();
    },
    method: "DELETE",
    path: "/groups/:id/notices/:noticeId",
  },
  {
    async handler({ params, user }) {
      const member = await requireMembership(params.id ?? "", user.id);
      const now = apiDeps().now();
      await prisma.groupMember.update({
        data: { noticesReadAt: now },
        where: { groupId_userId: { groupId: member.groupId, userId: user.id } },
      });
      return { noticesReadAt: now.toISOString() };
    },
    method: "POST",
    path: "/groups/:id/notices/read",
  },
  {
    async handler({ params, url, user }) {
      const shares = await requireSharingMember(params.id ?? "", user.id, params.memberId ?? "");
      const query = readQuery(url, z.object({ date: ymdSchema.optional() }));
      return dayForOwner(await loadDayView(params.memberId ?? "", query.date), shares);
    },
    method: "GET",
    path: "/groups/:id/members/:memberId/diary",
  },
  {
    async handler({ params, url, user }) {
      const shares = await requireSharingMember(params.id ?? "", user.id, params.memberId ?? "");
      requireShare(shares, "summary");
      const query = readQuery(url, z.object({ from: ymdSchema, to: ymdSchema }));
      return loadDayBuckets(params.memberId ?? "", query.from, query.to);
    },
    method: "GET",
    path: "/groups/:id/members/:memberId/days",
  },
  {
    async handler({ params, url, user }) {
      const shares = await requireSharingMember(params.id ?? "", user.id, params.memberId ?? "");
      requireShare(shares, "weight");
      const query = readQuery(url, z.object({ from: ymdSchema.optional(), to: ymdSchema.optional() }));
      return weightsView(params.memberId ?? "", query.from, query.to);
    },
    method: "GET",
    path: "/groups/:id/members/:memberId/weights",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(request, z.object({ note: z.string().max(GROUP_INVITE_NOTE_MAX).optional() }));
      return { invite: await createPersonalInvite({ groupId: params.id ?? "", note: body.note, ownerId: user.id }) };
    },
    method: "POST",
    path: "/groups/:id/invites",
  },
  {
    async handler({ params, user }) {
      return { invites: await listPersonalInvites({ groupId: params.id ?? "", ownerId: user.id }) };
    },
    method: "GET",
    path: "/groups/:id/invites",
  },
  {
    async handler({ params, user }) {
      await revokePersonalInvite({ groupId: params.id ?? "", inviteId: params.inviteId ?? "", ownerId: user.id });
      return noContent();
    },
    method: "DELETE",
    path: "/groups/:id/invites/:inviteId",
  },
  {
    async handler({ params, user }) {
      await removePersonalInvite({ groupId: params.id ?? "", inviteId: params.inviteId ?? "", ownerId: user.id });
      return noContent();
    },
    method: "DELETE",
    path: "/groups/:id/invites/:inviteId/record",
  },
];
