import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useInsights } from "../../hooks/useInsights";
import type { AnalysisScope } from "../../types";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useInsights", () => {
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

  it("fetches insights with scope and date range params", async () => {
    const rows = [
      {
        insight_key: "top_hotspot",
        category: "hotspot",
        severity: "high",
        title: "Highest activity file",
        summary: "src/app.ts has high churn.",
        entity_label: "src/app.ts",
        metric_value: 88,
        action_label: "Review file health",
        route: "/health",
      },
    ];
    (invoke as jest.Mock).mockResolvedValue(rows);

    const { result } = renderHook(
      () => useInsights(scope, { fromDate: "2026-04-01", toDate: "2026-04-30" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(rows);
    expect(invoke).toHaveBeenCalledWith("get_insights", {
      repoId: "repo1",
      workspaceId: null,
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["insights", "repo1", null, "2026-04-01", "2026-04-30"],
      }),
    ).toBeDefined();
  });

  it("does not fetch without a repo or workspace scope", () => {
    const missingScope: AnalysisScope = {
      mode: "repo",
      repoId: null,
      workspaceId: null,
    };

    const { result } = renderHook(() => useInsights(missingScope), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
