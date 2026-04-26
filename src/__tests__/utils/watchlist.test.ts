import {
  addWatchlistItem,
  loadWatchlist,
  removeWatchlistItem,
} from "../../utils/watchlist";
import type { WatchlistItem } from "../../types";

const storageKey = "gitpulse.watchlist.items";

function item(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: "item-1",
    type: "file",
    label: "Hot file",
    target: "src/app.ts",
    repoId: "repo1",
    workspaceId: "workspace1",
    createdAt: "2026-04-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("watchlist storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads an empty list when storage is missing or invalid", () => {
    expect(loadWatchlist()).toEqual([]);

    window.localStorage.setItem(storageKey, "not-json");

    expect(loadWatchlist()).toEqual([]);
  });

  it("adds items and persists them in localStorage", () => {
    const saved = addWatchlistItem(item());

    expect(saved).toHaveLength(1);
    expect(loadWatchlist()).toEqual(saved);
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")).toEqual(saved);
  });

  it("deduplicates by type, target, repo and workspace", () => {
    addWatchlistItem(item({ id: "item-1", label: "First" }));
    const saved = addWatchlistItem(item({ id: "item-2", label: "Second" }));

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: "item-1",
      label: "Second",
      target: "src/app.ts",
    });
  });

  it("removes items by id", () => {
    addWatchlistItem(item({ id: "item-1" }));
    addWatchlistItem(item({ id: "item-2", target: "src/other.ts" }));

    const saved = removeWatchlistItem("item-1");

    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("item-2");
    expect(loadWatchlist()).toEqual(saved);
  });
});
