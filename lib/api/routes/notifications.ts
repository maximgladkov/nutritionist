import { z } from "zod";
import { prisma } from "../../prisma.ts";
import { apiDeps } from "../deps.ts";
import { readQuery } from "../http.ts";
import type { RouteDefinition } from "../router.ts";

const PAGE_SIZE = 30;

function noticeFeedWhere(userId: string, createdAt: { gt: Date } | { lt: Date } | undefined) {
  return { authorId: { not: userId }, createdAt, group: { members: { some: { userId } } } };
}

type NotificationView = {
  createdAt: string;
  groupId: string;
  groupName: string;
  id: string;
  read: boolean;
} & (
  | { body: string; fromName: string | null; target: { date: string } | { mealItemId: string } | null; type: "group_message" }
  | { memberName: string | null; type: "member_joined" }
  | { fromName: string | null; noticeId: string; title: string; type: "group_notice" }
);

// The feed is derived from existing rows: comments the group owner sent the user, notices in
// groups the user belongs to, and people joining groups the user owns. The user's own replies and
// notices never show up here.
async function loadNotifications(userId: string, before?: Date) {
  const profile = await prisma.userProfile.findUnique({ select: { notificationsReadAt: true }, where: { userId } });
  const readAt = profile?.notificationsReadAt ?? null;
  const createdBefore = before ? { lt: before } : undefined;
  const [messages, joins, notices] = await Promise.all([
    prisma.groupMessage.findMany({
      include: { fromUser: { select: { name: true } }, group: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      where: { createdAt: createdBefore, draftFor: null, fromUserId: { not: userId }, toUserId: userId },
    }),
    prisma.groupMember.findMany({
      include: { group: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { joinedAt: "desc" },
      take: PAGE_SIZE,
      where: { group: { ownerId: userId }, joinedAt: createdBefore, role: "member" },
    }),
    prisma.groupNotice.findMany({
      include: { author: { select: { name: true } }, group: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      where: noticeFeedWhere(userId, createdBefore),
    }),
  ]);
  const isRead = (date: Date) => readAt !== null && date <= readAt;
  const items: NotificationView[] = [
    ...messages.map((row) => ({
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      fromName: row.fromUser.name,
      groupId: row.groupId,
      groupName: row.group.name,
      id: `message:${row.id}`,
      read: isRead(row.createdAt),
      target: row.targetMealItemId ? { mealItemId: row.targetMealItemId } : row.targetDate ? { date: row.targetDate } : null,
      type: "group_message" as const,
    })),
    ...joins.map((row) => ({
      createdAt: row.joinedAt.toISOString(),
      groupId: row.groupId,
      groupName: row.group.name,
      id: `join:${row.id}`,
      memberName: row.user.name,
      read: isRead(row.joinedAt),
      type: "member_joined" as const,
    })),
    ...notices.map((row) => ({
      createdAt: row.createdAt.toISOString(),
      fromName: row.author.name,
      groupId: row.groupId,
      groupName: row.group.name,
      id: `notice:${row.id}`,
      noticeId: row.id,
      read: isRead(row.createdAt),
      title: row.title,
      type: "group_notice" as const,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, PAGE_SIZE);

  const unreadSince = readAt ? { gt: readAt } : undefined;
  const [unreadMessages, unreadJoins, unreadNotices] = await Promise.all([
    prisma.groupMessage.count({ where: { createdAt: unreadSince, draftFor: null, fromUserId: { not: userId }, toUserId: userId } }),
    prisma.groupMember.count({ where: { group: { ownerId: userId }, joinedAt: unreadSince, role: "member" } }),
    prisma.groupNotice.count({ where: noticeFeedWhere(userId, unreadSince) }),
  ]);
  return {
    items,
    nextBefore: items.length === PAGE_SIZE ? items.at(-1)?.createdAt ?? null : null,
    unreadCount: unreadMessages + unreadJoins + unreadNotices,
  };
}

export const notificationRoutes: RouteDefinition[] = [
  {
    async handler({ url, user }) {
      const query = readQuery(url, z.object({ before: z.iso.datetime().optional() }));
      return loadNotifications(user.id, query.before ? new Date(query.before) : undefined);
    },
    method: "GET",
    path: "/notifications",
  },
  {
    async handler({ user }) {
      const now = apiDeps().now();
      await prisma.userProfile.upsert({
        create: { notificationsReadAt: now, userId: user.id },
        update: { notificationsReadAt: now },
        where: { userId: user.id },
      });
      return { readAt: now.toISOString(), unreadCount: 0 };
    },
    method: "POST",
    path: "/notifications/read",
  },
];
