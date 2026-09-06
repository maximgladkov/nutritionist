"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type CatalogSearch = {
  closeSearch: () => void;
  open: boolean;
  openSearch: () => void;
  query: string;
  setQuery: (query: string) => void;
};

const CatalogSearchContext = createContext<CatalogSearch | null>(null);

const IDLE_SEARCH: CatalogSearch = {
  closeSearch() {},
  open: false,
  openSearch() {},
  query: "",
  setQuery() {},
};

export function CatalogSearchProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const openSearch = useCallback(() => {
    setOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const value = useMemo(
    () => ({ closeSearch, open, openSearch, query, setQuery }),
    [closeSearch, open, openSearch, query],
  );

  return <CatalogSearchContext.Provider value={value}>{children}</CatalogSearchContext.Provider>;
}

export function useCatalogSearch(): CatalogSearch {
  return useContext(CatalogSearchContext) ?? IDLE_SEARCH;
}
