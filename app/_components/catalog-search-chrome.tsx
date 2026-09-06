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
      <SearchField.Group className={cn(SEARCH_SURFACE, "h-14 w-full")}>
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
      </SearchField.Group>
    </SearchField>
  );
}

export function CatalogSearchToggle() {
  const { t } = useLingui();
  const search = useCatalogSearch();
  const open = search.open;

  return (
    <Tooltip delay={0}>
      <Button
        aria-label={open ? t`Close search` : t`Search`}
        className={cn(SEARCH_SURFACE, "size-14")}
        isIconOnly
        variant="secondary"
        onPress={() => {
          if (open) {
            search.closeSearch();
          } else {
            search.openSearch();
          }
        }}
      >
        {open ? <Xmark className="size-5" /> : <Magnifier className="size-5" />}
      </Button>
      <Tooltip.Content>
        {open ? <Trans>Close search</Trans> : <Trans>Search</Trans>}
      </Tooltip.Content>
    </Tooltip>
  );
}

export function CatalogSearchDock() {
  const search = useCatalogSearch();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end px-3 pb-3 pe-[4.5rem]">
      {search.open ? <CatalogSearchField className="pointer-events-auto" /> : null}
      <div className="pointer-events-auto absolute right-3 bottom-3">
        <CatalogSearchToggle />
      </div>
    </div>
  );
}
