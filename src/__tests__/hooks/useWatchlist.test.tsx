import { act, renderHook } from "@testing-library/react";
import { useWatchlist } from "../../hooks/useWatchlist";

describe("useWatchlist", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads persisted items and can add or remove tracked targets", () => {
    window.localStorage.setItem(
      "gitpulse.watchlist.items",
      JSON.stringify([
        {
          id: "persisted",
          type: "repo",
          label: "Repo",
          target: "repo1",
          repoId: "repo1",
          workspaceId: "workspace1",
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ]),
    );

    const { result } = renderHook(() => useWatchlist());

    expect(result.current.items).toHaveLength(1);

    act(() => {
      result.current.addItem({
        type: "file",
        label: "Hot file",
        target: "src/app.ts",
        repoId: "repo1",
        workspaceId: "workspace1",
      });
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[1]).toMatchObject({
      type: "file",
      label: "Hot file",
      target: "src/app.ts",
    });

    act(() => {
      result.current.removeItem("persisted");
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].target).toBe("src/app.ts");
  });
});
