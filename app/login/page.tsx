import { signIn } from "@/auth";
import { Alert, Button, Card, Form, Input, Label, TextField } from "@heroui/react";
import { readAuthJwt } from "@/lib/auth-cookies";
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
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/s";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <Card>
        <Card.Header>
          <Card.Title>Nutritionist</Card.Title>
          <Card.Description>
            Sign in with a magic link to chat on the web and link Telegram or WhatsApp.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {params.error ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Could not send a sign-in email</Alert.Title>
                <Alert.Description>Check the address and try again.</Alert.Description>
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
              <Label>Email</Label>
              <Input placeholder="you@example.com" />
            </TextField>
            <Button className="w-full" type="submit">
              Email me a sign-in link
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </main>
  );
}
