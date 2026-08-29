"use client";

import type { FileUIPart, UserContent } from "ai";
import { useEveAgent } from "eve/react";
import {
  AlertCircleIcon,
  BrainIcon,
  PaperclipIcon,
  PlusIcon,
  SettingsIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { useEffect, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationTopFade,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { prepareImageFiles } from "@/lib/heic";
import { cn } from "@/lib/utils";
import { AgentMessage } from "./agent-message";

const AGENT_NAME = "Nutritionist";
const IMAGE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_ATTACHMENT_FILES = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function AgentChat({
  sessionId,
  sessionless = false,
}: {
  readonly sessionId?: string;
  readonly sessionless?: boolean;
}) {
  const [cancellationError, setCancellationError] = useState<string>();
  const [hasInputText, setHasInputText] = useState(false);
  const [optimisticFiles, setOptimisticFiles] = useState<readonly FileUIPart[]>([]);
  const agent = useEveAgent({
    initialSession:
      sessionId === undefined
        ? undefined
        : {
            sessionId,
            streamIndex: 0,
          },
    resume: sessionId !== undefined,
    onSessionChange(session) {
      if (sessionId === undefined && session !== undefined) {
        // Next patches window.history to navigate, which would detach the active stream.
        History.prototype.replaceState.call(
          window.history,
          window.history.state,
          "",
          `/s/${encodeURIComponent(session.sessionId)}`,
        );
      }
    },
  });

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isResuming = agent.status === "resuming";
  const isEmpty = agent.data.messages.length === 0;
  const lastMessage = agent.data.messages.at(-1);
  const isPendingAssistantShell =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.every((part) => part.type === "step-start");
  const showPendingThinking =
    isBusy &&
    (agent.status === "submitted" || lastMessage?.role !== "assistant" || isPendingAssistantShell);
  const turnFailure = isBusy || isResuming ? undefined : getLatestTurnFailure(agent.events);
  const errorMessage = cancellationError ?? agent.error?.message ?? turnFailure;
  const hasConversationContent = sessionless || !isEmpty || errorMessage !== undefined;
  const showConversationLayout = isResuming || hasConversationContent;
  const activeSessionId = sessionId ?? agent.session?.sessionId;

  useEffect(() => {
    if (!agent.data.messages.some((message) => message.metadata?.optimistic)) {
      setOptimisticFiles([]);
    }
  }, [agent.data.messages]);

  const requestCancellation = () => {
    setCancellationError(undefined);
    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error));
    });
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if ((text.length === 0 && message.files.length === 0) || isResuming) return;

    setHasInputText(false);
    setCancellationError(undefined);
    setOptimisticFiles(message.files);
    const options = isBusy ? { turnPolicy: "steer" as const } : undefined;

    if (message.files.length === 0) {
      await agent.send(text, options);
      return;
    }

    const parts: UserContent = [];
    if (text.length > 0) {
      parts.push({ text, type: "text" });
    }
    for (const file of message.files) {
      parts.push({
        data: file.url,
        filename: file.filename,
        mediaType: file.mediaType,
        type: "file",
      });
    }

    await agent.send(parts, options);
  };

  const composer = (
    <PromptInput
      accept={IMAGE_ACCEPT}
      maxFiles={MAX_ATTACHMENT_FILES}
      maxFileSize={MAX_ATTACHMENT_BYTES}
      multiple
      onError={(error) => setCancellationError(error.message)}
      onSubmit={handleSubmit}
      prepareFiles={prepareImageFiles}
    >
      <ComposerHeader />
      <PromptInputTextarea
        className="min-h-12"
        disabled={isResuming}
        onChange={(event) => setHasInputText(event.currentTarget.value.trim().length > 0)}
        placeholder="Ask about a meal or attach a photo…"
      />
      <PromptInputFooter>
        <PromptInputTools>
          <ComposerAttachButton disabled={isResuming} />
        </PromptInputTools>
        <ComposerAction
          hasInputText={hasInputText}
          isBusy={isBusy}
          isResuming={isResuming}
          onCancel={requestCancellation}
        />
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <ChatHeader canStartNewChat={activeSessionId !== undefined} />

      {showConversationLayout ? (
        <Conversation
          className="min-h-0 flex-1"
          initial={sessionId === undefined ? undefined : false}
          resize={activeSessionId === undefined ? "smooth" : "instant"}
          scrollRestorationKey={
            isEmpty || activeSessionId === undefined
              ? undefined
              : `eve:web-chat-scroll:${activeSessionId}`
          }
        >
          <ConversationTopFade className="top-14" />
          <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 pt-20 pb-44 sm:px-6">
            {agent.data.messages.map((message, index) =>
              showPendingThinking &&
              isPendingAssistantShell &&
              message.id === lastMessage.id ? null : (
                <AgentMessage
                  canRespond={!isBusy && !isResuming}
                  extraFiles={
                    message.metadata?.optimistic && optimisticFiles.length > 0
                      ? optimisticFiles
                      : undefined
                  }
                  isStreaming={
                    agent.status === "streaming" && index === agent.data.messages.length - 1
                  }
                  key={message.id}
                  message={message}
                  onInputResponses={(inputResponses) => {
                    setCancellationError(undefined);
                    return agent.respond(inputResponses);
                  }}
                />
              ),
            )}
            {showPendingThinking ? <PendingThinking /> : null}
            {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      ) : null}

      <div
        className={cn(
          "mx-auto w-full px-4 sm:px-6",
          showConversationLayout
            ? "fixed bottom-0 left-1/2 z-20 max-w-3xl -translate-x-1/2 bg-gradient-to-t from-background via-background to-transparent pt-4 pb-6"
            : "flex max-w-xl flex-1 flex-col items-center justify-center gap-8 pb-[10vh]",
        )}
      >
        {showConversationLayout ? null : (
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="font-medium text-5xl tracking-tighter">{AGENT_NAME}</h1>
          </div>
        )}
        <div className="w-full">{composer}</div>
      </div>
    </main>
  );
}

