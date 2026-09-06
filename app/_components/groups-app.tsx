"use client";

import { MemberDiary } from "@/app/_components/member-diary";
import { bootTelegramWebApp, telegramWebApp } from "@/app/_components/telegram-webapp-client";
import {
  createGroupAction,
  deleteGroupAction,
  getJoinedGroupDetailAction,
  getOwnedGroupDetailAction,
  leaveGroupAction,
  listGroupsAction,
  listMemberMessagesAction,
  removeGroupMemberAction,
  rotateInviteTokenAction,
  sendGroupMessageAction,
  updateGroupAction,
} from "@/app/actions/groups";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from "@/lib/groups-core";
import type {
  GroupListItem,
  GroupMemberDetail,
  GroupMemberView,
  GroupMessageView,
  GroupOwnerDetail,
} from "@/lib/groups";
import { ArrowLeft, Pencil, PersonFill, TrashBin } from "@gravity-ui/icons";
import { EmptyState, Sheet } from "@heroui-pro/react";
import {
  Button,
  Input,
  Label,
  Spinner,
  TextArea,
  TextField,
  toast,
  Tooltip,
} from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

type GroupsSWRKey = readonly ["groups", string];
type View =
  | { kind: "list" }
  | { kind: "owned"; groupId: string }
  | { kind: "joined"; groupId: string }
  | { kind: "person"; groupId: string; member: GroupMemberView };

