export class GroupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroupError";
  }
}

export const GROUP_NAME_MAX = 80;
export const GROUP_DESCRIPTION_MAX = 500;
export const GROUP_MESSAGE_MAX = 4000;
export const GROUP_OWNER_TITLE_MAX = 60;
export const GROUP_INVITE_NOTE_MAX = 60;
export const GROUP_NOTICE_TITLE_MAX = 120;
export const GROUP_NOTICE_BODY_MAX = 2000;
export const GROUP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type GroupRole = "owner" | "member";

export function canViewMemberNutrition(input: {
  callerId: string;
  groupOwnerId: string;
  memberId: string;
  memberRole: GroupRole | null;
}): boolean {
  return (
    input.callerId === input.groupOwnerId &&
    input.memberId !== input.groupOwnerId &&
    input.memberRole === "member"
  );
}

export function canSendGroupMessage(input: {
  body: string;
  callerId: string;
  groupOwnerId: string;
  memberId: string;
  memberRole: GroupRole | null;
}): boolean {
  return canViewMemberNutrition(input) && input.body.trim().length > 0;
}

export function leaveGroupDecision(input: {
  callerId: string;
  groupOwnerId: string;
  isMember: boolean;
}): "leave" | "owner" | "not-member" {
  if (!input.isMember) {
    return "not-member";
  }
  if (input.callerId === input.groupOwnerId) {
    return "owner";
  }
  return "leave";
}

// Parts of a member's day the owner can comment on or react to: the whole day, one of the day's
// totals, or a meal.
export const DAY_TOTAL_PARTS = ["total:kcal", "total:protein", "total:carbs", "total:fat"] as const;
export const DAY_MEAL_PARTS = ["meal:breakfast", "meal:lunch", "meal:dinner", "meal:snack", "meal:other"] as const;
export const DAY_PARTS = ["day", ...DAY_TOTAL_PARTS, ...DAY_MEAL_PARTS] as const;
export type DayPart = (typeof DAY_PARTS)[number];

export function isDayPart(value: string): value is DayPart {
  return (DAY_PARTS as readonly string[]).includes(value);
}

// The quick reaction owners leave, with or without a comment: any one emoji (with its skin tone,
// joiners or a flag's pair), nothing else.
const ONE_EMOJI =
  /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F)?)*)$/u;

export function isDayReaction(value: string): boolean {
  return value.length <= 32 && ONE_EMOJI.test(value);
}

// Each cover gets its own path, so a changed cover has a new URL and no cache keeps the old one.
export function groupCoverBlobPath(groupId: string, mediaType: string, version: string): string {
  const ext =
    mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : mediaType === "image/gif" ? "gif" : "jpg";
  return `groups/${groupId}/cover-${version}.${ext}`;
}
