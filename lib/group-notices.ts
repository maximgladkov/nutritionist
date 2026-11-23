import { pushToUser } from "./api/push.ts";
import { GroupError, GROUP_NOTICE_BODY_MAX, GROUP_NOTICE_TITLE_MAX } from "./groups-core.ts";
import { prisma } from "./prisma.ts";

// Notices are posts from the group owner that every member sees, pinned ones first.

export type GroupNoticeView = {
  readonly authorName: string | null;
  readonly body: string;
  readonly createdAt: string;
  readonly id: string;
  readonly pinned: boolean;
  readonly title: string;
  // Only members have unread notices; the owner wrote them.
  readonly unread: boolean;
  readonly updatedAt: string;
};

type NoticeRow = {
  author: { name: string | null };
  body: string;
  createdAt: Date;
  id: string;
  pinned: boolean;
  title: string;
  updatedAt: Date;
};

// Who is reading: members see notices newer than readAt as unread.
export type NoticeReader = { noticesReadAt: Date | null; role: "owner" | "member" };

function noticeView(row: NoticeRow, reader: NoticeReader | null): GroupNoticeView {
  return {
    authorName: row.author.name,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    pinned: row.pinned,
    title: row.title,
    unread: reader?.role === "member" && (reader.noticesReadAt === null || row.createdAt > reader.noticesReadAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const include = { author: { select: { name: true } } } as const;

export async function listGroupNotices(groupId: string, reader: NoticeReader | null): Promise<GroupNoticeView[]> {
  const rows = await prisma.groupNotice.findMany({
    include,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
    where: { groupId },
  });
  return rows.map((row) => noticeView(row, reader));
}

export async function countUnreadNotices(groupId: string, reader: NoticeReader): Promise<number> {
  if (reader.role === "owner") {
    return 0;
  }
  return prisma.groupNotice.count({
    where: { createdAt: reader.noticesReadAt ? { gt: reader.noticesReadAt } : undefined, groupId },
  });
}

export async function createGroupNotice(input: {
  body: string;
  groupId: string;
  ownerId: string;
  pinned?: boolean;
  title: string;
}): Promise<GroupNoticeView> {
  await requireOwnedGroup(input.groupId, input.ownerId);
  const row = await prisma.groupNotice.create({
    data: {
      authorId: input.ownerId,
      body: normalizeBody(input.body),
      groupId: input.groupId,
      pinned: input.pinned ?? false,
      title: normalizeTitle(input.title),
    },
    include: { ...include, group: { select: { name: true } } },
  });
  void notifyMembers({ groupId: input.groupId, groupName: row.group.name, noticeId: row.id, title: row.title });
  return noticeView(row, null);
}

export async function updateGroupNotice(input: {
  body?: string;
  groupId: string;
  noticeId: string;
  ownerId: string;
  pinned?: boolean;
  title?: string;
}): Promise<GroupNoticeView> {
  await requireOwnedGroup(input.groupId, input.ownerId);
  const notice = await requireNotice(input.groupId, input.noticeId);
  const row = await prisma.groupNotice.update({
    data: {
      body: input.body === undefined ? undefined : normalizeBody(input.body),
      pinned: input.pinned,
      title: input.title === undefined ? undefined : normalizeTitle(input.title),
    },
    include,
    where: { id: notice.id },
  });
  return noticeView(row, null);
}

export async function deleteGroupNotice(input: { groupId: string; noticeId: string; ownerId: string }): Promise<void> {
  await requireOwnedGroup(input.groupId, input.ownerId);
  const notice = await requireNotice(input.groupId, input.noticeId);
  await prisma.groupNotice.delete({ where: { id: notice.id } });
}

async function notifyMembers(input: { groupId: string; groupName: string; noticeId: string; title: string }): Promise<void> {
  const members = await prisma.groupMember.findMany({ select: { userId: true }, where: { groupId: input.groupId, role: "member" } });
  await Promise.all(
    members.map((member) =>
      pushToUser(member.userId, {
        body: input.title,
        data: { groupId: input.groupId, noticeId: input.noticeId, type: "group_notice" },
        title: input.groupName,
      }),
    ),
  );
}

async function requireOwnedGroup(groupId: string, ownerId: string): Promise<void> {
  const group = await prisma.group.findUnique({ select: { ownerId: true }, where: { id: groupId } });
  if (!group) {
    throw new GroupError("Group not found.");
  }
  if (group.ownerId !== ownerId) {
    throw new GroupError("Only the group owner can post notices; you cannot edit them.");
  }
}

async function requireNotice(groupId: string, noticeId: string) {
  const notice = await prisma.groupNotice.findFirst({ where: { groupId, id: noticeId } });
  if (!notice) {
    throw new GroupError("Notice not found.");
  }
  return notice;
}

function normalizeTitle(value: string): string {
  const title = value.trim().replace(/\s+/gu, " ");
  if (title.length === 0) {
    throw new GroupError("Give the notice a title.");
  }
  if (title.length > GROUP_NOTICE_TITLE_MAX) {
    throw new GroupError("Choose a shorter title.");
  }
  return title;
}

function normalizeBody(value: string): string {
  const body = value.trim();
  if (body.length === 0) {
    throw new GroupError("Write the notice.");
  }
  if (body.length > GROUP_NOTICE_BODY_MAX) {
    throw new GroupError("Choose a shorter notice.");
  }
  return body;
}
