import { useCallback, useState } from "react";
import type { WatchlistItem, WatchlistItemType } from "../types";
import {
  addWatchlistItem,
  loadWatchlist,
  removeWatchlistItem,
} from "../utils/watchlist";

interface AddWatchlistItemInput {
  type: WatchlistItemType;
  label: string;
  target: string;
  repoId: string | null;
  workspaceId: string | null;
}

function createId(): string {
  return `watch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(() => loadWatchlist());

  const addItem = useCallback((input: AddWatchlistItemInput) => {
    const item: WatchlistItem = {
      id: createId(),
      type: input.type,
      label: input.label.trim() || input.target,
      target: input.target.trim(),
      repoId: input.repoId,
      workspaceId: input.workspaceId,
      createdAt: new Date().toISOString(),
    };

    if (item.target === "") return;

    setItems(addWatchlistItem(item));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(removeWatchlistItem(id));
  }, []);

  return {
    items,
    addItem,
    removeItem,
  };
}
