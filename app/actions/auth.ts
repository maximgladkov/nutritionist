"use server";

import { signIn, signOut } from "@/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function signInWithTelegramAction(input: {
  readonly auth_date: string;
  readonly callbackUrl: string;
  readonly first_name: string;
  readonly hash: string;
  readonly id: string;
  readonly last_name?: string;
  readonly photo_url?: string;
  readonly username?: string;
}) {
  await signIn("telegram", {
    auth_date: input.auth_date,
    first_name: input.first_name,
    hash: input.hash,
    id: input.id,
    last_name: input.last_name ?? "",
    photo_url: input.photo_url ?? "",
    redirectTo: safeCallbackUrl(input.callbackUrl),
    username: input.username ?? "",
  });
}

function safeCallbackUrl(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/s";
}
