import {
  AccountSettings,
  DailyGoalsSettings,
  LinkAccountsSettings,
  LocationSettings,
  ReminderSettings,
  SettingsHeading,
} from "@/app/_components/settings-forms";
import { FlashToast } from "@/app/_components/flash-toast";
import { auth } from "@/auth";
import { getGoals } from "@/lib/goals";
import { initLingui } from "@/lib/i18n/init-lingui";
import { resolveRequestLocale } from "@/lib/i18n/request-locale";
import { prisma } from "@/lib/prisma";
import { reminderRowsFromState } from "@/lib/reminder-clock";
import { listReminders } from "@/lib/reminders";
import { listTimeZones } from "@/lib/timezone";
import { redirect } from "next/navigation";

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string; readonly noticeKind?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/settings");
  }
  const locale = await resolveRequestLocale(session.user.id);
  initLingui(locale);
  const params = await searchParams;
  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { country: true, locale: true, timezone: true },
  });
  const timeZones = listTimeZones();
  const goals = await getGoals(session.user.id);
  const reminderState = await listReminders(session.user.id);
  const remindersByLabel = new Map(
    reminderState.reminders.map((row) => [
      row.label,
      { enabled: row.enabled, hour: row.hour, minute: row.minute },
    ]),
  );

  return (
    <div className="@container mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-8 px-6 py-8 sm:px-8">
      <SettingsHeading email={session.user.email ?? undefined} />
      {params.notice ? (
        <FlashToast
          message={params.notice}
          variant={params.noticeKind === "danger" ? "danger" : "success"}
        />
      ) : null}
      <LocationSettings
        defaultCountry={profile?.country ?? null}
        defaultTimezone={profile?.timezone ?? null}
        timeZones={timeZones}
      />
      <DailyGoalsSettings defaultGoals={goals} />
      <ReminderSettings
        key={profile?.timezone ?? "none"}
        reminders={reminderRowsFromState(remindersByLabel)}
        timezone={profile?.timezone ?? null}
      />
      <LinkAccountsSettings showConsume />
      <AccountSettings />
    </div>
  );
}