function ComposerAction({
  hasInputText,
  isBusy,
  isResuming,
  onCancel,
}: {
  readonly hasInputText: boolean;
  readonly isBusy: boolean;
  readonly isResuming: boolean;
  readonly onCancel: () => void;
}) {
  const attachments = usePromptInputAttachments();
  const canSubmit = hasInputText || attachments.files.length > 0;
  const isPreparing = attachments.files.some((file) => file.status === "preparing");

  if (!isBusy || canSubmit) {
    return <PromptInputSubmit className="static" disabled={isResuming || isPreparing} />;
  }

  return (
    <PromptInputButton
      aria-label="Stop"
      className="static"
      onClick={onCancel}
      variant="outline"
    >
      <SquareIcon className="size-3 fill-current" />
    </PromptInputButton>
  );
}

function ComposerAttachButton({ disabled }: { readonly disabled: boolean }) {
  const attachments = usePromptInputAttachments();

  return (
    <PromptInputButton
      aria-label="Add photo"
      disabled={disabled}
      onClick={() => attachments.openFileDialog()}
      tooltip="Add photo"
    >
      <PaperclipIcon className="size-4" />
    </PromptInputButton>
  );
}

function ComposerHeader() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <PromptInputHeader>
      <ComposerAttachments />
    </PromptInputHeader>
  );
}

function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.files.map((file) => {
        const isPreparing = file.status === "preparing";
        return (
          <span
            aria-busy={isPreparing}
            className="relative size-14 overflow-hidden rounded-md border bg-muted"
            key={file.id}
          >
            {canPreviewAttachment(file.mediaType) ? (
              <img
                alt={file.filename ?? "Attachment"}
                className="size-full object-cover"
                src={file.url}
              />
            ) : null}
            {isPreparing ? (
              <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Spinner className="size-4" />
              </span>
            ) : null}
            <button
              aria-label={`Remove ${file.filename ?? "attachment"}`}
              className="absolute top-0.5 right-0.5 z-10 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
              onClick={() => attachments.remove(file.id)}
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

function canPreviewAttachment(mediaType: string | undefined): boolean {
  if (!mediaType) {
    return false;
  }
  const type = mediaType.toLowerCase();
  return type.startsWith("image/") && !type.includes("heic") && !type.includes("heif");
}

function ErrorMessage({ message }: { readonly message: string }) {
  return (
    <Message className="max-w-full" from="assistant">
      <MessageContent>
        <div
          className="flex w-full items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
          role="alert"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Request failed</p>
            <p className="mt-0.5 text-muted-foreground">{message}</p>
          </div>
        </div>
      </MessageContent>
    </Message>
  );
}

function ChatHeader({ canStartNewChat }: { readonly canStartNewChat: boolean }) {
  return (
    <header className="pointer-events-none fixed top-0 right-0 left-0 z-20 h-14">
      <div className="relative mx-auto flex h-full w-full max-w-3xl items-center justify-center bg-background px-24">
        <span className="truncate text-muted-foreground text-sm">{AGENT_NAME}</span>
        <div className="pointer-events-auto fixed top-3 right-6 flex items-center gap-1">
          <Button asChild size="sm" type="button" variant="ghost">
            <a href="/settings">
              <SettingsIcon className="size-4" />
              <span className="hidden font-normal text-sm sm:inline">Settings</span>
            </a>
          </Button>
          <form action={signOutAction}>
            <Button size="sm" type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
          {canStartNewChat ? (
            <Button
              aria-label="Start a new chat"
              onClick={() => window.location.assign("/s")}
              size="sm"
              type="button"
              variant="ghost"
            >
              <PlusIcon className="size-4" />
              <span className="hidden font-normal text-sm sm:inline">New chat</span>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function PendingThinking() {
  return (
    <Message aria-live="polite" from="assistant">
      <MessageContent>
        <div className="mb-4 flex w-full items-center gap-2 text-muted-foreground text-sm">
          <BrainIcon className="size-4" />
          <Shimmer duration={1}>Thinking</Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to cancel the response.";
}

function getLatestTurnFailure(
  events: ReturnType<typeof useEveAgent>["events"],
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "turn.failed") {
      return event.data.code === "MODEL_CALL_FAILED"
        ? "The model is temporarily unavailable. Please try again."
        : event.data.message;
    }

    if (event.type === "turn.completed" || event.type === "turn.cancelled") {
      return undefined;
    }

    if (event.type === "message.received") {
      return undefined;
    }
  }

  return undefined;
}
