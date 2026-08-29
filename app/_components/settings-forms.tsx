"use client";

import { Time } from "@internationalized/date";
import {
  Button,
  Card,
  ComboBox,
  Input,
  Label,
  ListBox,
  Switch,
  TextField,
  TimeField,
} from "@heroui/react";
import { useState, useTransition } from "react";
import {
  consumeLinkCodeAction,
  generateLinkCodeAction,
  saveCountryAction,
  saveRemindersAction,
  saveTimezoneAction,
} from "@/app/actions/settings";
import type { CountryOption } from "@/lib/countries";
import {
  REMINDER_LABELS,
  type ReminderClock,
  type ReminderLabel,
} from "@/lib/reminder-clock";

const NONE_KEY = "__none__";

const REMINDER_TITLES: Record<ReminderLabel, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

type ReminderRowState = {
  enabled: boolean;
  time: Time;
};

export function CountrySettings({
  countries,
  defaultCountry,
}: {
  readonly countries: readonly CountryOption[];
  readonly defaultCountry: string | null;
}) {
  const [selected, setSelected] = useState<string>(defaultCountry ?? NONE_KEY);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Country</Card.Title>
        <Card.Description>
          Product lookups use this country so results match local packaged foods.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex items-end gap-2">
        <ComboBox
          className="min-w-0 flex-1"
          defaultSelectedKey={defaultCountry ?? NONE_KEY}
          menuTrigger="focus"
          onSelectionChange={(key) => {
            setSelected(key === null ? NONE_KEY : String(key));
          }}
        >
          <Label className="sr-only">Country</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Search countries…" variant="secondary" />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox>
              <ListBox.Item id={NONE_KEY} textValue="Not set (worldwide)">
                Not set (worldwide)
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {countries.map((country) => (
                <ListBox.Item key={country.code} id={country.code} textValue={country.name}>
                  {country.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>
        <Button
          isPending={isPending}
          onPress={() => {
            startTransition(() => {
              void saveCountryAction(selected === NONE_KEY ? "" : selected);
            });
          }}
        >
          Save
        </Button>
      </Card.Content>
    </Card>
  );
}

export function TimezoneSettings({
  defaultTimezone,
  timeZones,
}: {
  readonly defaultTimezone: string | null;
  readonly timeZones: readonly string[];
}) {
  const [selected, setSelected] = useState<string>(defaultTimezone ?? NONE_KEY);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Time Zone</Card.Title>
        <Card.Description>
          Meal times, summaries, and check-in reminders use this zone.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex items-end gap-2">
        <ComboBox
          className="min-w-0 flex-1"
          defaultSelectedKey={defaultTimezone ?? NONE_KEY}
          menuTrigger="focus"
          onSelectionChange={(key) => {
            setSelected(key === null ? NONE_KEY : String(key));
          }}
        >
          <Label className="sr-only">Time zone</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Search time zones…" variant="secondary" />
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
        <Button
          isPending={isPending}
          onPress={() => {
            startTransition(() => {
              void saveTimezoneAction(selected === NONE_KEY ? "" : selected);
            });
          }}
        >
          Save
        </Button>
      </Card.Content>
    </Card>
  );
}

export function ReminderSettings({
  reminders,
}: {
  readonly reminders: Readonly<Record<ReminderLabel, ReminderClock>>;
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
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Meal Reminders</Card.Title>
        <Card.Description>
          Daily check-ins ask how breakfast, lunch, and dinner went. Times are local to your time
          zone.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        {REMINDER_LABELS.map((label) => {
          const row = rows[label];
          return (
            <div className="flex items-center justify-between gap-3" key={label}>
              <span className="text-foreground text-sm">{REMINDER_TITLES[label]}</span>
              <div className="flex items-center gap-3">
                <TimeField
                  className="w-36"
                  granularity="minute"
                  hourCycle={24}
                  value={row.time}
                  onChange={(time) => {
                    if (!time) {
                      return;
                    }
                    setRows((current) => ({
                      ...current,
                      [label]: { ...current[label], time },
                    }));
                  }}
                >
                  <Label className="sr-only">{REMINDER_TITLES[label]} time</Label>
                  <TimeField.Group variant="secondary">
                    <TimeField.Input>
                      {(segment) => <TimeField.Segment segment={segment} />}
                    </TimeField.Input>
                  </TimeField.Group>
                </TimeField>
                <Switch
                  aria-label={`Enable ${REMINDER_TITLES[label]} reminder`}
                  isSelected={row.enabled}
                  onChange={(enabled) => {
                    setRows((current) => ({
                      ...current,
                      [label]: { ...current[label], enabled },
                    }));
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </div>
            </div>
          );
        })}
      </Card.Content>
      <Card.Footer>
        <Button
          isPending={isPending}
          onPress={() => {
            startTransition(() => {
              void saveRemindersAction(
                REMINDER_LABELS.map((label) => ({
                  enabled: rows[label].enabled,
                  hour: rows[label].time.hour,
                  label,
                  minute: rows[label].time.minute,
                })),
              );
            });
          }}
        >
          Save reminders
        </Button>
      </Card.Footer>
    </Card>
  );
}

export function LinkCodeSettings() {
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Link Telegram or WhatsApp</Card.Title>
        <Card.Description>
          Generate a code, then send /link CODE in a private chat with the bot.
        </Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button
          isPending={isPending}
          onPress={() => {
            startTransition(() => {
              void generateLinkCodeAction();
            });
          }}
        >
          Generate link code
        </Button>
      </Card.Footer>
    </Card>
  );
}

export function ConsumeLinkCodeSettings() {
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Enter a Code from Chat</Card.Title>
        <Card.Description>
          If you started in Telegram or WhatsApp, send /link there and paste that code here.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex items-end gap-2">
        <TextField
          className="min-w-0 flex-1"
          name="code"
          value={code}
          onChange={setCode}
        >
          <Label className="sr-only">Link code</Label>
          <Input autoComplete="off" placeholder="ABCD2345" variant="secondary" />
        </TextField>
        <Button
          isDisabled={code.trim().length === 0}
          isPending={isPending}
          onPress={() => {
            startTransition(() => {
              void consumeLinkCodeAction(code);
            });
          }}
        >
          Link
        </Button>
      </Card.Content>
    </Card>
  );
}
