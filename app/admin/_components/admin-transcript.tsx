"use client";

import { AdminJsonViewer } from "@/app/admin/_components/admin-json-viewer";
import { conversationTextWithoutMediaStubs } from "@/lib/conversation-query";
import { ackLlmOutput, type AgentTurnMessage, type AgentTurnUserPart } from "@/lib/agent-turn-model";
import { formatTokenCount, formatUsd } from "@/lib/admin-format";
import { isImageMediaType } from "@/lib/image-bytes";
import { Chip, Modal } from "@heroui/react";
import { useState } from "react";

export function AdminTranscript({ messages }: { readonly messages: readonly AgentTurnMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-muted text-sm">No transcript captured for this turn.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {messages.map((message, index) => (
        <article
          className="border-divider bg-surface rounded-xl border p-3"
          key={`${message.type}-${message.at}-${String(index)}`}
        >
          <p className="text-muted mb-1 text-xs font-medium tracking-wide uppercase">
            {message.type}
          </p>
          {message.type === "user" ? <AdminUserMessage message={message} /> : null}
          {message.type === "ack" ? (
            <div className="flex flex-col gap-2">
              {typeof ackLlmOutput(message) === "string" ? (
                <p className="whitespace-pre-wrap text-sm">{message.text}</p>
              ) : (
                <AdminJsonViewer label="Output" value={ackLlmOutput(message)} />
              )}
              <p className="text-muted text-xs">
                {message.model} · {formatUsd(message.costUsd)} · {formatTokenCount(message.inputTokens)} in ·{" "}
                {formatTokenCount(message.outputTokens)} out
              </p>
            </div>
          ) : null}
          {message.type === "assistant" ? (
            <p className="whitespace-pre-wrap text-sm">{message.text}</p>
          ) : null}
          {message.type === "tool" ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{message.toolName}</p>
                {message.isError ? (
                  <Chip color="danger" size="sm" variant="soft">
                    Error
                  </Chip>
                ) : null}
              </div>
              {message.input !== undefined ? <AdminJsonViewer label="Input" value={message.input} /> : null}
              {message.output !== undefined ? (
                <AdminJsonViewer
                  label="Output"
                  tone={message.isError ? "danger" : "neutral"}
                  value={message.output}
                />
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function AdminUserMessage({
  message,
}: {
  readonly message: Extract<AgentTurnMessage, { type: "user" }>;
}) {
  const text = conversationTextWithoutMediaStubs(message.text);
  const files = (message.parts ?? []).filter((part) => part.type === "file" || part.type === "image");
  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 ? <AdminUserAttachments parts={files} /> : null}
      {text.length > 0 ? <p className="whitespace-pre-wrap text-sm">{text}</p> : null}
    </div>
  );
}

function AdminUserAttachments({ parts }: { readonly parts: readonly AgentTurnUserPart[] }) {
  const [preview, setPreview] = useState<AgentTurnUserPart | undefined>();
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        {parts.map((part, index) => (
          <AdminAttachmentPreview
            key={`${part.url ?? part.filename ?? part.mediaType}:${String(index)}`}
            part={part}
            onOpen={() => {
              if (part.url && isImageMediaType(part.mediaType)) {
                setPreview(part);
              }
            }}
          />
        ))}
      </div>
      <Modal.Backdrop
        isOpen={preview !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(undefined);
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog
            aria-label={preview?.filename ?? "Attachment"}
            className="w-fit! overflow-hidden p-0!"
          >
            <Modal.CloseTrigger className="bg-overlay/80 z-10 text-foreground backdrop-blur-md" />
            {preview?.url ? (
              <img
                alt={preview.filename ?? "Attachment"}
                className="block h-auto max-h-[min(85dvh,calc(100dvh-5rem))] w-auto max-w-[min(calc(100vw-2rem),72rem)]"
                src={preview.url}
              />
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}

function AdminAttachmentPreview({
  onOpen,
  part,
}: {
  readonly onOpen: () => void;
  readonly part: AgentTurnUserPart;
}) {
  const label = part.filename ?? part.mediaType ?? "file";
  if (part.url && isImageMediaType(part.mediaType)) {
    return (
      <button
        className="cursor-[var(--cursor-interactive)] h-24 overflow-hidden rounded-lg text-left"
        type="button"
        onClick={onOpen}
      >
        <img alt={label} className="h-full w-auto" src={part.url} />
      </button>
    );
  }
  if (part.url && part.mediaType?.startsWith("audio/")) {
    return <audio className="max-w-full" controls src={part.url} />;
  }
  if (part.url && part.mediaType?.startsWith("video/")) {
    return <video className="max-h-48 max-w-full rounded-lg" controls src={part.url} />;
  }
  if (part.url) {
    return (
      <a className="text-sm underline-offset-2 hover:underline" href={part.url}>
        {label}
      </a>
    );
  }
  return <p className="text-muted text-sm">{label}</p>;
}