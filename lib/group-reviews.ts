import type { Prisma } from "../generated/prisma/client";
import { pushToUser } from "./api/push.ts";
import { effectiveShares, notifyMemberOfMessage, requireOwnerCanViewMemberNutrition, type GroupShareKind } from "./groups.ts";
import { GroupError, isDayPart, isDayReaction } from "./groups-core.ts";
import { prisma } from "./prisma.ts";
import { avatarUrl } from "./profile.ts";
import { formatDateInTimeZone, normalizeTimezone, parseYmd, shiftYmd } from "./timezone.ts";

// The group owner's review of members' days: which days they went through ("Mark reviewed"),
// quick reactions on parts of a day, and the per-day board the review screen opens with.

export type ReviewStatus = "nothing_logged" | "paused" | "reviewed" | "to_review";

export type ReviewBoardMember = {
  avatarUrl: string | null;
  // Owner comments and member replies about this day.
  comments: number;
  // Comments and reactions the member doesn't see yet: they go out when the day is marked reviewed.
  unsent: number;
  // Whether the member logged any food that day; null when they don't share meals or a summary.
  logged: boolean | null;
  name: string | null;
  reviewedAt: string | null;
  shares: GroupShareKind[];
  sharing: boolean;
  status: ReviewStatus;
  userId: string;
};

export type ReviewBoardDay = {
  date: string;
  logged: number;
  reviewed: number;
  // Members who logged that day and aren't reviewed yet.
  toReview: number;
};

export type ReviewBoard = {
  counts: { reviewed: number; toReview: number; total: number };
  date: string;
  days: ReviewBoardDay[];
  from: string;
  members: ReviewBoardMember[];
  to: string;
  today: string;
};

const MAX_BOARD_DAYS = 62;

function firstOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function lastOfMonth(ymd: string): string {
  const parts = parseYmd(ymd);
  if (!parts) {
    throw new RangeError("date must be a valid YYYY-MM-DD");
  }
  const days = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return `${ymd.slice(0, 7)}-${String(days).padStart(2, "0")}`;
}

function timezoneOf(profile: { timezone: string | null } | null | undefined): string {
  return (profile?.timezone ? normalizeTimezone(profile.timezone) : null) ?? "UTC";
}

// Which local days each member logged food on, between from and to.
async function loggedDays(
  members: readonly { timezone: string; userId: string }[],
  from: string,
  to: string,
): Promise<Map<string, Set<string>>> {
  const byUser = new Map(members.map((member) => [member.userId, new Set<string>()]));
  if (members.length === 0) {
    return byUser;
  }
  // A day wide on each side covers every timezone; the exact local day is worked out below.
  const meals = await prisma.meal.findMany({
    select: { eatenAt: true, userId: true },
    where: {
      eatenAt: { gte: new Date(`${shiftYmd(from, -1)}T00:00:00Z`), lt: new Date(`${shiftYmd(to, 2)}T00:00:00Z`) },
      items: { some: {} },
      userId: { in: members.map((member) => member.userId) },
    },
  });
  const zones = new Map(members.map((member) => [member.userId, member.timezone]));
  for (const meal of meals) {
    const date = formatDateInTimeZone(meal.eatenAt, zones.get(meal.userId) ?? "UTC");
    if (date >= from && date <= to) {
      byUser.get(meal.userId)?.add(date);
    }
  }
  return byUser;
}

