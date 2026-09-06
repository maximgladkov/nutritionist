"use client";

import { BrandMark } from "@/app/_components/brand-mark";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { bootTelegramWebApp } from "@/app/_components/telegram-webapp-client";
import {
  getGroupInvitePreviewAction,
  getInviteMembershipAction,
  joinGroupAction,
} from "@/app/actions/groups";
import type { GroupInvitePreview } from "@/lib/groups";
import { isLocale, localeDisplayName, locales } from "@/lib/i18n/locales";
import { ArrowRight, ChartColumn, Comment, PersonFill, Persons } from "@gravity-ui/icons";
import { Button, Card, Label, ListBox, Select, Spinner } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";

export function GroupInviteApp({
  embed,
  initial,
  signedIn,
  token,
}: {
  readonly embed: boolean;
  readonly initial: GroupInvitePreview | null;
  readonly signedIn: boolean;
  readonly token: string;
}) {
  const router = useRouter();
  const { t } = useLingui();
  const { setLocale } = useAppLocale();
  const [initData, setInitData] = useState<string | null>(embed ? null : "");
  const [preview, setPreview] = useState(initial);
  const [membership, setMembership] = useState<{ groupId: string; role: "owner" | "member" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const appliedOwnerLocale = useRef(false);

  useLayoutEffect(() => {
    if (!preview || appliedOwnerLocale.current) {
      return;
    }
    appliedOwnerLocale.current = true;
    setLocale(preview.locale);
  }, [preview, setLocale]);

  useEffect(() => {
    if (!embed) {
      return;
    }
    return bootTelegramWebApp((value) => {
      setInitData(value);
    });
  }, [embed]);

  useEffect(() => {
    if (preview || initData === null) {
      return;
    }
    void getGroupInvitePreviewAction(token).then((result) => {
      if (result.ok) {
        setPreview(result.data);
        return;
      }
      setError(result.error);
    });
  }, [initData, preview, token]);

  useEffect(() => {
    if (initData === null) {
      return;
    }
    void getInviteMembershipAction({ initData: initData || undefined, token }).then((result) => {
      if (result.ok) {
        setMembership(result.data);
      }
    });
  }, [initData, token]);

  const continueHref = embed ? "/summary?embed=tg&tab=groups" : "/groups";
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/g/${token}`)}`;

  async function onJoin() {
    setJoining(true);
    setError(null);
    const result = await joinGroupAction({ initData: initData || undefined, token });
    setJoining(false);
    if (!result.ok) {
      if (result.reason === "unauthenticated") {
        router.push(loginHref);
        return;
      }
      setError(result.error);
      return;
    }
    router.push(continueHref);
  }

  if (!preview && !error) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }

  if (!preview) {
    return (
      <InviteShell>
        <div className="w-full px-6 pt-8">
          <h1 className="text-foreground w-full py-1 text-center text-xl/[1.6] font-semibold">
            <Trans>Invite</Trans>
          </h1>
        </div>
        <Card.Content className="px-6 pb-8">
          <p className="text-danger text-center text-sm">{error}</p>
        </Card.Content>
      </InviteShell>
    );
  }

  const alreadyIn = membership !== null;

  return (
    <InviteShell>
      <div className="relative overflow-hidden rounded-t-[min(32px,var(--radius-3xl))] px-6 pt-10 pb-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-r from-[var(--goal-calories)]/18 via-[var(--goal-protein)]/12 to-[var(--goal-fat)]/18"
        />
        <div className="relative flex items-center justify-center">
          <ConnectTile>
            {preview.imageUrl ? (
              <img alt="" className="size-full object-cover" src={preview.imageUrl} />
            ) : (
              <Persons className="text-muted size-6" />
            )}
          </ConnectTile>
          <span
            aria-hidden
            className="h-0.5 w-12 bg-linear-to-r from-[var(--goal-calories)]/80 to-[var(--goal-fat)]/80"
          />
          <ConnectTile>
            <BrandMark className="size-8 rounded-lg" size="md" />
          </ConnectTile>
        </div>
      </div>
      <div className="w-full overflow-visible px-6">
        <h1 className="text-foreground w-full overflow-visible py-1 text-center text-xl/[1.6] font-semibold">
          {t`${preview.name} wants to connect to your diary`}
        </h1>
        {preview.ownerName ? (
          <p className="text-muted mt-1 text-center text-sm leading-5">{preview.ownerName}</p>
        ) : null}
        {preview.description ? (
          <p className="text-muted mt-1 line-clamp-3 text-center text-sm leading-5 text-pretty">
            {preview.description}
          </p>
        ) : null}
      </div>
      <Card.Content className="px-6">
        {alreadyIn ? (
          <p className="text-muted text-center text-sm">
            <Trans>You are already in this group.</Trans>
          </p>
        ) : (
          <ul className="flex flex-col gap-5">
            <InviteFact icon={PersonFill}>
              <Trans>The group owner will see your account name.</Trans>
            </InviteFact>
            <InviteFact icon={ChartColumn}>
              <Trans>The group owner will see your daily nutrient summaries.</Trans>
            </InviteFact>
            <InviteFact icon={Comment}>
              <Trans>The group owner can send you messages.</Trans>
            </InviteFact>
          </ul>
        )}
        {error ? <p className="text-danger text-center text-sm">{error}</p> : null}
      </Card.Content>
      <Card.Footer className="flex w-full flex-col items-stretch gap-4 px-6 pb-6 pt-6">
        {alreadyIn ? (
          <Button className="w-full" onPress={() => router.push(continueHref)}>
            <Trans>Open groups</Trans>
            <ArrowRight className="size-4" />
          </Button>
        ) : signedIn || embed ? (
          <Button
            className="w-full"
            isDisabled={embed && !initData}
            isPending={joining}
            onPress={() => void onJoin()}
          >
            <Trans>Join</Trans>
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button className="w-full" onPress={() => router.push(loginHref)}>
            <Trans>Sign in to join</Trans>
            <ArrowRight className="size-4" />
          </Button>
        )}
      </Card.Footer>
    </InviteShell>
  );
}

function InviteShell({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="flex w-full max-w-md justify-end">
        <InviteLocaleSelect />
      </div>
      <Card className="w-full max-w-md overflow-hidden p-0">{children}</Card>
    </main>
  );
}

function InviteLocaleSelect() {
  const { locale, setLocale } = useAppLocale();
  return (
    <Select
      className="w-36"
      selectedKey={locale}
      variant="secondary"
      onSelectionChange={(key) => {
        const next = String(key);
        if (!isLocale(next) || next === locale) {
          return;
        }
        setLocale(next);
      }}
    >
      <Label className="sr-only">
        <Trans>Language</Trans>
      </Label>
      <Select.Trigger className="w-full overflow-hidden">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {locales.map((option) => (
            <ListBox.Item id={option} key={option} textValue={localeDisplayName(option)}>
              {localeDisplayName(option)}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function ConnectTile({ children }: { readonly children: ReactNode }) {
  return (
    <span className="bg-surface shadow-overlay ring-foreground/10 relative z-10 flex size-14 items-center justify-center overflow-hidden rounded-2xl ring-1">
      {children}
    </span>
  );
}

function InviteFact({
  children,
  icon: Icon,
}: {
  readonly children: ReactNode;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <li className="flex min-h-10 items-center gap-3">
      <span className="bg-surface-secondary flex size-9 shrink-0 items-center justify-center rounded-full">
        <Icon className="text-muted size-4" />
      </span>
      <p className="text-muted text-sm leading-5">{children}</p>
    </li>
  );
}
