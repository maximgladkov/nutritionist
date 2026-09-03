"use client";

import { PersonFill } from "@gravity-ui/icons";
import { EmptyState } from "@heroui-pro/react";

export function MiniAppGroups() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-3 py-8">
      <EmptyState className="bg-surface-secondary rounded-2xl">
        <EmptyState.Header>
          <EmptyState.Media variant="icon">
            <PersonFill className="size-5" />
          </EmptyState.Media>
          <EmptyState.Title>Groups</EmptyState.Title>
          <EmptyState.Description>
            Saved food groups will show up here so you can log them in one tap.
          </EmptyState.Description>
        </EmptyState.Header>
      </EmptyState>
    </div>
  );
}
