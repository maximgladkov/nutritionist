"use client";

import { prepareImageFiles } from "@/lib/heic";
import { ArrowUp, CircleExclamation, Paperclip, Square } from "@gravity-ui/icons";
import {
  ChatAttachment,
  ChatAttachmentGroup,
  ChatAttachmentInput,
  ChatConversation,
  ChatLoader,
  ChatMessage,
  PromptInput,
  TextShimmer
} from "@heroui-pro/react";
import { Alert } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { FileUIPart } from "ai";
import { failure, turns } from "eve/events";
import { useEveAgent } from "eve/react";
import { useEffect, useState } from "react";
import { AgentMessage } from "./agent-message";

const IMAGE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_ATTACHMENT_FILES = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const PHOTO_READ_ERROR = msg`Could not read the photo.`;
const MODEL_UNAVAILABLE = msg`The model is temporarily unavailable. Please try again.`;
const CANCEL_FAILED = msg`Unable to cancel the response.`;

type PendingAttachment = {
  readonly id: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly url: string;
};

export function AgentChat({
  compact = false,
  sessionId,
  sessionless = false,
}: {
  readonly compact?: boolean;
  readonly sessionId?: string;
  readonly sessionless?: boolean;
}) {
  const { t } = useLingui();
  const [cancellationError, setCancellationError] = useState<string>();
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<readonly PendingAttachment[]>([]);
  const [optimisticFiles, setOptimisticFiles] = useState<readonly FileUIPart[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
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
        History.prototype.replaceState.call(
          window.history,
          window.history.state,
          "",
          `/s/${encodeURIComponent(session.sessionId)}`,
        );
      }
    },
  });

  // A turn waiting for an answer is open, but not working.
  const isBusy = agent.status === "busy";
  const isResuming = agent.status === "resuming";
  const isEmpty = agent.messages.length === 0;
  const lastMessage = agent.messages.at(-1);
  const isPendingAssistantShell =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.length === 0;
  const showPendingThinking =
    isBusy &&
    (lastMessage?.role !== "assistant" || isPendingAssistantShell);
  const turnFailure =
    isBusy || isResuming ? undefined : getLatestTurnFailure(agent.view, t(MODEL_UNAVAILABLE));
  const errorMessage = cancellationError ?? agent.error?.message ?? turnFailure;
  const hasConversationContent = sessionless || !isEmpty || errorMessage !== undefined;
  const showConversationLayout = isResuming || hasConversationContent;
  const canSubmit = value.trim().length > 0 || attachments.length > 0;
  const promptStatus =
    isResuming || isPreparing
      ? "submitted"
      : isBusy && !canSubmit
        ? lastMessage?.role === "assistant"
          ? "streaming"
          : "submitted"
        : "ready";

  useEffect(() => {
    if (!agent.messages.some((message) => message.metadata?.optimistic)) {
      setOptimisticFiles([]);
    }
  }, [agent.messages]);

  const requestCancellation = () => {
    setCancellationError(undefined);
    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error, t(CANCEL_FAILED)));
    });
  };

  const handleFilesSelected = async (files: File[]) => {
    setCancellationError(undefined);
    const remaining = MAX_ATTACHMENT_FILES - attachments.length;
    if (remaining <= 0) {
      setCancellationError(t`You can attach up to ${MAX_ATTACHMENT_FILES} photos.`);
      return;
    }
    const selected = files.slice(0, remaining);
    if (selected.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      setCancellationError(t`Each photo must be 10 MB or smaller.`);
      return;
    }
    setIsPreparing(true);
    try {
      const prepared = await prepareImageFiles(selected);
      const next = await Promise.all(
        prepared.map((file) => fileToPendingAttachment(file, t(PHOTO_READ_ERROR))),
      );
      setAttachments((current) => [...current, ...next]);
    } catch (error: unknown) {
      setCancellationError(toErrorMessage(error, t(CANCEL_FAILED)));
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSubmit = async () => {
    const text = value.trim();
    if ((text.length === 0 && attachments.length === 0) || isResuming || isPreparing) {
      return;
    }

    setValue("");
    setCancellationError(undefined);
    const files = attachments.map((file) => ({
      filename: file.filename,
      mediaType: file.mediaType,
      type: "file" as const,
      url: file.url,
    }));
    setOptimisticFiles(files);
    setAttachments([]);
    const options = isBusy ? { turnPolicy: "steer" as const } : undefined;

    if (files.length === 0) {
      await agent.send(text, options);
      return;
    }

    const parts: ({ text: string; type: "text" } | { data: string; filename: string; mediaType: string; type: "file" })[] = [];
    if (text.length > 0) {
      parts.push({ text, type: "text" });
    }
    for (const file of files) {
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
      status={promptStatus}
      value={value}
      variant="secondary"
      onStop={requestCancellation}
      onSubmit={() => {
        void handleSubmit();
      }}
      onValueChange={setValue}
    >
      <ChatAttachmentInput
        accept={IMAGE_ACCEPT}
        disabled={isResuming || isPreparing}
        multiple
        onFilesSelected={(files) => {
          void handleFilesSelected(files);
        }}
      >
        <ChatAttachmentInput.Dropzone
          render={(dropzoneProps) => (
            <PromptInput.Shell {...dropzoneProps}>
              <PromptInput.Content>
                {attachments.length > 0 ? (
                  <PromptInput.Attachments>
                    <ChatAttachmentGroup>
                      {attachments.map((file) => (
                        <ChatAttachment
                          key={file.id}
                          mediaType="image"
                          mimeType={file.mediaType}
                          name={file.filename}
                          src={file.url}
                        >
                          <ChatAttachment.Preview />
                          <ChatAttachment.Remove
                            aria-label={t`Remove ${file.filename}`}
                            onPress={() =>
                              setAttachments((current) =>
                                current.filter((item) => item.id !== file.id),
                              )
                            }
                          />
                        </ChatAttachment>
                      ))}
                    </ChatAttachmentGroup>
                  </PromptInput.Attachments>
                ) : null}
                <PromptInput.TextArea
                  disabled={isResuming}
                  placeholder={t`Ask about a meal or attach a photo…`}
                />
              </PromptInput.Content>
              <PromptInput.Toolbar>
                <PromptInput.ToolbarStart>
                  <ChatAttachmentInput.Trigger
                    render={(triggerProps) => (
                      <PromptInput.Action
                        {...triggerProps}
                        aria-label={t`Add photo`}
                        isDisabled={isResuming || isPreparing}
                        tooltip={t`Add photo`}
                        variant="ghost"
                      >
                        <Paperclip className="size-4" />
                      </PromptInput.Action>
                    )}
                  />
                </PromptInput.ToolbarStart>
                <PromptInput.ToolbarEnd>
                  <PromptInput.Send aria-label={isBusy && !canSubmit ? t`Stop` : t`Send`}>
                    {isBusy && !canSubmit ? (
                      <Square className="size-3 fill-current" />
                    ) : (
                      <ArrowUp className="size-4" />
                    )}
                  </PromptInput.Send>
                </PromptInput.ToolbarEnd>
              </PromptInput.Toolbar>
            </PromptInput.Shell>
          )}
        />
      </ChatAttachmentInput>
    </PromptInput>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {showConversationLayout ? (
        <>
          <ChatConversation className="min-h-0 flex-1">
            <ChatConversation.Content
              className={
                compact
                  ? "min-h-0 w-full flex-col gap-6 px-3 pt-4 pb-6"
                  : "mx-auto w-full max-w-3xl flex-col gap-8 px-4 pt-6 pb-8 sm:px-6"
              }
            >
              {agent.messages.map((message, index) =>
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
                      isBusy && index === agent.messages.length - 1
                    }
                    key={message.id}
                    message={message}
                    onInputResponses={(inputResponses) => {
                      setCancellationError(undefined);
                      return agent.respond(inputResponses).then(
                        () => undefined,
                        (error: unknown) => setCancellationError(toErrorMessage(error, t(MODEL_UNAVAILABLE))),
                      );
                    }}
                  />
                ),
              )}
              {showPendingThinking ? <PendingThinking /> : null}
              {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
            </ChatConversation.Content>
            <ChatConversation.ScrollButton
              aria-label={t`Scroll to bottom`}
              tooltip={t`Scroll to bottom`}
            />
          </ChatConversation>
          <div
            className={
              compact
                ? "w-full shrink-0 px-3 pt-2 pb-3"
                : "mx-auto w-full max-w-3xl shrink-0 px-4 pt-3 pb-4 sm:px-6"
            }
          >
            {composer}
          </div>
        </>
      ) : (
        <div
          className={
            compact
              ? "flex min-h-0 flex-1 flex-col items-center justify-end gap-6 px-3 pb-3"
              : "flex min-h-0 flex-1 flex-col items-center justify-end gap-8 px-4 pb-4"
          }
        >
          <div className="w-full max-w-xl">{composer}</div>
        </div>
      )}
    </div>
  );
}

function ErrorMessage({ message }: { readonly message: string }) {
  return (
    <ChatMessage.Assistant>
      <ChatMessage.Body>
        <Alert status="danger">
          <Alert.Indicator>
            <CircleExclamation />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              <Trans>Request failed</Trans>
            </Alert.Title>
            <Alert.Description>{message}</Alert.Description>
          </Alert.Content>
        </Alert>
      </ChatMessage.Body>
    </ChatMessage.Assistant>
  );
}

function PendingThinking() {
  const { t } = useLingui();
  const thinking = t`Thinking`;
  return (
    <ChatMessage.Assistant>
      <ChatMessage.Body>
        <TextShimmer>{thinking}</TextShimmer>
        <ChatLoader.Dots label={thinking} />
      </ChatMessage.Body>
    </ChatMessage.Assistant>
  );
}

async function fileToPendingAttachment(file: File, readError: string): Promise<PendingAttachment> {
  return {
    filename: file.name,
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    mediaType: file.type || "image/jpeg",
    url: await fileToDataUrl(file, readError),
  };
}

function fileToDataUrl(file: File, readError: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(readError));
    };
    reader.onerror = () => {
      reject(new Error(readError));
    };
    reader.readAsDataURL(file);
  });
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getLatestTurnFailure(
  view: ReturnType<typeof useEveAgent>["view"],
  modelUnavailable: string,
): string | undefined {
  const latest = turns(view).at(-1);
  const error = latest?.status === "settled" ? failure(view, latest.turnId) : undefined;
  return error?.code === "MODEL_CALL_FAILED" ? modelUnavailable : error?.message;
}
