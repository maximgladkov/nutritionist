import { BrandMark } from "@/app/_components/brand-mark";
import { TelegramLoginWidget } from "@/app/_components/telegram-login-widget";
import { signIn } from "@/auth";
import { readAuthJwt } from "@/lib/auth-cookies";
import { initLingui } from "@/lib/i18n/init-lingui";
import { resolveRequestLocale } from "@/lib/i18n/request-locale";
import { telegramLoginBotUsername } from "@/lib/telegram-login-widget";
import { Alert, Button, Card, Form, Input, Label, Separator, TextField } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
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
  const telegramBotUsername = telegramLoginBotUsername();
  const telegramError = params.error === "CredentialsSignin";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <Card>
        <BrandMark size="md" />
        <Card.Header>
          <Card.Title>
            <Trans>BTR.me</Trans>
          </Card.Title>
          <Card.Description>
            <Trans>Become a better version of yourself.</Trans>
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {params.error ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {telegramError ? (
                    <Trans>Could not sign in with Telegram</Trans>
                  ) : (
                    <Trans>Could not send a sign-in email</Trans>
                  )}
                </Alert.Title>
                <Alert.Description>
                  {telegramError ? (
                    <Trans>Try the Telegram button again, or use a magic link.</Trans>
                  ) : (
                    <Trans>Check the address and try again.</Trans>
                  )}
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
          {telegramBotUsername ? (
            <>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-muted text-sm">
                  <Trans>or</Trans>
                </span>
                <Separator className="flex-1" />
              </div>
              <TelegramLoginWidget
                botUsername={telegramBotUsername}
                callbackUrl={callbackUrl}
                lang={locale}
              />
            </>
          ) : null}
        </Card.Content>
      </Card>
    </main>
  );
}
