import { auth } from "@/auth";
import { consumeLinkCode, createLinkCode } from "@/lib/identity";
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
