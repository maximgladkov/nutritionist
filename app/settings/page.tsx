import { Alert } from "@heroui/react";
import { Card } from "@heroui/react";
import {
  ConsumeLinkCodeSettings,
  CountrySettings,
  LinkCodeSettings,
  ReminderSettings,
  TimezoneSettings,
} from "@/app/_components/settings-forms";
import { auth } from "@/auth";
import { listCountries } from "@/lib/countries";
import { prisma } from "@/lib/prisma";
import { reminderRowsFromState } from "@/lib/reminder-clock";
import { listReminders } from "@/lib/reminders";
import { listTimeZones } from "@/lib/timezone";
import { redirect } from "next/navigation";

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/settings");
  }
  const params = await searchParams;
  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { country: true, timezone: true },
  });
  const countries = listCountries();
  const timeZones = listTimeZones();
  const reminderState = await listReminders(session.user.id);
  const remindersByLabel = new Map(
    reminderState.reminders.map((row) => [
      row.label,
      { enabled: row.enabled, hour: row.hour, minute: row.minute },
    ]),
  );

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 overflow-y-auto px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-foreground text-xl font-semibold">Settings</h1>
        <p className="text-muted text-sm">Signed in as {session.user.email}</p>
      </div>
      {params.notice ? (
        <Alert>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{params.notice}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <CountrySettings countries={countries} defaultCountry={profile?.country ?? null} />
      <TimezoneSettings defaultTimezone={profile?.timezone ?? null} timeZones={timeZones} />
      {profile?.timezone ? (
        <ReminderSettings reminders={reminderRowsFromState(remindersByLabel)} />
      ) : (
        <Card>
          <Card.Header>
            <Card.Title>Meal Reminders</Card.Title>
            <Card.Description>Save a time zone first to turn reminders on.</Card.Description>
          </Card.Header>
        </Card>
      )}
      <LinkCodeSettings />
      <ConsumeLinkCodeSettings />
    </div>
  );
}
