import { ZodError } from "zod";
import { GoalError } from "../goal-values.ts";
import { GroupError, GroupFullError } from "../groups-core.ts";
import { MealError } from "../meals.ts";
import { ReminderError } from "../reminders.ts";
import { StoreKitError } from "../apple-storekit.ts";
import { PLAN_NAMES, type PlanId } from "../plans.ts";
import { SubscriptionError } from "../subscriptions.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = "Sign in to continue.") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "You cannot do that.") => new ApiError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new ApiError(404, "not_found", message);
export const invalid = (message: string, details?: unknown) => new ApiError(400, "invalid_request", message, details);

export type PlanFeature = "groups" | "reviews" | "talk";

// Something the person's plan doesn't allow: the app offers an upgrade from it.
export const planLimit = (feature: PlanFeature, plan: PlanId, message: string) =>
  new ApiError(403, "plan_limit", message, { feature, plan, planName: PLAN_NAMES[plan] });

const NOT_FOUND_MESSAGES = /not found|not in (this|that) group|not a member|not valid/i;

// Maps domain errors thrown by lib/* to HTTP errors with stable codes.
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof ZodError) {
    return new ApiError(
      400,
      "invalid_request",
      error.issues[0]?.message ?? "Invalid request.",
      error.issues.map((issue) => ({ message: issue.message, path: issue.path.join(".") })),
    );
  }
  if (error instanceof MealError) {
    return NOT_FOUND_MESSAGES.test(error.message)
      ? new ApiError(404, "not_found", error.message)
      : new ApiError(400, "invalid_meal", error.message);
  }
  if (error instanceof GroupFullError) {
    return new ApiError(409, "group_full", error.message);
  }
  if (error instanceof GroupError) {
    if (/cannot|owners/i.test(error.message)) {
      return new ApiError(403, "forbidden", error.message);
    }
    return NOT_FOUND_MESSAGES.test(error.message)
      ? new ApiError(404, "not_found", error.message)
      : new ApiError(400, "invalid_group", error.message);
  }
  if (error instanceof SubscriptionError) {
    return new ApiError(error.code === "other_account" ? 409 : 400, `subscription_${error.code}`, error.message);
  }
  if (error instanceof StoreKitError) {
    return new ApiError(400, "invalid_purchase", error.message);
  }
  if (error instanceof GoalError) {
    return new ApiError(400, "invalid_goal", error.message);
  }
  if (error instanceof ReminderError) {
    return new ApiError(400, "invalid_reminder", error.message);
  }
  if (error instanceof RangeError) {
    return new ApiError(400, "invalid_range", error.message);
  }
  console.error("api: unhandled error", error);
  return new ApiError(500, "internal_error", "Something went wrong.");
}
