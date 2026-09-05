"use client";

import type { FileUIPart } from "ai";
import {
  ArrowRight,
  ArrowUpRightFromSquare,
  CircleCheck,
  CircleExclamation,
  Key,
} from "@gravity-ui/icons";
import { Alert, Button, Input, Label, Link, Modal, TextField } from "@heroui/react";
import {
  ChainOfThought,
  ChatAttachment,
  ChatAttachmentGroup,
  ChatMessage,
} from "@heroui-pro/react";
import { Markdown } from "@heroui-pro/react/markdown";
import { ChatTool } from "@heroui-pro/react/chat-tool";
import type { ToolPartState } from "@heroui-pro/react/chat-tool";
import type {
  EveAuthorizationPart,
  EveDynamicToolPart,
  EveMessage,
  EveMessageInputRequest,
  EveMessagePart,
} from "eve/react";
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { FoodThumb } from "@/app/_components/food-thumb";
import { productImagePreviews } from "@/lib/product-image-preview";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

export function AgentMessage({
  canRespond,
  extraFiles,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly extraFiles?: readonly FileUIPart[];
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const isOptimistic = message.metadata?.optimistic === true;
  const attachments = messageAttachments(message, isOptimistic ? extraFiles : undefined);
  const hasAssistantText =
    message.role === "assistant" &&
    message.parts.some((part) => part.type === "text" && part.text.length > 0);
  const contentParts: { index: number; part: EveMessagePart }[] = [];
  for (const [index, part] of message.parts.entries()) {
    if (part.type === "file" || part.type === "step-start") {
      continue;
    }
    if (hasAssistantText && part.type === "reasoning") {
      continue;
    }
    if (part.type === "text") {
      const text = visibleText(part.text, isOptimistic ? extraFiles : undefined);
      if (text === undefined) {
        continue;
      }
      contentParts.push({ index, part: { ...part, text } });
      continue;
    }
    contentParts.push({ index, part });
  }

  const body = (
    <>
      {attachments.length > 0 ? (
        <MessageAttachments attachments={attachments} />
      ) : null}
      {contentParts.map(({ index, part }) => (
        <AgentMessagePart
          canRespond={canRespond}
          key={partKey(part, index)}
          onInputResponses={onInputResponses}
          part={part}
        />
      ))}
    </>
  );

  if (message.role === "user") {
    return (
      <ChatMessage.User data-optimistic={isOptimistic ? "true" : undefined}>
        {attachments.length > 0 ? (
          <div className="mb-2 flex justify-end">
            <MessageAttachments attachments={attachments} />
          </div>
        ) : null}
        {contentParts.length > 0 ? (
          <ChatMessage.Bubble>
            <ChatMessage.Content>
              {contentParts.map(({ index, part }) => (
                <AgentMessagePart
                  canRespond={canRespond}
                  key={partKey(part, index)}
                  onInputResponses={onInputResponses}
                  part={part}
                />
              ))}
            </ChatMessage.Content>
          </ChatMessage.Bubble>
        ) : null}
      </ChatMessage.User>
    );
  }

  return (
    <ChatMessage.Assistant data-optimistic={isOptimistic ? "true" : undefined}>
      <ChatMessage.Body>{body}</ChatMessage.Body>
    </ChatMessage.Assistant>
  );
}

function MessageAttachments({
  attachments,
}: {
  readonly attachments: readonly (FileUIPart & { id: string })[];
}) {
  const { t } = useLingui();
  const [preview, setPreview] = useState<(FileUIPart & { id: string }) | undefined>();
  const previewLabel = preview === undefined ? t`Attachment` : (preview.filename ?? t`Attachment`);

  return (
    <>
      <ChatAttachmentGroup>
        {attachments.map((file) => (
          <button
            className="cursor-[var(--cursor-interactive)] text-left"
            key={file.id}
            type="button"
            onClick={() => {
              if (file.url) {
                setPreview(file);
              }
            }}
          >
            <ChatAttachment
              mediaType="image"
              mimeType={file.mediaType}
              name={file.filename ?? t`Photo`}
              src={file.url}
            >
              <ChatAttachment.Preview />
            </ChatAttachment>
          </button>
        ))}
      </ChatAttachmentGroup>
      <Modal.Backdrop
        isOpen={preview !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(undefined);
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="max-w-[min(96vw,72rem)]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{previewLabel}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {preview?.url ? (
                <img
                  alt={previewLabel}
                  className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain"
                  src={preview.url}
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}

function AgentMessagePart({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
}) {
  const { t } = useLingui();
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return <Markdown>{part.text}</Markdown>;
    case "reasoning":
      return (
        <ChainOfThought defaultExpanded isStreaming={part.state === "streaming"}>
          <ChainOfThought.Trigger>
            <Trans>Thinking</Trans>
          </ChainOfThought.Trigger>
          <ChainOfThought.Content>
            <ChainOfThought.Steps>
              <ChainOfThought.Step label={t`Reasoning`}>{part.text}</ChainOfThought.Step>
            </ChainOfThought.Steps>
          </ChainOfThought.Content>
        </ChainOfThought>
      );
    case "file":
      return null;
    case "authorization":
      return <AuthorizationPrompt part={part} />;
    case "dynamic-tool": {
      const inputRequest = part.toolMetadata?.eve?.inputRequest;
      if (inputRequest?.kind === "question") {
        return (
          <QuestionRequest
            canRespond={canRespond}
            inputRequest={inputRequest}
            inputResponse={part.toolMetadata?.eve?.inputResponse}
            onInputResponses={onInputResponses}
          />
        );
      }

      return (
        <>
          <ProductToolPreview output={part.output} />
          <ChatTool
            argsText={stringifyUnknown(part.input)}
            defaultExpanded={
              part.state === "approval-requested" || part.state === "approval-responded"
            }
            errorText={part.errorText}
            output={part.output}
            state={toChatToolState(part.state)}
            toolName={part.toolName}
            triggerPrefix={t`Used tool: `}
          />
          <InputRequestActions
            canRespond={canRespond}
            onInputResponses={onInputResponses}
            part={part}
          />
        </>
      );
    }
  }
}

function ProductToolPreview({ output }: { readonly output: unknown }) {
  const previews = productImagePreviews(output);
  if (previews.length === 0) {
    return null;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {previews.map((preview) => (
        <li className="flex items-center gap-3" key={preview.imageUrl}>
          <FoodThumb alt={preview.name} src={preview.imageUrl} />
          <span className="text-foreground min-w-0 truncate text-sm">{preview.name}</span>
        </li>
      ))}
    </ul>
  );
}

function QuestionRequest({
  canRespond,
  inputRequest,
  inputResponse,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly inputRequest: EveMessageInputRequest;
  readonly inputResponse?: AgentInputResponse;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const { t } = useLingui();
  const hasOptions = (inputRequest.options?.length ?? 0) > 0;
  const acceptsFreeform = inputRequest.allowFreeform === true || !hasOptions;
  const [text, setText] = useState(inputResponse?.text ?? "");
  const disabled = !canRespond || inputResponse !== undefined;

  const submitOption = (optionId: string) =>
    onInputResponses([
      {
        optionId,
        requestId: inputRequest.requestId,
      },
    ]);

  const submitText = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    return onInputResponses([
      {
        requestId: inputRequest.requestId,
        text: trimmed,
      },
    ]);
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <p className="text-foreground text-sm font-medium">{inputRequest.prompt}</p>
      {hasOptions ? (
        <div className="flex flex-col gap-2">
          {inputRequest.options?.map((option) => (
            <Button
              key={option.id}
              className="h-auto justify-start py-2 text-left"
              isDisabled={disabled}
              variant={inputResponse?.optionId === option.id ? "primary" : "outline"}
              onPress={() => {
                void submitOption(option.id);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-tight">{option.label}</span>
                {option.description ? (
                  <span className="text-muted block text-sm leading-tight">{option.description}</span>
                ) : null}
              </span>
              {inputResponse === undefined ? <ArrowRight className="size-4 shrink-0" /> : null}
            </Button>
          ))}
        </div>
      ) : null}
      {acceptsFreeform ? (
        <div className="flex gap-2">
          <TextField
            className="min-w-0 flex-1"
            isDisabled={disabled}
            name="answer"
            value={text}
            onChange={setText}
          >
            <Label className="sr-only">
              <Trans>Answer</Trans>
            </Label>
            <Input placeholder={t`Type your answer…`} />
          </TextField>
          {inputResponse === undefined && text.trim().length > 0 ? (
            <Button
              isIconOnly
              aria-label={t`Answer`}
              isDisabled={disabled}
              onPress={() => {
                void submitText();
              }}
            >
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AuthorizationPrompt({ part }: { readonly part: EveAuthorizationPart }) {
  const isAuthorized = part.state === "completed" && part.outcome === "authorized";
  const isCompleted = part.state === "completed";
  const status = isAuthorized ? "success" : isCompleted ? "danger" : "accent";
  const Icon = isAuthorized ? CircleCheck : isCompleted ? CircleExclamation : Key;
  const instructions = part.authorization?.instructions;
  const shouldShowInstructions = instructions !== undefined && instructions !== part.description;

  return (
    <Alert status={status}>
      <Alert.Indicator>
        <Icon />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{authorizationTitle(part)}</Alert.Title>
        <Alert.Description>
          {authorizationDescription(part)}
          {shouldShowInstructions ? ` ${instructions}` : ""}
        </Alert.Description>
        {part.state === "required" && part.authorization?.userCode ? (
          <p className="mt-2 text-sm">
            Code{" "}
            <code className="bg-background rounded-md px-2 py-1 font-mono">
              {part.authorization.userCode}
            </code>
          </p>
        ) : null}
        {part.state === "required" && part.authorization?.url ? (
          <Link
            className="mt-2 inline-flex"
            href={part.authorization.url}
            rel="noreferrer"
            target="_blank"
          >
            <ArrowUpRightFromSquare className="size-4" />
            Sign in with {part.displayName}
          </Link>
        ) : null}
      </Alert.Content>
    </Alert>
  );
}

function authorizationTitle(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return `Connect ${part.displayName}`;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} connected`;
  }
  return `${part.displayName} authorization ${formatAuthorizationOutcome(part.outcome)}`;
}

function authorizationDescription(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return part.description;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} connected.`;
  }
  const tail = part.reason !== undefined ? ` (${part.reason})` : "";
  return `${part.displayName} authorization ${formatAuthorizationOutcome(part.outcome)}${tail}.`;
}

function formatAuthorizationOutcome(outcome: NonNullable<EveAuthorizationPart["outcome"]>): string {
  switch (outcome) {
    case "authorized":
      return "authorized";
    case "declined":
      return "declined";
    case "failed":
      return "failed";
    case "timed-out":
      return "timed out";
  }
}

function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );

  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{inputRequest.prompt}</Alert.Description>
        {inputResponse ? (
          <p className="text-foreground mt-2 text-sm font-medium">
            <Trans>
              Responded: {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
            </Trans>
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {inputRequest.options?.map((option) => (
              <Button
                key={option.id}
                isDisabled={!canRespond}
                size="sm"
                variant={option.style === "danger" ? "danger-soft" : "secondary"}
                onPress={() => {
                  void onInputResponses([
                    {
                      optionId: option.id,
                      requestId: inputRequest.requestId,
                    },
                  ]);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </Alert.Content>
    </Alert>
  );
}

function toChatToolState(state: EveDynamicToolPart["state"]): ToolPartState {
  switch (state) {
    case "input-streaming":
      return "input-streaming";
    case "input-available":
      return "input-available";
    case "output-available":
      return "output-available";
    case "output-error":
      return "output-error";
    case "approval-requested":
      return "requires-action";
    default:
      return "input-available";
  }
}

function stringifyUnknown(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "authorization":
      return `authorization:${part.turnId}:${part.stepIndex}:${part.name}`;
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}

function messageAttachments(
  message: EveMessage,
  extraFiles: readonly FileUIPart[] | undefined,
): readonly (FileUIPart & { id: string })[] {
  const fromParts = message.parts.flatMap((part, index) => {
    if (part.type !== "file") {
      return [];
    }
    return [
      {
        filename: part.filename,
        id: `file:${index}:${part.filename ?? part.mediaType}`,
        mediaType: part.mediaType,
        type: "file" as const,
        url: part.url ?? "",
      },
    ];
  });
  if (fromParts.length > 0) {
    return fromParts;
  }
  return (extraFiles ?? []).map((file, index) => ({
    ...file,
    id: `optimistic:${index}:${file.filename ?? file.mediaType}`,
  }));
}

function visibleText(
  text: string,
  extraFiles: readonly FileUIPart[] | undefined,
): string | undefined {
  const stripped = extraFiles === undefined ? text : stripFilePlaceholders(text, extraFiles);
  const trimmed = stripped.trim();
  return trimmed.length === 0 ? undefined : stripped;
}

function stripFilePlaceholders(text: string, files: readonly FileUIPart[]): string {
  const names = new Set(
    files.flatMap((file) => (file.filename === undefined ? [] : [file.filename])),
  );
  return text
    .split("\n")
    .filter((line) => {
      const match = /^\[file(?:: (.*))?\]$/.exec(line);
      if (match === null) {
        return true;
      }
      const filename = match[1];
      return filename !== undefined && !names.has(filename);
    })
    .join("\n");
}
