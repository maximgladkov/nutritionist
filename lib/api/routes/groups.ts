import { z } from "zod";
import {
  createGroup,
  deleteGroup,
  getGroupInvitePreview,
  getJoinedGroupDetail,
  getMembershipForInvite,
  getOwnedGroupDetail,
  joinGroupByToken,
  leaveGroup,
  listGroupsForUser,
  removeGroupMember,
  requireOwnerCanViewMemberNutrition,
  rotateInviteToken,
  sendGroupMessage,
  updateGroup,
} from "../../groups.ts";
import { groupInviteLinks } from "../../app-url.ts";
import { prisma } from "../../prisma.ts";
import { GROUP_NOTICE_BODY_MAX, GROUP_NOTICE_TITLE_MAX } from "../../groups-core.ts";
import { formatDateInTimeZone } from "../../timezone.ts";
import { readSummaryContext } from "../../summary.ts";
import { requireUser } from "../auth.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, forbidden, notFound } from "../errors.ts";
import { noContent, readJson, readQuery } from "../http.ts";
import { pushToUser } from "../push.ts";
import type { RouteDefinition } from "../router.ts";
import { ymdSchema } from "../schemas.ts";
import { loadDayBuckets, loadDayView } from "./diary.ts";
import { readAttachmentBytes, requireOwnedAttachments } from "./uploads.ts";

type Membership = {
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
  if (member.role === "owner") {
    return 0;
  }
  return prisma.groupNotice.count({
    where: { createdAt: member.noticesReadAt ? { gt: member.noticesReadAt } : undefined, groupId: member.groupId },
  });
}

async function loadNotices(member: Membership) {
  const rows = await prisma.groupNotice.findMany({
    include: { author: { select: { name: true } } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
    where: { groupId: member.groupId },
  });
  return rows.map((row) => noticeView(row, member));
}

function noticeView(
  row: { author: { name: string | null }; body: string; createdAt: Date; id: string; pinned: boolean; title: string; updatedAt: Date },
  member: Membership | null,
) {
  return {
    authorName: row.author.name,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    pinned: row.pinned,
    title: row.title,
    unread: member?.role === "member" && (member.noticesReadAt === null || row.createdAt > member.noticesReadAt),
    updatedAt: row.updatedAt.toISOString(),
  };
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

async function requireSharingMember(groupId: string, ownerId: string, memberId: string): Promise<void> {
  await requireOwnerCanViewMemberNutrition({ groupId, memberId, ownerId });
  const member = await requireMembership(groupId, memberId);
  if (!member.sharing) {
    throw new ApiError(403, "not_sharing", "This member has paused sharing their diary with the group.");
  }
}

const groupBodySchema = z.object({
  description: z.string().max(500).optional(),
  membersVisible: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  ownerTitle: z.string().max(60).optional(),
  uploadId: z.string().min(1).optional(),
});

const noticeBodySchema = z.object({
  body: z.string().trim().min(1, "Write the notice.").max(GROUP_NOTICE_BODY_MAX),
  pinned: z.boolean().optional(),
  title: z.string().trim().min(1, "Give the notice a title.").max(GROUP_NOTICE_TITLE_MAX),
});

async function requireOwner(groupId: string, userId: string): Promise<Membership> {
  const member = await requireMembership(groupId, userId);
  if (member.role !== "owner") {
    throw forbidden("Only the group owner can do that.");
  }
  return member;
}

async function requireNotice(groupId: string, noticeId: string) {
  const notice = await prisma.groupNotice.findFirst({ where: { groupId, id: noticeId } });
  if (!notice) {
    throw notFound("Notice not found.");
  }
  return notice;
}

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
        name: body.name,
        ownerId: user.id,
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
    async handler({ params, request, user }) {
      const body = await readJson(request, z.object({ sharing: z.boolean() }));
      const member = await requireMembership(params.id ?? "", user.id);
      if (member.role === "owner") {
        throw forbidden("Owners don't share a diary with their own group.");
      }
      await prisma.groupMember.update({
        data: { sharing: body.sharing },
        where: { groupId_userId: { groupId: member.groupId, userId: user.id } },
      });
      return { sharing: body.sharing };
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
      await requireOwner(groupId, user.id);
      const body = await readJson(request, noticeBodySchema);
      const row = await prisma.groupNotice.create({
        data: { authorId: user.id, body: body.body, groupId, pinned: body.pinned ?? false, title: body.title },
        include: { author: { select: { name: true } }, group: { select: { name: true } } },
      });
      const members = await prisma.groupMember.findMany({ select: { userId: true }, where: { groupId, role: "member" } });
      for (const member of members) {
        void pushToUser(member.userId, {
          body: row.title,
          data: { groupId, noticeId: row.id, type: "group_notice" },
          title: row.group.name,
        });
      }
      return { notice: noticeView(row, null) };
    },
    method: "POST",
    path: "/groups/:id/notices",
  },
  {
    async handler({ params, request, user }) {
      const groupId = params.id ?? "";
      await requireOwner(groupId, user.id);
      const notice = await requireNotice(groupId, params.noticeId ?? "");
      const body = await readJson(request, noticeBodySchema.partial());
      const row = await prisma.groupNotice.update({
        data: { body: body.body, pinned: body.pinned, title: body.title },
        include: { author: { select: { name: true } } },
        where: { id: notice.id },
      });
      return { notice: noticeView(row, null) };
    },
    method: "PATCH",
    path: "/groups/:id/notices/:noticeId",
  },
  {
    async handler({ params, user }) {
      const groupId = params.id ?? "";
      await requireOwner(groupId, user.id);
      const notice = await requireNotice(groupId, params.noticeId ?? "");
      await prisma.groupNotice.delete({ where: { id: notice.id } });
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
      await requireSharingMember(params.id ?? "", user.id, params.memberId ?? "");
      const query = readQuery(url, z.object({ date: ymdSchema.optional() }));
      return loadDayView(params.memberId ?? "", query.date);
    },
    method: "GET",
    path: "/groups/:id/members/:memberId/diary",
  },
  {
    async handler({ params, url, user }) {
      await requireSharingMember(params.id ?? "", user.id, params.memberId ?? "");
      const query = readQuery(url, z.object({ from: ymdSchema, to: ymdSchema }));
      return loadDayBuckets(params.memberId ?? "", query.from, query.to);
    },
    method: "GET",
    path: "/groups/:id/members/:memberId/days",
  },
];
