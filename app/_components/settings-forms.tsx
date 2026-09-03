"use client";

import { GOAL_LABELS, GOAL_UNIT_LABELS, REMINDER_TITLES } from "@/app/_components/i18n-labels";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { signOutAction } from "@/app/actions/auth";
import {
  consumeLinkCodeAction,
  generateLinkCodeAction,
  saveCountryAction,
  saveGoalsAction,
  saveLocaleAction,
  saveRemindersAction,
  saveTimezoneAction,
  type SettingsNotice,
} from "@/app/actions/settings";
import { listCountries } from "@/lib/countries";
import {
  GOAL_FIELDS,
  GOAL_SPECS,
  type GoalField,
  type GoalsPatch,
  type GoalsView,
} from "@/lib/goal-values";
import { isLocale, localeDisplayName, locales } from "@/lib/i18n/locales";
import {
  REMINDER_LABELS,
  type ReminderClock,
  type ReminderLabel,
} from "@/lib/reminder-clock";
import {
  ArrowRightFromSquare,
  Arrows3RotateLeftLetterA,
  ChartColumn,
  ClockFill,
  Cup,
  Droplet,
  Flame,
  Globe,
  HeartFill,
  Link,
  Moon,
  Sun,
  ThunderboltFill,
} from "@gravity-ui/icons";
import { ItemCard, ItemCardGroup } from "@heroui-pro/react";
import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  Separator,
  Switch,
  TextField,
  TimeField,
  toast,
} from "@heroui/react";
import { Time } from "@internationalized/date";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type SVGProps,
} from "react";

const NONE_KEY = "__none__";

const REMINDER_ICONS: Record<ReminderLabel, typeof Cup> = {
  breakfast: Cup,
  lunch: Sun,
  dinner: Moon,
  summary: ChartColumn,
};

function Grains(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      fill="none"
      viewBox="0 0 256 256"
      {...props}
    >
      <path
        fill="currentColor"
        d="M208 56a87.5 87.5 0 0 0-31.84 6c-14.32-29.7-43.25-44.46-44.57-45.13a8 8 0 0 0-7.16 0c-1.33.64-30.26 15.4-44.58 45.13A87.5 87.5 0 0 0 48 56a8 8 0 0 0-8 8v80a88.12 88.12 0 0 0 75.48 87.1a4 4 0 0 0 4.52-4v-50.83a8.18 8.18 0 0 1 7.47-8.25a8 8 0 0 1 8.53 8v51.14a4 4 0 0 0 4.52 4A88.12 88.12 0 0 0 216 144V64a8 8 0 0 0-8-8m-88 93.46a88 88 0 0 0-64-37.09V72.44A72.1 72.1 0 0 1 120 144Zm8-42.1a88.6 88.6 0 0 0-33.84-38.25c9.21-19.21 26.4-31.33 33.84-35.9c7.45 4.58 24.63 16.7 33.84 35.9A88.6 88.6 0 0 0 128 107.36m72 5a88 88 0 0 0-64 37.09V144a72.1 72.1 0 0 1 64-71.56Z"
      />
    </svg>
  );
}

const GOAL_ICONS: Record<GoalField, { color: string; icon: typeof Flame }> = {
  caloriesPerDay: { color: "var(--goal-calories)", icon: Flame },
  proteinGPerDay: { color: "var(--goal-protein)", icon: HeartFill },
  carbsGPerDay: { color: "var(--goal-carbs)", icon: ThunderboltFill },
  fatGPerDay: { color: "var(--goal-fat)", icon: Droplet },
  fiberGPerDay: { color: "var(--goal-fiber)", icon: Grains },
};

type ReminderRowState = {
  enabled: boolean;
  time: Time;
};

type GoalRowState = {
  enabled: boolean;
  value: number | undefined;
};

function runSettingsAction(
  action: () => Promise<SettingsNotice>,
  options?: { onSaved?: () => void; successToast?: boolean },
) {
  void action().then((result) => {
    if (!result.ok) {
      toast.danger(result.message);
      return;
    }
    if (options?.successToast) {
      toast.success(result.message);
    }
    options?.onSaved?.();
  });
}

