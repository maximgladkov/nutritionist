import { AdminShell } from "@/app/admin/_components/admin-shell";
import { requireAdmin } from "@/lib/admin-guard";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