export async function loadReviewBoard(input: {
  date?: string;
  from?: string;
  groupId: string;
  ownerId: string;
  to?: string;
}): Promise<ReviewBoard> {
  const group = await prisma.group.findUnique({
    include: {
      members: {
        include: { user: { select: { name: true, profile: { select: { avatarId: true, timezone: true } } } } },
        orderBy: { joinedAt: "asc" },
        where: { role: "member" },
      },
      owner: { select: { profile: { select: { timezone: true } } } },
    },
    where: { id: input.groupId },
  });
  if (!group || group.ownerId !== input.ownerId) {
    throw new GroupError("You cannot review that group.");
  }
  const today = formatDateInTimeZone(new Date(), timezoneOf(group.owner.profile));
  const date = input.date ?? today;
  const from = input.from ?? firstOfMonth(date);
  const to = input.to ?? lastOfMonth(date);
  if (from > to || date < from || date > to) {
    throw new RangeError("date must be between from and to");
  }
  if (Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 > MAX_BOARD_DAYS) {
    throw new RangeError(`Ask for at most ${MAX_BOARD_DAYS} days at a time`);
  }
  const members = group.members.map((row) => ({
    row,
    shares: effectiveShares(group.shares, row.allowedShares),
    timezone: timezoneOf(row.user.profile),
    userId: row.userId,
  }));
  const sharing = members.filter((member) => member.row.sharing);
  const userIds = sharing.map((member) => member.userId);
  const [logged, reviews, comments, draftMessages, draftReactions] = await Promise.all([
    loggedDays(sharing, from, to),
    prisma.groupDayReview.findMany({
      select: { date: true, memberId: true, reviewedAt: true },
      where: { date: { gte: from, lte: to }, groupId: group.id, memberId: { in: userIds } },
    }),
    prisma.groupMessage.groupBy({
      _count: { _all: true },
      by: ["toUserId"],
      where: { groupId: group.id, targetDate: date, toUserId: { in: userIds } },
    }),
    prisma.groupMessage.groupBy({
      _count: { _all: true },
      by: ["toUserId"],
      where: { draftFor: date, groupId: group.id, toUserId: { in: userIds } },
    }),
    prisma.groupDayReaction.groupBy({
      _count: { _all: true },
      by: ["memberId"],
      where: { date, groupId: group.id, memberId: { in: userIds }, sentAt: null },
    }),
  ]);
  const unsent = new Map<string, number>();
  for (const row of draftMessages) unsent.set(row.toUserId, (unsent.get(row.toUserId) ?? 0) + row._count._all);
  for (const row of draftReactions) unsent.set(row.memberId, (unsent.get(row.memberId) ?? 0) + row._count._all);
  const reviewedAt = new Map(reviews.map((review) => [`${review.memberId}|${review.date}`, review.reviewedAt]));
  const commentCount = new Map(comments.map((row) => [row.toUserId, row._count._all]));
  const knowsLogging = (shares: readonly GroupShareKind[]) => shares.includes("meals") || shares.includes("summary");

  const boardMembers: ReviewBoardMember[] = members.map((member) => {
    const reviewed = member.row.sharing ? (reviewedAt.get(`${member.userId}|${date}`) ?? null) : null;
    const didLog = member.row.sharing && knowsLogging(member.shares) ? (logged.get(member.userId)?.has(date) ?? false) : null;
    const status: ReviewStatus = !member.row.sharing
      ? "paused"
      : reviewed
        ? "reviewed"
        : didLog === false
          ? "nothing_logged"
          : "to_review";
    return {
      avatarUrl: avatarUrl(member.row.user.profile),
      comments: commentCount.get(member.userId) ?? 0,
      logged: didLog,
      name: member.row.user.name,
      reviewedAt: reviewed?.toISOString() ?? null,
      shares: member.shares,
      sharing: member.row.sharing,
      status,
      unsent: unsent.get(member.userId) ?? 0,
      userId: member.userId,
    };
  });

  const days: ReviewBoardDay[] = [];
  for (let day = from; day <= to; day = shiftYmd(day, 1)) {
    let loggedCount = 0;
    let reviewedCount = 0;
    let toReview = 0;
    for (const member of sharing) {
      const didLog = knowsLogging(member.shares) && (logged.get(member.userId)?.has(day) ?? false);
      const isReviewed = reviewedAt.has(`${member.userId}|${day}`);
      loggedCount += didLog ? 1 : 0;
      reviewedCount += isReviewed ? 1 : 0;
      toReview += didLog && !isReviewed && day <= today ? 1 : 0;
    }
    days.push({ date: day, logged: loggedCount, reviewed: reviewedCount, toReview });
  }

  return {
    counts: {
      reviewed: boardMembers.filter((member) => member.status === "reviewed").length,
      toReview: boardMembers.filter((member) => member.status === "to_review").length,
      total: sharing.length,
    },
    date,
    days,
    from,
    members: boardMembers,
    to,
    today,
  };
}

