import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly callbackUrl?: string; readonly error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/s");
  }
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/s";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-medium text-3xl tracking-tight">Nutritionist</h1>
        <p className="text-muted-foreground text-sm">
          Sign in with a magic link to chat on the web and link Telegram or WhatsApp.
        </p>
      </div>
      {params.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
          Could not send a sign-in email. Check the address and try again.
        </p>
      ) : null}
      <form
        action={async (formData) => {
          "use server";
          const email = String(formData.get("email") ?? "").trim();
          if (!email) {
            return;
          }
          await signIn("resend", { email, redirectTo: callbackUrl });
        }}
        className="flex flex-col gap-3"
      >
        <Input
          autoComplete="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        <Button type="submit">Email me a sign-in link</Button>
      </form>
    </main>
  );
}
