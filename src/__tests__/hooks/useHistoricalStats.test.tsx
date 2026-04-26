import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  useHallOfFame,
  useHistoricalRecords,
  usePeriodAwards,
  usePeriodLeaderboard,
} from "../../hooks/useHistoricalStats";
import type { AnalysisScope, PeriodSelection } from "../../types";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useHistoricalStats hooks", () => {
  let queryClient: QueryClient;

  const period: PeriodSelection = {
    periodType: "month",
    periodKey: "2026-04",
  };
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

  it("fetches period leaderboard with scope and period params", async () => {
    const rows = [{ rank: 1, developer_id: "dev1", developer_name: "Ada" }];
    (invoke as jest.Mock).mockResolvedValue(rows);

    const { result } = renderHook(() => usePeriodLeaderboard(scope, period), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(rows);
    expect(invoke).toHaveBeenCalledWith("get_period_leaderboard", {
      repoId: "repo1",
      workspaceId: null,
      periodType: "month",
      periodKey: "2026-04",
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["period_leaderboard", "repo1", null, "month", "2026-04"],
      }),
    ).toBeDefined();
  });

  it("fetches period awards for workspace scope", async () => {
    (invoke as jest.Mock).mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        usePeriodAwards(
          { mode: "workspace", repoId: null, workspaceId: "workspace1" },
          { periodType: "season", periodKey: "2026" },
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invoke).toHaveBeenCalledWith("get_period_awards", {
      repoId: null,
      workspaceId: "workspace1",
      periodType: "season",
      periodKey: "2026",
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["period_awards", null, "workspace1", "season", "2026"],
      }),
    ).toBeDefined();
  });

  it("fetches historical records with scope and period params", async () => {
    (invoke as jest.Mock).mockResolvedValue([]);

    const { result } = renderHook(() => useHistoricalRecords(scope, period), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invoke).toHaveBeenCalledWith("get_historical_records", {
      repoId: "repo1",
      workspaceId: null,
      periodType: "month",
      periodKey: "2026-04",
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["historical_records", "repo1", null, "month", "2026-04"],
      }),
    ).toBeDefined();
  });

  it("fetches hall of fame entries with scope params", async () => {
    const rows = [
      {
        category_key: "career_commits",
        title: "All-Time Commit Leader",
        developer_id: "dev1",
        developer_name: "Ada",
        value: 42,
        highlight: "42 commits",
      },
    ];
    (invoke as jest.Mock).mockResolvedValue(rows);

    const { result } = renderHook(() => useHallOfFame(scope), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(rows);
    expect(invoke).toHaveBeenCalledWith("get_hall_of_fame", {
      repoId: "repo1",
      workspaceId: null,
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["hall_of_fame", "repo1", null],
      }),
    ).toBeDefined();
  });

  it("does not fetch period queries when scope is missing", () => {
    const missingScope: AnalysisScope = {
      mode: "repo",
      repoId: null,
      workspaceId: null,
    };

    const { result: leaderboard } = renderHook(
      () => usePeriodLeaderboard(missingScope, period),
      { wrapper },
    );
    const { result: awards } = renderHook(
      () => usePeriodAwards(missingScope, period),
      { wrapper },
    );
    const { result: records } = renderHook(
      () => useHistoricalRecords(missingScope, period),
      { wrapper },
    );
    const { result: hallOfFame } = renderHook(
      () => useHallOfFame(missingScope),
      { wrapper },
    );

    expect(leaderboard.current.isLoading).toBe(false);
    expect(awards.current.isLoading).toBe(false);
    expect(records.current.isLoading).toBe(false);
    expect(hallOfFame.current.isLoading).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
