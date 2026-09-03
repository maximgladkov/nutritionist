import { Trans } from "@lingui/react/macro";
import { Alert, Button, Card, Form, Input, Label, TextField } from "@heroui/react";
import { signIn } from "@/auth";
import { readAuthJwt } from "@/lib/auth-cookies";
import { initLingui } from "@/lib/i18n/init-lingui";
import { resolveRequestLocale } from "@/lib/i18n/request-locale";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly callbackUrl?: string; readonly error?: string }>;
}) {
  const token = await readAuthJwt({ headers: await headers() });
  if (token?.sub) {
    redirect("/s");
  }
  const locale = await resolveRequestLocale();
  initLingui(locale);
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/s";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <Card>
        <Card.Header>
          <Card.Title>
            <Trans>Nutritionist</Trans>
          </Card.Title>
          <Card.Description>
            <Trans>
              Sign in with a magic link to chat on the web and link Telegram or WhatsApp.
            </Trans>
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {params.error ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  <Trans>Could not send a sign-in email</Trans>
                </Alert.Title>
                <Alert.Description>
                  <Trans>Check the address and try again.</Trans>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          <Form
            className="flex flex-col gap-3"
            action={async (formData) => {
              "use server";
              const email = String(formData.get("email") ?? "").trim();
              if (!email) {
                return;
              }
              await signIn("resend", { email, redirectTo: callbackUrl });
            }}
          >
            <TextField isRequired autoComplete="email" name="email" type="email">
              <Label>
                <Trans>Email</Trans>
              </Label>
              <Input placeholder="you@example.com" />
            </TextField>
            <Button className="w-full" type="submit">
              <Trans>Email me a sign-in link</Trans>
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </main>
  );
}
