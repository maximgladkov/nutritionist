"use client";

import {
  consumeLinkCodeAction,
  generateLinkCodeAction,
  saveCountryAction,
  saveGoalsAction,
  saveRemindersAction,
  saveTimezoneAction,
  type SettingsNotice,
} from "@/app/actions/settings";
import type { CountryOption } from "@/lib/countries";
import {
  GOAL_FIELDS,
  GOAL_SPECS,
  type GoalField,
  type GoalsPatch,
  type GoalsView,
} from "@/lib/goal-values";
import {
  REMINDER_LABELS,
  type ReminderClock,
  type ReminderLabel,
} from "@/lib/reminder-clock";
import {
  ChartColumn,
  ClockFill,
  Cup,
  Droplet,
  Flame,
  Globe,
  HeartFill,
  Link,
  Moon,
  SparklesFill,
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
  Separator,
  Switch,
  TextField,
  TimeField,
  toast,
} from "@heroui/react";
import { Time } from "@internationalized/date";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";

const NONE_KEY = "__none__";

const REMINDER_TITLES: Record<ReminderLabel, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  summary: "Daily summary",
};

const REMINDER_ICONS: Record<ReminderLabel, typeof Cup> = {
  breakfast: Cup,
  lunch: Sun,
  dinner: Moon,
  summary: ChartColumn,
};

const GOAL_ICONS: Record<GoalField, { color: string; icon: typeof Flame }> = {
  caloriesPerDay: { color: "var(--goal-calories)", icon: Flame },
  proteinGPerDay: { color: "var(--goal-protein)", icon: HeartFill },
  carbsGPerDay: { color: "var(--goal-carbs)", icon: ThunderboltFill },
  fatGPerDay: { color: "var(--goal-fat)", icon: Droplet },
  fiberGPerDay: { color: "var(--goal-fiber)", icon: SparklesFill },
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

export function LocationSettings({
  countries,
  defaultCountry,
  defaultTimezone,
  initData,
  onTimezoneSaved,
  timeZones,
}: {
  readonly countries: readonly CountryOption[];
  readonly defaultCountry: string | null;
  readonly defaultTimezone: string | null;
  readonly initData?: string;
  readonly onTimezoneSaved?: () => void;
  readonly timeZones: readonly string[];
}) {
  const [country, setCountry] = useState<string>(defaultCountry ?? NONE_KEY);
  const [timezone, setTimezone] = useState<string>(defaultTimezone ?? NONE_KEY);
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <ItemCardGroup variant="transparent" className="overflow-hidden">
      <ItemCardGroup.Header>
        <ItemCardGroup.Title>Location</ItemCardGroup.Title>
        <ItemCardGroup.Description>
          Product lookups, meal times, and reminders use these.
        </ItemCardGroup.Description>
      </ItemCardGroup.Header>

      <ItemCardGroup className="overflow-hidden">
        <ItemCard>
          <ItemCard.Icon>
            <Globe />
          </ItemCard.Icon>
          <ItemCard.Content>
            <ItemCard.Title>Country</ItemCard.Title>
          </ItemCard.Content>
          <ItemCard.Action>
            <ComboBox
              className="w-40"
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
              <Label className="sr-only">Country</Label>
              <ComboBox.InputGroup>
                <Input placeholder="Search…" variant="secondary" />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  <ListBox.Item id={NONE_KEY} textValue="Not set (worldwide)">
                    Not set (worldwide)
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
            <ItemCard.Title>Time zone</ItemCard.Title>
          </ItemCard.Content>
          <ItemCard.Action>
            <ComboBox
              className="w-40"
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
              <Label className="sr-only">Time zone</Label>
              <ComboBox.InputGroup>
                <Input placeholder="Search…" variant="secondary" />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  <ListBox.Item id={NONE_KEY} textValue="Not set">
                    Not set
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
      </ItemCardGroup>
    </ItemCardGroup>
  );
}