// The member's own today, so owners can't mark days that haven't happened for them yet.
async function memberToday(memberId: string): Promise<string> {
  const profile = await prisma.userProfile.findUnique({ select: { timezone: true }, where: { userId: memberId } });
  return formatDateInTimeZone(new Date(), timezoneOf(profile));
}

async function requireReviewableDay(input: { date: string; groupId: string; memberId: string; ownerId: string }) {
  await requireOwnerCanViewMemberNutrition(input);
  if (input.date > (await memberToday(input.memberId))) {
    throw new RangeError("That day hasn't happened yet");
  }
}

export async function setDayReviewed(input: {
  date: string;
  groupId: string;
  memberId: string;
  ownerId: string;
  reviewed: boolean;
}): Promise<{ reviewedAt: string | null; sent: number }> {
  await requireReviewableDay(input);
  const key = { groupId: input.groupId, memberId: input.memberId, date: input.date };
  if (!input.reviewed) {
    // What was already sent stays with the member; only new notes wait for the next review.
    await prisma.groupDayReview.deleteMany({ where: key });
    return { reviewedAt: null, sent: 0 };
  }
  const existing = await prisma.groupDayReview.findUnique({ where: { groupId_memberId_date: key } });
  const row = existing ?? (await prisma.groupDayReview.create({ data: { ...key, reviewedById: input.ownerId } }));
  const sent = await sendDrafts(input);
  if (!existing || sent.comments + sent.reactions > 0) {
    void notifyReviewed({ ...input, ...sent }).catch((error) => console.error("group review notify failed", error));
  }
  return { reviewedAt: row.reviewedAt.toISOString(), sent: sent.comments + sent.reactions };
}

// Whether the member already got the owner's review of that day, so new notes go out right away.
export async function isDayReviewed(input: { date: string; groupId: string; memberId: string }): Promise<boolean> {
  const row = await prisma.groupDayReview.findUnique({
    select: { id: true },
    where: { groupId_memberId_date: { date: input.date, groupId: input.groupId, memberId: input.memberId } },
  });
  return row !== null;
}

// Sends what the owner left while reviewing the day. Comments take the time they're sent, so they
// count as new for the member and sort after what they had already read.
async function sendDrafts(input: { date: string; groupId: string; memberId: string }) {
  const now = new Date();
  const where = { draftFor: input.date, groupId: input.groupId, toUserId: input.memberId };
  const first = await prisma.groupMessage.findFirst({
    orderBy: { createdAt: "asc" },
    select: { body: true },
    where: { ...where, replyToId: null },
  });
  const [comments, reactions] = await Promise.all([
    prisma.groupMessage.updateMany({ data: { createdAt: now, draftFor: null }, where }),
    prisma.groupDayReaction.updateMany({
      data: { sentAt: now },
      where: { date: input.date, groupId: input.groupId, memberId: input.memberId, sentAt: null },
    }),
  ]);
  return { comments: comments.count, first: first?.body ?? null, reactions: reactions.count };
}

// One notification for the whole review: the first comment when there is one.
async function notifyReviewed(input: {
  comments: number;
  date: string;
  first: string | null;
  groupId: string;
  memberId: string;
  ownerId: string;
  reactions: number;
}): Promise<void> {
  const [group, owner] = await Promise.all([
    prisma.group.findUnique({ select: { name: true }, where: { id: input.groupId } }),
    prisma.user.findUnique({ select: { name: true }, where: { id: input.ownerId } }),
  ]);
  if (!group) {
    return;
  }
  const who = owner?.name?.trim().split(/\s+/u)[0] || "Your coach";
  const more = input.comments > 1 ? ` (+${input.comments - 1} more)` : "";
  const body = input.first
    ? `${input.first}${more}`
    : input.comments > 0
      ? `${who} left ${input.comments === 1 ? "a comment" : `${input.comments} comments`} on your day.`
      : `${who} reviewed your day${input.reactions > 0 ? " and reacted to it" : ""}.`;
  await pushToUser(input.memberId, {
    body,
    data: { date: input.date, groupId: input.groupId, type: "group_review" },
    title: owner?.name ? `${owner.name} · ${group.name}` : group.name,
  });
  if (input.comments > 0) {
    await notifyMemberOfMessage({ body, groupName: group.name, memberId: input.memberId });
  }
}

