import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useWeeklyRecap } from "../../hooks/useWeeklyRecap";
import type { AnalysisScope, WeeklyRecap } from "../../types";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useWeeklyRecap", () => {
  let queryClient: QueryClient;

  const scope: AnalysisScope = {
    mode: "repo",
    repoId: "repo1",
    workspaceId: null,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("fetches weekly recap with scope and week start params", async () => {
    const recap: WeeklyRecap = {
      week_start: "2026-04-20",
      week_end: "2026-04-26",
      scope_label: "Repository",
      commits: 12,
      insertions: 420,
      deletions: 110,
      active_days: 5,
      top_developer_name: "Ada",
      top_developer_commits: 6,
      top_file_path: "src/app.ts",
      top_file_commits: 4,
      top_insight_title: "Highest activity file",
      top_insight_severity: "high",
      markdown: "# GitPulse Weekly Recap",
    };
    (invoke as jest.Mock).mockResolvedValue(recap);

    const { result } = renderHook(
      () => useWeeklyRecap(scope, "2026-04-20"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(recap);
    expect(invoke).toHaveBeenCalledWith("get_weekly_recap", {
      repoId: "repo1",
      workspaceId: null,
      weekStart: "2026-04-20",
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["weekly_recap", "repo1", null, "2026-04-20"],
      }),
    ).toBeDefined();
  });

  it("does not fetch without a repo or workspace scope", () => {
    const missingScope: AnalysisScope = {
      mode: "repo",
      repoId: null,
      workspaceId: null,
    };

    const { result } = renderHook(
      () => useWeeklyRecap(missingScope, "2026-04-20"),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
