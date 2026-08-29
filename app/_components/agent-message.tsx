"use client";

import type { FileUIPart } from "ai";
import type {
  EveAuthorizationPart,
  EveDynamicToolPart,
  EveMessage,
  EveMessageInputRequest,
  EveMessagePart,
} from "eve/react";
import { useState } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { Attachment, AttachmentPreview, Attachments, getAttachmentLabel } from "@/components/ai-elements/attachments";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Question,
  QuestionInput,
  QuestionOption,
  QuestionOptions,
  QuestionPrompt,
  type QuestionResponse,
  QuestionSubmit,
  type QuestionValue,
} from "@/components/ai-elements/question";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import {
  BashToolContent,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

export function AgentMessage({
  canRespond,
  extraFiles,
  isStreaming,
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
  const lastTextIndex = message.parts.reduce((last, part, index) => {
    if (part.type !== "text") {
      return last;
    }
    const text = visibleText(part.text, isOptimistic ? extraFiles : undefined);
    return text === undefined ? last : index;
  }, -1);
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

  return (
    <Message
      data-optimistic={isOptimistic ? "true" : undefined}
      from={message.role}
    >
      {attachments.length > 0 ? (
        <MessageAttachments
          attachments={attachments}
          className={cn(
            "group-data-[optimistic=true]:opacity-70",
            message.role === "user" ? "justify-end" : "ml-0",
          )}
        />
      ) : null}
      {contentParts.length > 0 ? (
        <MessageContent>
          {contentParts.map(({ index, part }) => (
            <AgentMessagePart
              canRespond={canRespond}
              key={partKey(part, index)}
              onInputResponses={onInputResponses}
              part={part}
              showCaret={isStreaming && message.role === "assistant" && index === lastTextIndex}
            />
          ))}
        </MessageContent>
      ) : null}
    </Message>
  );
}

function MessageAttachments({
  attachments,
  className,
}: {
  readonly attachments: readonly (FileUIPart & { id: string })[];
  readonly className?: string;
}) {
  const [preview, setPreview] = useState<(FileUIPart & { id: string }) | undefined>();
  const previewLabel = preview === undefined ? "Attachment" : getAttachmentLabel(preview);

  return (
    <>
      <Attachments className={className} variant="grid">
        {attachments.map((file) => (
          <Attachment
            aria-label={`Preview ${getAttachmentLabel(file)}`}
            className="cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data={file}
            key={file.id}
            onClick={() => {
              if (file.url) {
                setPreview(file);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (file.url) {
                  setPreview(file);
                }
              }
            }}
            role="button"
            tabIndex={0}
          >
            <AttachmentPreview />
          </Attachment>
        ))}
      </Attachments>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPreview(undefined);
          }
        }}
        open={preview !== undefined}
      >
        <DialogContent
          className="max-h-[90vh] w-auto max-w-[min(96vw,72rem)] border-none bg-transparent p-0 shadow-none sm:max-w-[min(96vw,72rem)]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{previewLabel}</DialogTitle>
          <DialogDescription className="sr-only">Full size attachment preview</DialogDescription>
          <DialogClose className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
          {preview?.url ? (
            <img
              alt={previewLabel}
              className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
              src={preview.url}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AgentMessagePart({
  canRespond,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <MessageResponse caret="block" isAnimating={showCaret}>
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return (
        <Reasoning defaultOpen isStreaming={part.state === "streaming"}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
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
        <Tool
          defaultOpen={part.state === "approval-requested" || part.state === "approval-responded"}
        >
          <ToolHeader
            state={part.state}
            title={part.toolName}
            toolName={part.toolName}
            type="dynamic-tool"
          />
          <ToolContent>
            {part.toolName === "bash" ? (
              <BashToolContent errorText={part.errorText} input={part.input} output={part.output} />
            ) : (
              <ToolInput input={part.input} />
            )}
            <InputRequestActions
              canRespond={canRespond}
              part={part}
              onInputResponses={onInputResponses}
            />
            {part.toolName === "bash" ? null : (
              <ToolOutput errorText={part.errorText} output={part.output} />
            )}
          </ToolContent>
        </Tool>
      );
    }
  }
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
  const hasOptions = (inputRequest.options?.length ?? 0) > 0;
  const acceptsFreeform = inputRequest.allowFreeform === true || !hasOptions;
  const [questionValue, setQuestionValue] = useState<QuestionValue>({
    selectedValues: inputResponse?.optionId ? [inputResponse.optionId] : [],
    text: inputResponse?.text ?? "",
  });

  const submitOption = (optionId: string) => {
    setQuestionValue((value) => ({ ...value, selectedValues: [optionId] }));
    return onInputResponses([
      {
        optionId,
        requestId: inputRequest.requestId,
      },
    ]);
  };

  const submitResponse = ({ selectedValues, text }: QuestionResponse) =>
    onInputResponses([
      {
        optionId: selectedValues[0],
        requestId: inputRequest.requestId,
        text,
      },
    ]);

  return (
    <Question
      disabled={!canRespond || inputResponse !== undefined}
      onSubmit={submitResponse}
      onValueChange={setQuestionValue}
      value={questionValue}
    >
      <QuestionPrompt>{inputRequest.prompt}</QuestionPrompt>
      {hasOptions ? (
        <QuestionOptions className="flex-col items-stretch" aria-label={inputRequest.prompt}>
          {inputRequest.options?.map((option, index) => (
            <QuestionOption
              className="justify-start px-3 py-2 text-left"
              key={option.id}
              onClick={() => void submitOption(option.id)}
              value={option.id}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-foreground text-sm leading-tight">{option.label}</span>
                {option.description ? (
                  <span className="block text-sm text-muted-foreground leading-tight">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {inputResponse === undefined ? (
                <span aria-hidden="true" className="relative size-6 shrink-0">
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/8 text-xs text-muted-foreground transition-opacity group-hover/option:opacity-0 group-focus-visible/option:opacity-0">
                    {index + 1}
                  </span>
                  <ArrowRightIcon className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground opacity-0 transition-[color,opacity] group-hover/option:text-foreground group-hover/option:opacity-100 group-focus-visible/option:opacity-100" />
                </span>
              ) : (
                <CheckIcon className="size-4 shrink-0 opacity-0 transition-opacity group-data-[state=checked]/option:opacity-100" />
              )}
            </QuestionOption>
          ))}
        </QuestionOptions>
      ) : null}
      {acceptsFreeform ? (
        <div className="relative">
          <QuestionInput
            aria-label="Answer"
            className={inputResponse === undefined ? "pr-12 pb-12" : undefined}
            placeholder="Type your answer…"
          />
          {inputResponse === undefined && questionValue.text.trim().length > 0 ? (
            <QuestionSubmit
              aria-label="Answer"
              className="absolute right-2 bottom-2"
              size="icon-sm"
            >
              <ArrowRightIcon />
            </QuestionSubmit>
          ) : null}
        </div>
      ) : null}
    </Question>
  );
}

function AuthorizationPrompt({ part }: { readonly part: EveAuthorizationPart }) {
  const isAuthorized = part.state === "completed" && part.outcome === "authorized";
  const isCompleted = part.state === "completed";
  const Icon = isAuthorized ? CheckCircleIcon : isCompleted ? XCircleIcon : KeyRoundIcon;
  const instructions = part.authorization?.instructions;
  const shouldShowInstructions = instructions !== undefined && instructions !== part.description;

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border p-3",
        isAuthorized
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isCompleted
            ? "border-destructive/30 bg-destructive/5"
            : "border-blue-500/30 bg-blue-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            isAuthorized
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : isCompleted
                ? "bg-destructive/10 text-destructive"
                : "bg-blue-500/10 text-blue-700 dark:text-blue-300",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-sm">{authorizationTitle(part)}</p>
          <p className="text-muted-foreground text-sm">{authorizationDescription(part)}</p>
          {shouldShowInstructions ? (
            <p className="text-muted-foreground text-sm">{instructions}</p>
          ) : null}
          {part.state === "required" && part.authorization?.userCode ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Code</span>
              <code className="rounded-md bg-background px-2 py-1 font-mono">
                {part.authorization.userCode}
              </code>
            </div>
          ) : null}
          {part.state === "required" && part.authorization?.url ? (
            <Button asChild size="sm">
              <a href={part.authorization.url} rel="noreferrer" target="_blank">
                <ExternalLinkIcon className="size-4" />
                Sign in with {part.displayName}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
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
    <div className="space-y-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
      <p className="text-muted-foreground text-sm">{inputRequest.prompt}</p>
      {inputResponse ? (
        <p className="font-medium text-sm">
          Responded: {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options?.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  {
                    optionId: option.id,
                    requestId: inputRequest.requestId,
                  },
                ]);
              }}
              size="sm"
              type="button"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
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
