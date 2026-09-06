export class GroupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroupError";
  }
}

export const GROUP_NAME_MAX = 80;
export const GROUP_DESCRIPTION_MAX = 500;
export const GROUP_MESSAGE_MAX = 4000;
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
