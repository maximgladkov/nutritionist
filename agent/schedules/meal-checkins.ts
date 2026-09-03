import { defineSchedule, type ScheduleToFn } from "eve/schedules";
import eve from "../channels/eve";
import telegram from "../channels/telegram";
import whatsapp from "../channels/whatsapp";
import { appPrincipal } from "../../lib/principal";
import {
  checkInPrompt,
  claimDueReminders,
  completeReminder,
  isMealCheckInLabel,
  mealAlreadyLoggedToday,
  missingTimezoneRetryAt,
  reminderFiredToday,
  reminderTimezone,
  releaseReminder,
  resolveReachTarget,
  seedRemindersForUsersWithTimezone,
  sendFailureRetryAt,
  type ClaimedReminder,
  type ReachTarget,
} from "../../lib/reminders";

export default defineSchedule({
  cron: "0 * * * *",
  async run({ to, waitUntil }) {
    waitUntil(dispatchDueMealCheckins(to));
  },
});

export async function dispatchDueMealCheckins(to: ScheduleToFn): Promise<void> {
  await seedRemindersForUsersWithTimezone();
  const jobs = await claimDueReminders();
  await Promise.all(jobs.map((job) => dispatchOne(to, job)));
}

async function dispatchOne(to: ScheduleToFn, job: ClaimedReminder): Promise<void> {
  try {
    const timeZone = await reminderTimezone(job.userId);
    if (!timeZone) {
      await releaseReminder(job, missingTimezoneRetryAt());
      return;
    }
    if (await reminderFiredToday({ reminderId: job.id, timeZone })) {
      await completeReminder(job);
      return;
    }
    if (
      isMealCheckInLabel(job.label) &&
      (await mealAlreadyLoggedToday({ label: job.label, timeZone, userId: job.userId }))
    ) {
      await completeReminder(job);
      return;
    }
    const target = await resolveReachTarget(job.userId);
    if (!target) {
      await completeReminder(job);
      return;
    }
    await sendCheckIn(to, job.userId, job.label, target);
    await completeReminder(job);
  } catch {
    await releaseReminder(job, sendFailureRetryAt());
  }
}

async function sendCheckIn(
  to: ScheduleToFn,
  userId: string,
  label: ClaimedReminder["label"],
  target: ReachTarget,
): Promise<void> {
  const prompt = checkInPrompt(label);
  if (target.channel === "telegram") {
    await to(telegram, { chatId: target.chatId }).send(prompt, {
      auth: appPrincipal(userId, "telegram"),
    });
    return;
  }
  if (target.channel === "whatsapp") {
    await to(whatsapp, { adapterName: "whatsapp", threadId: target.threadId }).send(prompt, {
      auth: appPrincipal(userId, "whatsapp"),
    });
    return;
  }
  await to(eve, { sessionId: target.sessionId }).send(prompt, {
    auth: appPrincipal(userId, "web"),
  });
}