// sent: whether the member sees it yet.
export type DayReactionView = { date: string; emoji: string; part: string; sent: boolean };

export async function setDayReaction(input: {
  date: string;
  emoji: string | null;
  groupId: string;
  memberId: string;
  ownerId: string;
  part: string;
}): Promise<{ reaction: DayReactionView | null }> {
  if (!isDayPart(input.part)) {
    throw new GroupError("Choose the day, a total or a meal to react to.");
  }
  if (input.emoji !== null && !isDayReaction(input.emoji)) {
    throw new GroupError("Choose one of the quick reactions.");
  }
  await requireReviewableDay(input);
  const key = { date: input.date, groupId: input.groupId, memberId: input.memberId, part: input.part };
  // On a day already reviewed the member sees it right away; otherwise with the review.
  const sentAt = (await isDayReviewed(input)) ? new Date() : null;
  if (input.emoji === null) {
    await prisma.groupDayReaction.deleteMany({ where: key });
    return { reaction: null };
  }
  const row = await prisma.groupDayReaction.upsert({
    create: { ...key, emoji: input.emoji, fromUserId: input.ownerId, sentAt },
    update: { emoji: input.emoji, fromUserId: input.ownerId, ...(sentAt ? { sentAt } : {}) },
    where: { groupId_memberId_date_part: key },
  });
  return { reaction: { date: row.date, emoji: row.emoji, part: row.part, sent: row.sentAt !== null } };
}

// What the owner left on a member's days besides comments: reactions and reviewed days. Only ever
// loaded for one member, so a member sees their own and nobody else's, and only the sent reactions.
export async function loadDayExtras(groupId: string, memberId: string, viewer: "member" | "owner") {
  const [reactions, reviews] = await Promise.all([
    prisma.groupDayReaction.findMany({
      orderBy: [{ date: "desc" }, { part: "asc" }],
      select: { date: true, emoji: true, part: true, sentAt: true },
      take: 500,
      where: { groupId, memberId, ...(viewer === "member" ? { sentAt: { not: null } } : {}) },
    }),
    prisma.groupDayReview.findMany({
      orderBy: { date: "desc" },
      select: { date: true, reviewedAt: true },
      take: 200,
      where: { groupId, memberId },
    }),
  ]);
  return {
    reactions: reactions.map((row) => ({ date: row.date, emoji: row.emoji, part: row.part, sent: row.sentAt !== null })),
    reviews: reviews.map((review) => ({ date: review.date, reviewedAt: review.reviewedAt.toISOString() })),
  };
}

// Moves the absorbed account's reviewed days and reactions to the survivor, dropping the ones the
// survivor already has for the same group and day.
export async function reassignDayReviewsOnUserMerge(
  tx: Prisma.TransactionClient,
  survivorId: string,
  absorbedId: string,
): Promise<void> {
  const [keptReviews, keptReactions] = await Promise.all([
    tx.groupDayReview.findMany({ select: { date: true, groupId: true }, where: { memberId: survivorId } }),
    tx.groupDayReaction.findMany({ select: { date: true, groupId: true, part: true }, where: { memberId: survivorId } }),
  ]);
  for (const kept of keptReviews) {
    await tx.groupDayReview.deleteMany({ where: { date: kept.date, groupId: kept.groupId, memberId: absorbedId } });
  }
  for (const kept of keptReactions) {
    await tx.groupDayReaction.deleteMany({
      where: { date: kept.date, groupId: kept.groupId, memberId: absorbedId, part: kept.part },
    });
  }
  await tx.groupDayReview.updateMany({ data: { memberId: survivorId }, where: { memberId: absorbedId } });
  await tx.groupDayReaction.updateMany({ data: { memberId: survivorId }, where: { memberId: absorbedId } });
  await tx.groupDayReview.updateMany({ data: { reviewedById: survivorId }, where: { reviewedById: absorbedId } });
  await tx.groupDayReaction.updateMany({ data: { fromUserId: survivorId }, where: { fromUserId: absorbedId } });
}