export function DailyGoalsSettings({
  defaultGoals,
  initData,
}: {
  readonly defaultGoals: GoalsView;
  readonly initData?: string;
}) {
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
    <ItemCardGroup variant="transparent" className="overflow-hidden">
      <ItemCardGroup.Header>
        <ItemCardGroup.Title>Daily Goals</ItemCardGroup.Title>
        <ItemCardGroup.Description>
          Turn on a nutrient to track it on the summary rings.
        </ItemCardGroup.Description>
      </ItemCardGroup.Header>
      <ItemCardGroup className="overflow-hidden">
        {GOAL_FIELDS.map((field, index) => {
          const spec = GOAL_SPECS[field];
          const row = rows[field];
          const { color, icon: Icon } = GOAL_ICONS[field];
          return (
            <Fragment key={field}>
              {index > 0 ? <Separator /> : null}
              <ItemCard>
                <ItemCard.Icon style={{ color }}>
                  <Icon />
                </ItemCard.Icon>
                <ItemCard.Content>
                  <ItemCard.Title>{spec.label}</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action>
                  <div className="flex items-center gap-2">
                    <NumberField
                      className="w-40"
                      formatOptions={{ maximumFractionDigits: 0, useGrouping: false }}
                      isDisabled={!row.enabled}
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
                      <Label className="sr-only">{spec.label} goal</Label>
                      <NumberField.Group>
                        <NumberField.DecrementButton />
                        <NumberField.Input className="text-center" placeholder={spec.unit} />
                        <NumberField.IncrementButton />
                      </NumberField.Group>
                    </NumberField>
                    <Switch
                      aria-label={`Enable ${spec.label} goal`}
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
      </ItemCardGroup>
    </ItemCardGroup>
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
    <ItemCardGroup variant="transparent" className="overflow-hidden">
      <ItemCardGroup.Header>
        <ItemCardGroup.Title>Check-ins</ItemCardGroup.Title>
        <ItemCardGroup.Description>
          {timezone
            ? "Daily check-ins use your time zone."
            : "Set a time zone first to turn reminders on."}
        </ItemCardGroup.Description>
      </ItemCardGroup.Header>
      <ItemCardGroup className="overflow-hidden">
        {timezone
          ? REMINDER_LABELS.map((label, index) => {
            const row = rows[label];
            const Icon = REMINDER_ICONS[label];
            return (
              <Fragment key={label}>
                {index > 0 ? <Separator /> : null}
                <ItemCard>
                  <ItemCard.Icon>
                    <Icon />
                  </ItemCard.Icon>
                  <ItemCard.Content>
                    <ItemCard.Title>{REMINDER_TITLES[label]}</ItemCard.Title>
                  </ItemCard.Content>
                  <ItemCard.Action>
                    <div className="flex items-center gap-2">
                      <TimeField
                        className="w-28"
                        granularity="minute"
                        hourCycle={24}
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
                        <Label className="sr-only">{REMINDER_TITLES[label]} time</Label>
                        <TimeField.Group variant="secondary">
                          <TimeField.Input className="justify-center">
                            {(segment) => <TimeField.Segment segment={segment} />}
                          </TimeField.Input>
                        </TimeField.Group>
                      </TimeField>
                      <Switch
                        aria-label={`Enable ${REMINDER_TITLES[label]} reminder`}
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
      </ItemCardGroup>
    </ItemCardGroup>
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
    <ItemCardGroup variant="transparent" className="overflow-hidden">
      <ItemCardGroup.Header>
        <ItemCardGroup.Title>Linked Accounts</ItemCardGroup.Title>
        <ItemCardGroup.Description>
          Connect Telegram or WhatsApp with a one-time code.
        </ItemCardGroup.Description>
      </ItemCardGroup.Header>
      <ItemCardGroup className="overflow-hidden">
        <ItemCard>
          <ItemCard.Icon>
            <Link />
          </ItemCard.Icon>
          <ItemCard.Content>
            <ItemCard.Title>Generate a code</ItemCard.Title>
            <ItemCard.Description>Send /link CODE in a private chat with the bot.</ItemCard.Description>
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
              Generate
            </Button>
          </ItemCard.Action>
        </ItemCard>
        {showConsume ? (
          <>
            <Separator />
            <ItemCard>
              <ItemCard.Content>
                <ItemCard.Title>Enter a code from chat</ItemCard.Title>
              </ItemCard.Content>
              <ItemCard.Action>
                <div className="flex items-center gap-2">
                  <TextField className="w-28" name="code" value={code} onChange={setCode}>
                    <Label className="sr-only">Link code</Label>
                    <Input autoComplete="off" placeholder="ABCD2345" variant="secondary" />
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
                    Link
                  </Button>
                </div>
              </ItemCard.Action>
            </ItemCard>
          </>
        ) : null}
      </ItemCardGroup>
    </ItemCardGroup>
  );
}
