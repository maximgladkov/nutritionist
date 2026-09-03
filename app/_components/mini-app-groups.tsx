"use client";

import { PersonFill } from "@gravity-ui/icons";
import { EmptyState } from "@heroui-pro/react";
import { Trans } from "@lingui/react/macro";

export function MiniAppGroups() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-3 py-8">
      <EmptyState className="bg-surface-secondary rounded-2xl">
        <EmptyState.Header>
          <EmptyState.Media variant="icon">
            <PersonFill className="size-5" />
          </EmptyState.Media>
          <EmptyState.Title>
            <Trans>Groups</Trans>
          </EmptyState.Title>
          <EmptyState.Description>
            <Trans>Saved food groups will show up here so you can log them in one tap.</Trans>
          </EmptyState.Description>
        </EmptyState.Header>
      </EmptyState>
    </div>
  );
}