function useKeyedDebounce(delayMs: number) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);
  return (key: string, fn: () => void, immediate = false) => {
    const existing = timers.current.get(key);
    if (existing) {
      clearTimeout(existing);
      timers.current.delete(key);
    }
    if (immediate) {
      fn();
      return;
    }
    const timer = setTimeout(() => {
      timers.current.delete(key);
      fn();
    }, delayMs);
    timers.current.set(key, timer);
  };
}

function rowsFromGoals(goals: GoalsView): Record<GoalField, GoalRowState> {
  return Object.fromEntries(
    GOAL_FIELDS.map((field) => [
      field,
      { enabled: goals[field] !== null, value: goals[field] ?? undefined },
    ]),
  ) as Record<GoalField, GoalRowState>;
}

function patchFromGoalRow(field: GoalField, row: GoalRowState): GoalsPatch | null {
  if (!row.enabled) {
    return { [field]: null };
  }
  if (row.value === undefined || !Number.isInteger(row.value)) {
    return null;
  }
  const spec = GOAL_SPECS[field];
  if (row.value < spec.min || row.value > spec.max) {
    return null;
  }
  return { [field]: row.value };
}

function SettingsSection({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description: ReactNode;
  readonly title: ReactNode;
}) {
  return (
    <section className="flex flex-col @xl:grid @xl:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] @xl:items-start @xl:gap-x-10">
      <header className="flex flex-col px-4 pb-2 pt-4 @xl:px-0 @xl:pb-0 @xl:pt-3">
        <h2 className="text-foreground text-sm font-semibold">{title}</h2>
        <p className="text-muted mt-0.5 text-xs">{description}</p>
      </header>
      <ItemCardGroup className="min-w-0 overflow-hidden">{children}</ItemCardGroup>
    </section>
  );
}

export function SettingsHeading({ email }: { readonly email?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-foreground text-xl font-semibold">
        <Trans>Settings</Trans>
      </h1>
      {email ? (
        <p className="text-muted text-sm">
          <Trans>Signed in as {email}</Trans>
        </p>
      ) : null}
    </div>
  );
}

export function AccountSettings({ email }: { readonly email?: string }) {
  return (
    <SettingsSection
      description={
        email ? <Trans>Signed in as {email}</Trans> : <Trans>Sign out of this browser.</Trans>
      }
      title={<Trans>Account</Trans>}
    >
      <ItemCard>
        <ItemCard.Icon>
          <ArrowRightFromSquare />
        </ItemCard.Icon>
        <ItemCard.Content>
          <ItemCard.Title>
            <Trans>Sign out</Trans>
          </ItemCard.Title>
        </ItemCard.Content>
        <ItemCard.Action>
          <form action={signOutAction}>
            <Button size="sm" type="submit" variant="danger-soft">
              <Trans>Sign out</Trans>
            </Button>
          </form>
        </ItemCard.Action>
      </ItemCard>
    </SettingsSection>
  );
}

