import { auth } from "@/auth";
import { consumeLinkCode, createLinkCode } from "@/lib/identity";
import { listCountries, normalizeCountryCode } from "@/lib/countries";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
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
    select: { country: true },
  });
  const countries = listCountries();

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
            className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
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
