"use client";

import { useCatalogSearch } from "@/app/_components/catalog-search";
import { cn } from "@/lib/utils";
import { Magnifier, Xmark } from "@gravity-ui/icons";
import { Button, SearchField, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";

const SEARCH_SURFACE =
  "border-border/70 bg-surface/95 shadow-overlay rounded-full border backdrop-blur-xl";

export function CatalogSearchField({ className }: { readonly className?: string }) {
  const { t } = useLingui();
  const search = useCatalogSearch();

  return (
    <SearchField
      aria-label={t`Search`}
      className={cn("w-full", className)}
      fullWidth
      name="catalog-search"
      value={search.query}
      variant="secondary"
      onChange={search.setQuery}
    >
      <SearchField.Group className={cn(SEARCH_SURFACE, "h-14 w-full pe-3")}>
        <SearchField.SearchIcon />
        <SearchField.Input
          autoFocus
          className="min-w-0"
          placeholder={t`Search…`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              search.closeSearch();
            }
          }}
        />
        <Tooltip delay={0}>
          <Button
            aria-label={t`Close search`}
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={search.closeSearch}
          >
            <Xmark className="size-5" />
          </Button>
          <Tooltip.Content>
            <Trans>Close search</Trans>
          </Tooltip.Content>
        </Tooltip>
      </SearchField.Group>
    </SearchField>
  );
}

export function CatalogSearchToggle() {
  const { t } = useLingui();
  const search = useCatalogSearch();

  return (
    <Tooltip delay={0}>
      <Button
        aria-label={t`Search`}
        className={cn(SEARCH_SURFACE, "size-14")}
        isIconOnly
        variant="secondary"
        onPress={search.openSearch}
      >
        <Magnifier className="size-5" />
      </Button>
      <Tooltip.Content>
        <Trans>Search</Trans>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function CatalogSearchDock() {
  const search = useCatalogSearch();

  if (search.open) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3">
        <CatalogSearchField className="pointer-events-auto" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-20">
      <div className="pointer-events-auto">
        <CatalogSearchToggle />
      </div>
    </div>
  );
}
