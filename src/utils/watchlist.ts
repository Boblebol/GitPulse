import type { WatchlistItem, WatchlistItemType } from "../types";

const WATCHLIST_KEY = "gitpulse.watchlist.items";

function getStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function isWatchlistType(value: unknown): value is WatchlistItemType {
  return value === "repo" || value === "file" || value === "directory";
}

function isWatchlistItem(value: unknown): value is WatchlistItem {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    isWatchlistType(candidate.type) &&
    typeof candidate.label === "string" &&
    typeof candidate.target === "string" &&
    (candidate.repoId === null || typeof candidate.repoId === "string") &&
    (candidate.workspaceId === null || typeof candidate.workspaceId === "string") &&
    typeof candidate.createdAt === "string"
  );
}

function persist(items: WatchlistItem[], storage?: Storage): WatchlistItem[] {
  getStorage(storage)?.setItem(WATCHLIST_KEY, JSON.stringify(items));
  return items;
}

function sameTrackedTarget(left: WatchlistItem, right: WatchlistItem): boolean {
  return (
    left.type === right.type &&
    left.target === right.target &&
    left.repoId === right.repoId &&
    left.workspaceId === right.workspaceId
  );
}

export function loadWatchlist(storage?: Storage): WatchlistItem[] {
  const raw = getStorage(storage)?.getItem(WATCHLIST_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isWatchlistItem) : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(
  items: WatchlistItem[],
  storage?: Storage,
): WatchlistItem[] {
  return persist(items, storage);
}

export function addWatchlistItem(
  item: WatchlistItem,
  storage?: Storage,
): WatchlistItem[] {
  const current = loadWatchlist(storage);
  const existingIndex = current.findIndex((candidate) =>
    sameTrackedTarget(candidate, item),
  );

  if (existingIndex === -1) {
    return persist([...current, item], storage);
  }

  const next = [...current];
  next[existingIndex] = {
    ...item,
    id: next[existingIndex].id,
    createdAt: next[existingIndex].createdAt,
  };
  return persist(next, storage);
}

export function removeWatchlistItem(
  id: string,
  storage?: Storage,
): WatchlistItem[] {
  return persist(
    loadWatchlist(storage).filter((item) => item.id !== id),
    storage,
  );
}