export function LocationSettings({
  defaultCountry,
  defaultTimezone,
  initData,
  onLocaleSaved,
  onTimezoneSaved,
  timeZones,
}: {
  readonly defaultCountry: string | null;
  readonly defaultTimezone: string | null;
  readonly initData?: string;
  readonly onLocaleSaved?: () => void;
  readonly onTimezoneSaved?: () => void;
  readonly timeZones: readonly string[];
}) {
  const { t } = useLingui();
  const { locale, setLocale } = useAppLocale();
  const countries = useMemo(() => listCountries(locale), [locale]);
  const [country, setCountry] = useState<string>(defaultCountry ?? NONE_KEY);
  const [timezone, setTimezone] = useState<string>(defaultTimezone ?? NONE_KEY);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const worldwide = t`Not set (worldwide)`;
  const notSet = t`Not set`;

  return (
    <SettingsSection
      description={<Trans>App language, product lookups, meal times, and reminders.</Trans>}
      title={<Trans>Language & location</Trans>}
    >
      <ItemCard>
        <ItemCard.Icon>
          <Arrows3RotateLeftLetterA />
        </ItemCard.Icon>
        <ItemCard.Content>
          <ItemCard.Title>
            <Trans>Language</Trans>
          </ItemCard.Title>
        </ItemCard.Content>
        <ItemCard.Action className="min-w-0">
          <Select
            className="w-40 max-w-full min-w-0"
            selectedKey={locale}
            variant="secondary"
            onSelectionChange={(key) => {
              const next = String(key);
              if (!isLocale(next) || next === locale) {
                return;
              }
              setLocale(next);
              startTransition(() => {
                runSettingsAction(() => saveLocaleAction(next, initData), {
                  onSaved: () => {
                    onLocaleSaved?.();
                    router.refresh();
                  },
                });
              });
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
                  <ListBox.Item
                    id={option}
                    key={option}
                    textValue={localeDisplayName(option)}
                  >
                    {localeDisplayName(option)}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </ItemCard.Action>
      </ItemCard>
      <Separator />
      <ItemCard>
        <ItemCard.Icon>
          <Globe />
        </ItemCard.Icon>
        <ItemCard.Content>
          <ItemCard.Title>
            <Trans>Country</Trans>
          </ItemCard.Title>
        </ItemCard.Content>
        <ItemCard.Action className="min-w-0">
          <ComboBox
            className="w-52 max-w-full min-w-0"
            key={`country-${locale}`}
            menuTrigger="focus"
            selectedKey={country}
            onSelectionChange={(key) => {
              const next = key === null ? NONE_KEY : String(key);
              if (next === country) {
                return;
              }
              setCountry(next);
              startTransition(() => {
                runSettingsAction(() => saveCountryAction(next === NONE_KEY ? "" : next, initData));
              });
            }}
          >
            <Label className="sr-only">
              <Trans>Country</Trans>
            </Label>
            <ComboBox.InputGroup className="min-w-0">
              <Input className="min-w-0 truncate" placeholder={t`Search…`} variant="secondary" />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                <ListBox.Item id={NONE_KEY} textValue={worldwide}>
                  {worldwide}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {countries.map((option) => (
                  <ListBox.Item key={option.code} id={option.code} textValue={option.name}>
                    {option.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </ItemCard.Action>
      </ItemCard>
      <Separator />
      <ItemCard>
        <ItemCard.Icon>
          <ClockFill />
        </ItemCard.Icon>
        <ItemCard.Content>
          <ItemCard.Title>
            <Trans>Time zone</Trans>
          </ItemCard.Title>
        </ItemCard.Content>
        <ItemCard.Action className="min-w-0">
          <ComboBox
            className="w-52 max-w-full min-w-0"
            key={`timezone-${locale}`}
            menuTrigger="focus"
            selectedKey={timezone}
            onSelectionChange={(key) => {
              const next = key === null ? NONE_KEY : String(key);
              if (next === timezone) {
                return;
              }
              setTimezone(next);
              startTransition(() => {
                runSettingsAction(() => saveTimezoneAction(next === NONE_KEY ? "" : next, initData), {
                  onSaved: () => {
                    onTimezoneSaved?.();
                    router.refresh();
                  },
                });
              });
            }}
          >
            <Label className="sr-only">
              <Trans>Time zone</Trans>
            </Label>
            <ComboBox.InputGroup className="min-w-0">
              <Input className="min-w-0 truncate" placeholder={t`Search…`} variant="secondary" />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                <ListBox.Item id={NONE_KEY} textValue={notSet}>
                  {notSet}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {timeZones.map((zone) => (
                  <ListBox.Item key={zone} id={zone} textValue={zone}>
                    {zone}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </ItemCard.Action>
      </ItemCard>
    </SettingsSection>
  );
}

export function DailyGoalsSettings({
  defaultGoals,
  initData,
}: {
  readonly defaultGoals: GoalsView;
  readonly initData?: string;
}) {
  const { t } = useLingui();
  const { locale } = useAppLocale();
  const [rows, setRows] = useState<Record<GoalField, GoalRowState>>(() => rowsFromGoals(defaultGoals));
  const [, startTransition] = useTransition();
  const schedule = useKeyedDebounce(400);

  function commit(field: GoalField, nextRow: GoalRowState, immediate: boolean) {
    setRows((current) => ({ ...current, [field]: nextRow }));
    const patch = patchFromGoalRow(field, nextRow);
    if (!patch) {
      return;
    }
    schedule(field, () => {
      startTransition(() => {
        runSettingsAction(() => saveGoalsAction(patch, initData));
      });
    }, immediate);
  }

  return (
    <SettingsSection
      description={<Trans>Turn on a nutrient to track it in the summary.</Trans>}
      title={<Trans>Daily Goals</Trans>}
    >
      {GOAL_FIELDS.map((field, index) => {
        const spec = GOAL_SPECS[field];
        const row = rows[field];
        const { color, icon: Icon } = GOAL_ICONS[field];
        const label = t(GOAL_LABELS[field]);
        return (
          <Fragment key={field}>
            {index > 0 ? <Separator /> : null}
            <ItemCard>
              <ItemCard.Icon style={{ color }}>
                <Icon />
              </ItemCard.Icon>
              <ItemCard.Content>
                <ItemCard.Title>{label}</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                  {t(GOAL_UNIT_LABELS[spec.unit])}
                </ItemCard.Description>
              </ItemCard.Content>
              <ItemCard.Action className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <NumberField
                    className="w-36 max-w-full min-w-0"
                    formatOptions={{ maximumFractionDigits: 0, useGrouping: false }}
                    isDisabled={!row.enabled}
                    key={`${field}-${locale}`}
                    maxValue={spec.max}
                    minValue={spec.min}
                    step={spec.step}
                    value={row.value ?? Number.NaN}
                    variant="secondary"
                    onChange={(value) => {
                      const nextValue =
                        value === undefined || Number.isNaN(value) ? undefined : value;
                      commit(field, { ...row, value: nextValue }, false);
                    }}
                  >
                    <Label className="sr-only">{t`${label} goal`}</Label>
                    <NumberField.Group className="w-full min-w-0">
                      <NumberField.DecrementButton />
                      <NumberField.Input className="min-w-0 text-center" />
                      <NumberField.IncrementButton />
                    </NumberField.Group>
                  </NumberField>
                  <Switch
                    aria-label={t`Enable ${label} goal`}
                    isSelected={row.enabled}
                    onChange={(enabled) => {
                      commit(field, { ...row, enabled }, true);
                    }}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                </div>
              </ItemCard.Action>
            </ItemCard>
          </Fragment>
        );
      })}
    </SettingsSection>
  );
}

export function ReminderSettings({
  initData,
  reminders,
  timezone,
}: {
  readonly initData?: string;
  readonly reminders: Readonly<Record<ReminderLabel, ReminderClock>>;
  readonly timezone: string | null;
}) {
  const { t } = useLingui();
  const { locale } = useAppLocale();
  const [rows, setRows] = useState<Record<ReminderLabel, ReminderRowState>>(() =>
    Object.fromEntries(
      REMINDER_LABELS.map((label) => [
        label,
        {
          enabled: reminders[label].enabled,
          time: new Time(reminders[label].hour, reminders[label].minute),
        },
      ]),
    ) as Record<ReminderLabel, ReminderRowState>,
  );
  const [, startTransition] = useTransition();
  const schedule = useKeyedDebounce(400);

  function persist(next: Record<ReminderLabel, ReminderRowState>) {
    startTransition(() => {
      runSettingsAction(() =>
        saveRemindersAction(
          REMINDER_LABELS.map((label) => ({
            enabled: next[label].enabled,
            hour: next[label].time.hour,
            label,
            minute: next[label].time.minute,
          })),
          initData,
        ),
      );
    });
  }

  function commit(next: Record<ReminderLabel, ReminderRowState>, immediate: boolean) {
    setRows(next);
    schedule("reminders", () => {
      persist(next);
    }, immediate);
  }

  return (
    <SettingsSection
      description={
        timezone ? (
          <Trans>Daily check-ins use your time zone.</Trans>
        ) : (
          <Trans>Set a time zone first to turn reminders on.</Trans>
        )
      }
      title={<Trans>Check-ins</Trans>}
    >
      {timezone
        ? REMINDER_LABELS.map((label, index) => {
          const row = rows[label];
          const Icon = REMINDER_ICONS[label];
          const title = t(REMINDER_TITLES[label]);
          return (
            <Fragment key={label}>
              {index > 0 ? <Separator /> : null}
              <ItemCard>
                <ItemCard.Icon>
                  <Icon />
                </ItemCard.Icon>
                <ItemCard.Content>
                  <ItemCard.Title>{title}</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <TimeField
                      className="w-[6.75rem] max-w-full min-w-0"
                      granularity="minute"
                      hourCycle={24}
                      key={`${label}-${locale}`}
                      value={row.time}
                      onChange={(time) => {
                        if (!time) {
                          return;
                        }
                        commit(
                          {
                            ...rows,
                            [label]: { ...row, time },
                          },
                          false,
                        );
                      }}
                    >
                      <Label className="sr-only">{t`${title} time`}</Label>
                      <TimeField.Group className="w-full min-w-0" variant="secondary">
                        <TimeField.Input className="min-w-0 justify-center">
                          {(segment) => <TimeField.Segment segment={segment} />}
                        </TimeField.Input>
                      </TimeField.Group>
                    </TimeField>
                    <Switch
                      aria-label={t`Enable ${title} reminder`}
                      isSelected={row.enabled}
                      onChange={(enabled) => {
                        commit(
                          {
                            ...rows,
                            [label]: { ...row, enabled },
                          },
                          true,
                        );
                      }}
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>
                </ItemCard.Action>
              </ItemCard>
            </Fragment>
          );
        })
        : null}
    </SettingsSection>
  );
}

export function LinkAccountsSettings({
  initData,
  showConsume = false,
}: {
  readonly initData?: string;
  readonly showConsume?: boolean;
}) {
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <SettingsSection
      description={<Trans>Connect Telegram or WhatsApp with a one-time code.</Trans>}
      title={<Trans>Linked Accounts</Trans>}
    >
      <ItemCard>
        <ItemCard.Icon>
          <Link />
        </ItemCard.Icon>
        <ItemCard.Content>
          <ItemCard.Title>
            <Trans>Generate a code</Trans>
          </ItemCard.Title>
          <ItemCard.Description>
            <Trans>Send /link CODE in a private chat with the bot.</Trans>
          </ItemCard.Description>
        </ItemCard.Content>
        <ItemCard.Action>
          <Button
            isPending={isPending}
            size="sm"
            variant="outline"
            onPress={() => {
              startTransition(() => {
                runSettingsAction(() => generateLinkCodeAction(initData), { successToast: true });
              });
            }}
          >
            <Trans>Generate</Trans>
          </Button>
        </ItemCard.Action>
      </ItemCard>
      {showConsume ? (
        <>
          <Separator />
          <ItemCard>
            <ItemCard.Content>
              <ItemCard.Title>
                <Trans>Enter a code from chat</Trans>
              </ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <TextField className="w-28 min-w-0" name="code" value={code} onChange={setCode}>
                  <Label className="sr-only">
                    <Trans>Link code</Trans>
                  </Label>
                  <Input autoComplete="off" className="min-w-0" placeholder="ABCD2345" variant="secondary" />
                </TextField>
                <Button
                  isDisabled={code.trim().length === 0}
                  isPending={isPending}
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    startTransition(() => {
                      runSettingsAction(() => consumeLinkCodeAction(code, initData), {
                        successToast: true,
                      });
                    });
                  }}
                >
                  <Trans>Link</Trans>
                </Button>
              </div>
            </ItemCard.Action>
          </ItemCard>
        </>
      ) : null}
    </SettingsSection>
  );
}