async function fetchGroups([, initData]: GroupsSWRKey): Promise<readonly GroupListItem[]> {
  const result = await listGroupsAction({ initData: initData || undefined });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function GroupsApp({
  compact = false,
  embed = false,
}: {
  readonly compact?: boolean;
  readonly embed?: boolean;
}) {
  const { t } = useLingui();
  const [initData, setInitData] = useState<string | null>(embed ? null : "");
  const [view, setView] = useState<View>({ kind: "list" });
  const [formOpen, setFormOpen] = useState<"create" | "edit" | null>(null);

  useEffect(() => {
    if (!embed) {
      return;
    }
    return bootTelegramWebApp((value) => {
      setInitData(value);
    });
  }, [embed]);

  const readyInit = embed ? initData : "";
  const groupsKey: GroupsSWRKey | null = readyInit != null ? ["groups", readyInit] : null;
  const { data, error, isLoading, mutate } = useSWR(groupsKey, fetchGroups, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  const telegramInit = readyInit || undefined;
  const groups = data ?? [];
  const errorMessage = error instanceof Error ? error.message : error ? t`Could not load groups.` : null;
  const editing = formOpen === "edit" && view.kind === "owned" ? groups.find((row) => row.id === view.groupId) : null;

  const frameClass = embed
    ? "mx-auto flex w-full max-w-lg flex-col gap-4 px-3 py-3"
    : compact
      ? "flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto px-3 py-3"
      : "mx-auto flex w-full max-w-lg flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8";

  if (readyInit === null) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className={frameClass}>
      {view.kind === "list" ? (
        <GroupsList
          errorMessage={errorMessage}
          groups={groups}
          loading={isLoading && !data}
          onCreate={() => {
            setFormOpen("create");
          }}
          onOpen={(group) => {
            setView(group.role === "owner" ? { groupId: group.id, kind: "owned" } : { groupId: group.id, kind: "joined" });
          }}
        />
      ) : null}
      {view.kind === "owned" ? (
        <OwnedGroupView
          groupId={view.groupId}
          initData={telegramInit}
          onBack={() => {
            setView({ kind: "list" });
            void mutate();
          }}
          onEdit={() => {
            setFormOpen("edit");
          }}
          onOpenMember={(member) => {
            setView({ groupId: view.groupId, kind: "person", member });
          }}
        />
      ) : null}
      {view.kind === "joined" ? (
        <JoinedGroupView
          groupId={view.groupId}
          initData={telegramInit}
          onBack={() => {
            setView({ kind: "list" });
            void mutate();
          }}
          onLeft={() => {
            setView({ kind: "list" });
            void mutate();
          }}
        />
      ) : null}
      {view.kind === "person" ? (
        <MemberPersonView
          groupId={view.groupId}
          initData={telegramInit}
          member={view.member}
          onBack={() => {
            setView({ groupId: view.groupId, kind: "owned" });
          }}
        />
      ) : null}
      <GroupFormSheet
        group={editing ?? null}
        initData={telegramInit}
        mode={formOpen === "edit" ? "edit" : "create"}
        open={formOpen !== null}
        onClose={() => {
          setFormOpen(null);
        }}
        onSaved={() => {
          setFormOpen(null);
          void mutate();
        }}
      />
    </div>
  );
}

function GroupsList({
  errorMessage,
  groups,
  loading,
  onCreate,
  onOpen,
}: {
  readonly errorMessage: string | null;
  readonly groups: readonly GroupListItem[];
  readonly loading: boolean;
  readonly onCreate: () => void;
  readonly onOpen: (group: GroupListItem) => void;
}) {
  const { t } = useLingui();
  return (
    <>
      {errorMessage ? <p className="text-danger text-sm">{errorMessage}</p> : null}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : null}
      {!loading && groups.length === 0 && !errorMessage ? (
        <EmptyState className="bg-surface-secondary rounded-2xl">
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              <PersonFill className="size-5" />
            </EmptyState.Media>
            <EmptyState.Title>
              <Trans>Groups</Trans>
            </EmptyState.Title>
            <EmptyState.Description>
              <Trans>Create a group and send the invite to people you help.</Trans>
            </EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content>
            <Button onPress={onCreate}>
              <Trans>New group</Trans>
            </Button>
          </EmptyState.Content>
        </EmptyState>
      ) : null}
      {groups.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                className="bg-surface-secondary flex w-full cursor-[var(--cursor-interactive)] items-center gap-3 rounded-2xl p-3 text-left"
                type="button"
                onClick={() => {
                  onOpen(group);
                }}
              >
                {group.imageUrl ? (
                  <img alt="" className="size-12 shrink-0 rounded-xl object-cover" src={group.imageUrl} />
                ) : (
                  <span className="bg-surface-tertiary flex size-12 shrink-0 items-center justify-center rounded-xl">
                    <PersonFill className="text-muted size-5" />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-foreground truncate font-medium">{group.name}</span>
                  <span className="text-muted truncate text-sm">
                    {group.role === "owner" ? t`Owner` : (group.ownerName ?? t`Member`)}
                    {" · "}
                    {group.memberCount}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && (groups.length > 0 || errorMessage) ? (
        <Button fullWidth onPress={onCreate}>
          <Trans>New group</Trans>
        </Button>
      ) : null}
    </>
  );
}

function OwnedGroupView({
  groupId,
  initData,
  onBack,
  onEdit,
  onOpenMember,
}: {
  readonly groupId: string;
  readonly initData?: string;
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onOpenMember: (member: GroupMemberView) => void;
}) {
  const { t } = useLingui();
  const [detail, setDetail] = useState<GroupOwnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"delete" | "rotate" | "remove" | null>(null);

  async function reload() {
    const result = await getOwnedGroupDetailAction({ groupId, initData });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDetail(result.data);
    setError(null);
  }

  useEffect(() => {
    void reload();
  }, [groupId, initData]);

  if (!detail && !error) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton label={t`Groups`} onPress={onBack} />
        <p className="text-danger text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <BackButton label={t`Groups`} onPress={onBack} />
        <div className="flex items-center gap-1">
          <Tooltip delay={0}>
            <Button aria-label={t`Edit group`} isIconOnly size="sm" variant="ghost" onPress={onEdit}>
              <Pencil className="size-4" />
            </Button>
            <Tooltip.Content>
              <Trans>Edit</Trans>
            </Tooltip.Content>
          </Tooltip>
          <Tooltip delay={0}>
            <Button
              aria-label={t`Delete group`}
              isIconOnly
              isPending={busy === "delete"}
              size="sm"
              variant="danger-soft"
              onPress={() => {
                setBusy("delete");
                void deleteGroupAction({ groupId, initData }).then((result) => {
                  setBusy(null);
                  if (!result.ok) {
                    toast.danger(result.error);
                    return;
                  }
                  onBack();
                });
              }}
            >
              <TrashBin className="size-4" />
            </Button>
            <Tooltip.Content>
              <Trans>Delete</Trans>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>
      <GroupHero description={detail.description} imageUrl={detail.imageUrl} name={detail.name} />
      <div className="flex flex-col gap-2">
        <p className="text-muted text-sm">
          <Trans>Telegram opens the Mini App. The web link works in a browser.</Trans>
        </p>
        <Button
          variant="secondary"
          onPress={() => {
            shareTelegramInvite(detail, detail.name);
          }}
        >
          <Trans>Share in Telegram</Trans>
        </Button>
        <Button
          variant="secondary"
          onPress={() => {
            void copyWebInvite(webInviteUrlFor(detail), t`Web invite copied.`, t`Could not copy the link.`);
          }}
        >
          <Trans>Copy web link</Trans>
        </Button>
        <Button
          isPending={busy === "rotate"}
          variant="ghost"
          onPress={() => {
            setBusy("rotate");
            void rotateInviteTokenAction({ groupId, initData }).then((result) => {
              setBusy(null);
              if (!result.ok) {
                toast.danger(result.error);
                return;
              }
              setDetail({
                ...detail,
                inviteToken: result.data.inviteToken,
                telegramInviteUrl: result.data.telegramInviteUrl,
                webInviteUrl: result.data.webInviteUrl,
              });
              toast.success(t`Invite link reset.`);
            });
          }}
        >
          <Trans>Reset invite link</Trans>
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-foreground text-sm font-semibold">
          <Trans>Members</Trans>
        </h2>
        {detail.members.length === 0 ? (
          <p className="text-muted text-sm">
            <Trans>No one has joined yet. Share the invite to get started.</Trans>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.members.map((member) => (
              <li className="flex items-center gap-2" key={member.userId}>
                <button
                  className="bg-surface-secondary flex min-w-0 flex-1 cursor-[var(--cursor-interactive)] items-center rounded-2xl px-3 py-3 text-left"
                  type="button"
                  onClick={() => {
                    onOpenMember(member);
                  }}
                >
                  <span className="text-foreground truncate font-medium">{member.name?.trim() || t`Member`}</span>
                </button>
                <Tooltip delay={0}>
                  <Button
                    aria-label={t`Remove member`}
                    isIconOnly
                    isPending={busy === "remove"}
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setBusy("remove");
                      void removeGroupMemberAction({ groupId, initData, memberId: member.userId }).then((result) => {
                        setBusy(null);
                        if (!result.ok) {
                          toast.danger(result.error);
                          return;
                        }
                        void reload();
                      });
                    }}
                  >
                    <TrashBin className="size-4" />
                  </Button>
                  <Tooltip.Content>
                    <Trans>Remove</Trans>
                  </Tooltip.Content>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function JoinedGroupView({
  groupId,
  initData,
  onBack,
  onLeft,
}: {
  readonly groupId: string;
  readonly initData?: string;
  readonly onBack: () => void;
  readonly onLeft: () => void;
}) {
  const { t } = useLingui();
  const [detail, setDetail] = useState<GroupMemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    void getJoinedGroupDetailAction({ groupId, initData }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDetail(result.data);
    });
  }, [groupId, initData]);

  if (!detail && !error) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton label={t`Groups`} onPress={onBack} />
        <p className="text-danger text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <BackButton label={t`Groups`} onPress={onBack} />
      <GroupHero
        description={detail.description}
        imageUrl={detail.imageUrl}
        name={detail.name}
        ownerName={detail.ownerName}
      />
      <div className="flex flex-col gap-2">
        <h2 className="text-foreground text-sm font-semibold">
          <Trans>Messages</Trans>
        </h2>
        {detail.messages.length === 0 ? (
          <p className="text-muted text-sm">
            <Trans>No messages yet.</Trans>
          </p>
        ) : (
          <MessageList messages={detail.messages} />
        )}
      </div>
      <Button
        isPending={leaving}
        variant="danger-soft"
        onPress={() => {
          setLeaving(true);
          void leaveGroupAction({ groupId, initData }).then((result) => {
            setLeaving(false);
            if (!result.ok) {
              toast.danger(result.error);
              return;
            }
            onLeft();
          });
        }}
      >
        <Trans>Leave group</Trans>
      </Button>
    </div>
  );
}

function MemberPersonView({
  groupId,
  initData,
  member,
  onBack,
}: {
  readonly groupId: string;
  readonly initData?: string;
  readonly member: GroupMemberView;
  readonly onBack: () => void;
}) {
  const { t } = useLingui();
  const [messages, setMessages] = useState<GroupMessageView[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const displayName = member.name?.trim() || t`Member`;

  useEffect(() => {
    void listMemberMessagesAction({ groupId, initData, memberId: member.userId }).then((result) => {
      if (result.ok) {
        setMessages(result.data);
      }
    });
  }, [groupId, initData, member.userId]);

  return (
    <div className="flex flex-col gap-5">
      <BackButton label={t`Members`} onPress={onBack} />
      <h1 className="text-foreground text-xl font-semibold">{displayName}</h1>
      <MemberDiary groupId={groupId} initData={initData} memberId={member.userId} />
      <div className="flex flex-col gap-3">
        <h2 className="text-foreground text-sm font-semibold">
          <Trans>Messages</Trans>
        </h2>
        <TextField>
          <Label>
            <Trans>Message</Trans>
          </Label>
          <TextArea
            className="w-full"
            rows={4}
            value={body}
            variant="secondary"
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
        </TextField>
        <Button
          isDisabled={body.trim().length === 0}
          isPending={sending}
          onPress={() => {
            setSending(true);
            void sendGroupMessageAction({
              body,
              groupId,
              initData,
              memberId: member.userId,
            }).then((result) => {
              setSending(false);
              if (!result.ok) {
                toast.danger(result.error);
                return;
              }
              setBody("");
              setMessages((prev) => [result.data, ...prev]);
            });
          }}
        >
          <Trans>Send</Trans>
        </Button>
        {messages.length > 0 ? <MessageList messages={messages} /> : null}
      </div>
    </div>
  );
}

function GroupFormSheet({
  group,
  initData,
  mode,
  onClose,
  onSaved,
  open,
}: {
  readonly group: GroupListItem | null;
  readonly initData?: string;
  readonly mode: "create" | "edit";
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}) {
  const { t } = useLingui();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const preview = useMemo(() => {
    if (file) {
      return URL.createObjectURL(file);
    }
    return group?.imageUrl ?? null;
  }, [file, group?.imageUrl]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(group?.name ?? "");
    setDescription(group?.description ?? "");
    setFile(null);
    setPending(false);
  }, [group, open]);

  useEffect(() => {
    if (!file) {
      return;
    }
    const url = URL.createObjectURL(file);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const canSubmit = !pending && name.trim().length > 0;

  return (
    <Sheet
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <Sheet.Backdrop>
        <Sheet.Content className="mx-auto max-h-[95vh] max-w-[420px]">
          <Sheet.Dialog>
            <Sheet.Handle />
            <Sheet.CloseTrigger />
            <Sheet.Header>
              <Sheet.Heading>
                {mode === "create" ? <Trans>New group</Trans> : <Trans>Edit group</Trans>}
              </Sheet.Heading>
            </Sheet.Header>
            <Sheet.Body className="flex flex-col gap-5">
              <TextField value={name} onChange={setName}>
                <Label isRequired>
                  <Trans>Name</Trans>
                </Label>
                <Input maxLength={GROUP_NAME_MAX} variant="secondary" />
              </TextField>
              <TextField value={description} onChange={setDescription}>
                <Label>
                  <Trans>Description</Trans>
                </Label>
                <TextArea className="w-full" maxLength={GROUP_DESCRIPTION_MAX} rows={4} variant="secondary" />
              </TextField>
              <label className="flex cursor-[var(--cursor-interactive)] flex-col gap-2">
                <span className="text-sm font-medium">
                  <Trans>Image</Trans>
                </span>
                {preview ? (
                  <img alt="" className="size-24 rounded-2xl object-cover" src={preview} />
                ) : (
                  <span className="bg-surface-secondary text-muted flex size-24 items-center justify-center rounded-2xl px-2 text-center text-xs">
                    <Trans>Choose an image</Trans>
                  </span>
                )}
                <input
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="sr-only"
                  type="file"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                  }}
                />
              </label>
            </Sheet.Body>
            <Sheet.Footer>
              <Button
                className="w-full"
                isDisabled={!canSubmit}
                isPending={pending}
                onPress={() => {
                  setPending(true);
                  const formData = new FormData();
                  formData.set("name", name);
                  formData.set("description", description);
                  if (initData) {
                    formData.set("initData", initData);
                  }
                  if (file) {
                    formData.set("image", file);
                  }
                  const run =
                    mode === "create"
                      ? createGroupAction(formData)
                      : (() => {
                          formData.set("groupId", group?.id ?? "");
                          return updateGroupAction(formData);
                        })();
                  void run.then((result) => {
                    setPending(false);
                    if (!result.ok) {
                      toast.danger(result.error);
                      return;
                    }
                    onSaved();
                  });
                }}
              >
                {mode === "create" ? <Trans>Create</Trans> : <Trans>Save</Trans>}
              </Button>
            </Sheet.Footer>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}

function GroupHero({
  description,
  imageUrl,
  name,
  ownerName,
}: {
  readonly description: string;
  readonly imageUrl: string;
  readonly name: string;
  readonly ownerName?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {imageUrl ? <img alt="" className="aspect-square w-full rounded-2xl object-cover" src={imageUrl} /> : null}
      <div className="flex flex-col gap-1">
        <h1 className="text-foreground text-xl font-semibold">{name}</h1>
        {ownerName ? <p className="text-muted text-sm">{ownerName}</p> : null}
        {description ? <p className="text-foreground whitespace-pre-wrap text-sm">{description}</p> : null}
      </div>
    </div>
  );
}

function MessageList({ messages }: { readonly messages: readonly GroupMessageView[] }) {
  const { t } = useLingui();
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((message) => (
        <li className="bg-surface-secondary flex flex-col gap-1 rounded-2xl p-3" key={message.id}>
          <p className="text-foreground whitespace-pre-wrap text-sm">{message.body}</p>
          <p className="text-muted text-xs">
            {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(message.createdAt),
            )}
            {message.fromName ? ` · ${message.fromName}` : ` · ${t`Coach`}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

function BackButton({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  return (
    <Button className="-ml-2 self-start" size="sm" variant="ghost" onPress={onPress}>
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  );
}

function webInviteUrlFor(detail: GroupOwnerDetail): string {
  return detail.webInviteUrl ?? `${window.location.origin}/g/${detail.inviteToken}`;
}

function telegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

function shareTelegramInvite(detail: GroupOwnerDetail, name: string): void {
  const url = detail.telegramInviteUrl ?? webInviteUrlFor(detail);
  const share = telegramShareUrl(url, name);
  const telegram = telegramWebApp();
  if (typeof telegram?.openTelegramLink === "function") {
    telegram.openTelegramLink(share);
    return;
  }
  window.open(share, "_blank", "noopener,noreferrer");
}

async function copyWebInvite(url: string, copied: string, failed: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success(copied);
  } catch {
    toast.danger(failed);
  }
}
