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
import { requireUser } from "../auth.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, forbidden, notFound } from "../errors.ts";
import { noContent, readJson, readQuery } from "../http.ts";
import { pushToUser } from "../push.ts";
import type { RouteDefinition } from "../router.ts";
import { ymdSchema } from "../schemas.ts";
import { loadDayBuckets, loadDayView } from "./diary.ts";
import { readAttachmentBytes, requireOwnedAttachments } from "./uploads.ts";

type Membership = { groupId: string; lastReadAt: Date | null; role: "owner" | "member"; sharing: boolean; userId: string };

async function requireMembership(groupId: string, userId: string): Promise<Membership> {
  const member = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  if (!member) {
    throw notFound("Group not found.");
  }
  return member;
}

async function unreadCount(member: Membership): Promise<number> {
  return prisma.groupMessage.count({
    where: {
      createdAt: member.lastReadAt ? { gt: member.lastReadAt } : undefined,
      groupId: member.groupId,
      toUserId: member.userId,
    },
  });
}

function messageView(row: {
  body: string;
  createdAt: Date;
  fromUser: { name: string | null };
  fromUserId: string;
  id: string;
  targetDate: string | null;
  targetMealItemId: string | null;
  toUserId: string;
}) {
  return {
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    fromName: row.fromUser.name,
    fromUserId: row.fromUserId,
    id: row.id,
    target: row.targetMealItemId
      ? { mealItemId: row.targetMealItemId, type: "mealItem" as const }
      : row.targetDate
        ? { date: row.targetDate, type: "day" as const }
        : null,
    toUserId: row.toUserId,
  };
}

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
  name: z.string().trim().min(1).max(80).optional(),
  uploadId: z.string().min(1).optional(),
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
            return { ...group, sharing: member?.sharing ?? true, unreadCount: member ? await unreadCount(member) : 0 };
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
      if (member.role === "owner") {
        return { group: await getOwnedGroupDetail({ groupId, ownerId: user.id }) };
      }
      const detail = await getJoinedGroupDetail({ groupId, userId: user.id });
      return { group: { ...detail, sharing: member.sharing, unreadCount: await unreadCount(member) } };
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
        name: body.name,
        ownerId: user.id,
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
    async handler({ params, user }) {
      const result = await joinGroupByToken({ token: params.token ?? "", userId: user.id });
      return result;
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
      const rows = await prisma.groupMessage.findMany({
        include: { fromUser: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
        where: { groupId, toUserId: member.role === "owner" ? query.memberId : user.id },
      });
      return { messages: rows.map(messageView) };
    },
    method: "GET",
    path: "/groups/:id/messages",
  },
  {
    async handler({ params, request, user }) {
      const groupId = params.id ?? "";
      const body = await readJson(
        request,
        z.object({
          body: z.string(),
          memberId: z.string().min(1),
          target: z
            .union([z.object({ date: ymdSchema, type: z.literal("day") }), z.object({ mealItemId: z.string().min(1), type: z.literal("mealItem") })])
            .optional(),
        }),
      );
      if (body.target?.type === "mealItem") {
        const item = await prisma.mealItem.findFirst({ where: { id: body.target.mealItemId, meal: { userId: body.memberId } } });
        if (!item) {
          throw notFound("That food is not in this member's diary.");
        }
      }
      const sent = await sendGroupMessage({ body: body.body, groupId, memberId: body.memberId, ownerId: user.id });
      const row = await prisma.groupMessage.update({
        data: {
          targetDate: body.target?.type === "day" ? body.target.date : null,
          targetMealItemId: body.target?.type === "mealItem" ? body.target.mealItemId : null,
        },
        include: { fromUser: { select: { name: true } }, group: { select: { name: true } } },
        where: { id: sent.id },
      });
      void pushToUser(body.memberId, {
        body: row.body,
        data: { groupId, messageId: row.id, type: "group_message" },
        title: row.fromUser.name ? `${row.fromUser.name} · ${row.group.name}` : row.group.name,
      });
      return { message: messageView(row) };
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
