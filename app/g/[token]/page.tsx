import { t } from "@lingui/core/macro";
import type { Metadata } from "next";
import { GroupInviteApp } from "@/app/_components/group-invite";
import { LinguiClientProvider } from "@/app/_components/lingui-client-provider";
import { auth } from "@/auth";
import { getGroupInvitePreview } from "@/lib/groups";
import { isInviteToken } from "@/lib/groups-invite";
import { getI18nInstance } from "@/lib/i18n/app-router-i18n";
import { initLingui } from "@/lib/i18n/init-lingui";
import { resolveRequestLocale } from "@/lib/i18n/request-locale";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<Metadata> {
  const session = await auth();
  const locale = await resolveRequestLocale(session?.user?.id);
  const i18n = getI18nInstance(locale);
  const { token } = await params;
  if (!isInviteToken(token)) {
    return { title: t(i18n)`Invite` };
  }
  try {
    const preview = await getGroupInvitePreview(token);
    return { title: preview.name };
  } catch {
    return { title: t(i18n)`Invite` };
  }
}

export default async function GroupInvitePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly token: string }>;
  readonly searchParams: Promise<{ readonly embed?: string }>;
}) {
  const session = await auth();
  const requestLocale = await resolveRequestLocale(session?.user?.id);
  const { token } = await params;
  const embed = (await searchParams).embed === "tg";
  let initial = null;
  if (isInviteToken(token)) {
    try {
      initial = await getGroupInvitePreview(token);
    } catch {
      initial = null;
    }
  }
  const locale = initial?.locale ?? requestLocale;
  initLingui(locale);
  return (
    <LinguiClientProvider initialLocale={locale}>
      <GroupInviteApp embed={embed} initial={initial} signedIn={Boolean(session?.user?.id)} token={token} />
    </LinguiClientProvider>
  );
}
