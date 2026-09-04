import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isValidAdminBasicAuth } from "./admin-auth";

export async function requireAdmin(): Promise<void> {
  const header = (await headers()).get("authorization");
  if (!isValidAdminBasicAuth(header)) {
    notFound();
  }
}
