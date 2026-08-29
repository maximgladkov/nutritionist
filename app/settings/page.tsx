import { auth } from "@/auth";
import { consumeLinkCode, createLinkCode } from "@/lib/identity";
import { listCountries, normalizeCountryCode } from "@/lib/countries";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_REMINDER_TIMES,
  REMINDER_LABELS,
  ensureDefaultReminders,
  listReminders,
  parseClock,
  rescheduleReminders,
  saveReminders,
  type ReminderLabel,
} from "@/lib/reminders";
import { listTimeZones, normalizeTimezone } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { redirect } from "next/navigation";

const REMINDER_TITLES: Record<ReminderLabel, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const selectClassName =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

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
  const remindersByLabel = new Map(reminderState.reminders.map((row) => [row.label, row]));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-8 px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-medium text-2xl tracking-tight">Settings</h1>
        <Button asChild size="sm" variant="ghost">
          <Link href="/s">Back to chat</Link>
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">Signed in as {session.user.email}</p>
      {params.notice ? (
        <p className="rounded-md border bg-card px-3 py-2 text-sm">{params.notice}</p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">Country</h2>
        <p className="text-muted-foreground text-sm">
          Product lookups use this country so results match local packaged foods.
        </p>
        <form
          action={async (formData) => {
            "use server";
            const current = await auth();
            if (!current?.user?.id) {
              redirect("/login?callbackUrl=/settings");
            }
            const raw = String(formData.get("country") ?? "").trim();
            const country = raw === "" ? null : normalizeCountryCode(raw);
            if (raw !== "" && !country) {
              redirect(`/settings?notice=${encodeURIComponent("Choose a valid country.")}`);
            }
            await prisma.userProfile.upsert({
              where: { userId: current.user.id },
              create: { userId: current.user.id, country },
              update: { country },
            });
            redirect(
              `/settings?notice=${encodeURIComponent(
                country ? "Country saved." : "Country cleared. Lookups use the worldwide catalog.",
              )}`,
            );
          }}
          className="flex gap-2"
        >
          <select
            className={selectClassName}
            defaultValue={profile?.country ?? ""}
            name="country"
          >
            <option value="">Not set (worldwide)</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          <Button type="submit">Save</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">Time zone</h2>
        <p className="text-muted-foreground text-sm">
          Meal times, summaries, and check-in reminders use this zone.
        </p>
        <form
          action={async (formData) => {
            "use server";
            const current = await auth();
            if (!current?.user?.id) {
              redirect("/login?callbackUrl=/settings");
            }
            const raw = String(formData.get("timezone") ?? "").trim();
            const timezone = raw === "" ? null : normalizeTimezone(raw);
            if (raw !== "" && !timezone) {
              redirect(`/settings?notice=${encodeURIComponent("Choose a valid time zone.")}`);
            }
            await prisma.userProfile.upsert({
              where: { userId: current.user.id },
              create: { userId: current.user.id, timezone },
              update: { timezone },
            });
            if (timezone) {
              await ensureDefaultReminders(current.user.id, timezone);
              await rescheduleReminders(current.user.id, timezone);
            }
            redirect(
              `/settings?notice=${encodeURIComponent(
                timezone ? "Time zone saved." : "Time zone cleared.",
              )}`,
            );
          }}
          className="flex gap-2"
        >
          <select
            className={selectClassName}
            defaultValue={profile?.timezone ?? ""}
            name="timezone"
          >
            <option value="">Not set</option>
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <Button type="submit">Save</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">Meal reminders</h2>
        <p className="text-muted-foreground text-sm">
          Daily check-ins ask how breakfast, lunch, and dinner went. Times are local to your
          time zone.
        </p>
        {profile?.timezone ? (
          <form
            action={async (formData) => {
              "use server";
              const current = await auth();
              if (!current?.user?.id) {
                redirect("/login?callbackUrl=/settings");
              }
              try {
                await saveReminders({
                  userId: current.user.id,
                  patches: REMINDER_LABELS.map((label) => {
                    const clock = parseClock(String(formData.get(`${label}-time`) ?? ""));
                    if (!clock) {
                      throw new Error(`Choose a valid time for ${REMINDER_TITLES[label]}.`);
                    }
                    return {
                      enabled: formData.get(`${label}-enabled`) === "on",
                      hour: clock.hour,
                      label,
                      minute: clock.minute,
                    };
                  }),
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : "Could not save reminders.";
                redirect(`/settings?notice=${encodeURIComponent(message)}`);
              }
              redirect(`/settings?notice=${encodeURIComponent("Reminders saved.")}`);
            }}
            className="flex flex-col gap-4"
          >
            {REMINDER_LABELS.map((label) => {
              const row = remindersByLabel.get(label);
              const clock = row ?? DEFAULT_REMINDER_TIMES[label];
              return (
                <label className="flex items-center justify-between gap-3" key={label}>
                  <span className="flex items-center gap-2 text-sm">
                    <input
                      className="size-4 accent-primary"
                      defaultChecked={row?.enabled ?? true}
                      name={`${label}-enabled`}
                      type="checkbox"
                    />
                    {REMINDER_TITLES[label]}
                  </span>
                  <Input
                    className="w-32"
                    defaultValue={`${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`}
                    name={`${label}-time`}
                    required
                    step={60}
                    type="time"
                  />
                </label>
              );
            })}
            <Button className="self-start" type="submit">
              Save reminders
            </Button>
          </form>
        ) : (
          <p className="text-muted-foreground text-sm">Save a time zone first to turn reminders on.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">Link Telegram or WhatsApp</h2>
        <p className="text-muted-foreground text-sm">
          Generate a code, then send <code>/link CODE</code> in a private chat with the bot.
        </p>
        <form
          action={async () => {
            "use server";
            const current = await auth();
            if (!current?.user?.id) {
              redirect("/login?callbackUrl=/settings");
            }
            const { code } = await createLinkCode(current.user.id);
            redirect(`/settings?notice=${encodeURIComponent(`Your code is ${code}. It expires in 10 minutes.`)}`);
          }}
        >
          <Button type="submit">Generate link code</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">Enter a code from chat</h2>
        <p className="text-muted-foreground text-sm">
          If you started in Telegram or WhatsApp, send /link there and paste that code here.
        </p>
        <form
          action={async (formData) => {
            "use server";
            const current = await auth();
            if (!current?.user?.id) {
              redirect("/login?callbackUrl=/settings");
            }
            const code = String(formData.get("code") ?? "");
            const result = await consumeLinkCode(code, current.user.id);
            const notice =
              result.status === "merged" || result.status === "linked"
                ? "Accounts linked. Memory now follows you across channels."
                : result.status === "already"
                  ? "Already linked."
                  : result.status === "expired"
                    ? "That code expired."
                    : result.status === "both-have-email"
                      ? "Those accounts both have email sign-in and cannot be merged."
                      : "That code is not valid.";
            redirect(`/settings?notice=${encodeURIComponent(notice)}`);
          }}
          className="flex gap-2"
        >
          <Input autoComplete="off" name="code" placeholder="ABCD2345" required />
          <Button type="submit">Link</Button>
        </form>
      </section>
    </main>
  );
}
