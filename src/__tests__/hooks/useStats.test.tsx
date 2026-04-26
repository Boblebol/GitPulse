import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useDeveloperGlobalStats,
  useFileStats,
  useDirectoryStats,
  useDailyStats,
  useBoxScore,
  useLeaderboard,
  useUpdateFormula,
  useActivityTimeline,
} from "../../hooks/useStats";
import type { ReactNode } from "react";

// Mock tauri API
jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useStats hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  describe("useDeveloperGlobalStats", () => {
    it("fetches developer global stats successfully", async () => {
      const mockStats = [
        { developer_id: "dev1", commits: 100, score: 1000 },
        { developer_id: "dev2", commits: 50, score: 500 },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockStats);

      const { result } = renderHook(() => useDeveloperGlobalStats(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStats);
      expect(invoke).toHaveBeenCalledWith("get_developer_global_stats");
    });

    it("fetches developer stats scoped to a repository", async () => {
      const mockStats = [{ developer_id: "dev1", commits: 10 }];
      (invoke as jest.Mock).mockResolvedValue(mockStats);

      const { result } = renderHook(
        () => useDeveloperGlobalStats({ repoId: "repo1", workspaceId: null }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStats);
      expect(invoke).toHaveBeenCalledWith("get_developer_global_stats", {
        repoId: "repo1",
        workspaceId: null,
        fromDate: null,
        toDate: null,
      });
    });

    it("fetches developer stats scoped to a workspace", async () => {
      const mockStats = [{ developer_id: "dev1", commits: 20 }];
      (invoke as jest.Mock).mockResolvedValue(mockStats);

      const { result } = renderHook(
        () => useDeveloperGlobalStats({ repoId: null, workspaceId: "ws1" }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStats);
      expect(invoke).toHaveBeenCalledWith("get_developer_global_stats", {
        repoId: null,
        workspaceId: "ws1",
        fromDate: null,
        toDate: null,
      });
    });

    it("passes date range params for developer stats", async () => {
      (invoke as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(
        () =>
          useDeveloperGlobalStats(
            { repoId: "repo1", workspaceId: null },
            { fromDate: "2026-04-01", toDate: "2026-04-30" }
          ),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(invoke).toHaveBeenCalledWith("get_developer_global_stats", {
        repoId: "repo1",
        workspaceId: null,
        fromDate: "2026-04-01",
        toDate: "2026-04-30",
      });
    });

    it("handles fetch error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Fetch failed"));

      const { result } = renderHook(() => useDeveloperGlobalStats(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("returns empty array when no developers exist", async () => {
      (invoke as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useDeveloperGlobalStats(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("useFileStats", () => {
    it("fetches file stats for a repo successfully", async () => {
      const mockStats = [
        { file: "main.ts", commits: 50 },
        { file: "utils.ts", commits: 30 },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockStats);

      const { result } = renderHook(() => useFileStats("repo1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStats);
      expect(invoke).toHaveBeenCalledWith("get_file_stats", {
        repoId: "repo1",
        fromDate: null,
        toDate: null,
      });
    });

    it("passes date range params for file stats", async () => {
      (invoke as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(
        () => useFileStats("repo1", { fromDate: "2026-04-01", toDate: "2026-04-30" }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(invoke).toHaveBeenCalledWith("get_file_stats", {
        repoId: "repo1",
        fromDate: "2026-04-01",
        toDate: "2026-04-30",
      });
    });

    it("does not fetch when repoId is null", () => {
      const { result } = renderHook(() => useFileStats(null), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("handles fetch error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Fetch failed"));

      const { result } = renderHook(() => useFileStats("repo1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useDirectoryStats", () => {
    it("fetches directory stats for a repo successfully", async () => {
      const mockStats = [
        { directory: "src", commits: 200 },
        { directory: "tests", commits: 100 },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockStats);

      const { result } = renderHook(() => useDirectoryStats("repo1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStats);
      expect(invoke).toHaveBeenCalledWith("get_directory_stats", {
        repoId: "repo1",
        fromDate: null,
        toDate: null,
      });
    });

    it("passes date range params for directory stats", async () => {
      (invoke as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(
        () =>
          useDirectoryStats("repo1", {
            fromDate: "2026-04-01",
            toDate: "2026-04-30",
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(invoke).toHaveBeenCalledWith("get_directory_stats", {
        repoId: "repo1",
        fromDate: "2026-04-01",
        toDate: "2026-04-30",
      });
    });

    it("does not fetch when repoId is null", () => {
      const { result } = renderHook(() => useDirectoryStats(null), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("handles fetch error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Fetch failed"));

      const { result } = renderHook(() => useDirectoryStats("repo1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useDailyStats", () => {
    it("fetches daily stats with valid parameters", async () => {
      const mockStats = [
        { date: "2026-04-10", commits: 10 },
        { date: "2026-04-09", commits: 5 },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockStats);

      const { result } = renderHook(
        () => useDailyStats("dev1", "repo1", "2026-04-01", "2026-04-10"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStats);
      expect(invoke).toHaveBeenCalledWith("get_daily_stats", {
        developerId: "dev1",
        repoId: "repo1",
        fromDate: "2026-04-01",
        toDate: "2026-04-10",
      });
    });

    it("does not fetch when developerId is null", () => {
      const { result } = renderHook(
        () => useDailyStats(null, "repo1", "2026-04-01", "2026-04-10"),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("does not fetch when repoId is null", () => {
      const { result } = renderHook(
        () => useDailyStats("dev1", null, "2026-04-01", "2026-04-10"),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("handles fetch error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Fetch failed"));

      const { result } = renderHook(
        () => useDailyStats("dev1", "repo1", "2026-04-01", "2026-04-10"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useBoxScore", () => {
    it("fetches box score for developer and repo", async () => {
      const mockScore = { developer_id: "dev1", commits: 5, score: 50 };

      (invoke as jest.Mock).mockResolvedValue(mockScore);

      const { result } = renderHook(
        () => useBoxScore("dev1", "repo1", "2026-04-10"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockScore);
      expect(invoke).toHaveBeenCalledWith("get_box_score", {
        developerId: "dev1",
        repoId: "repo1",
        date: "2026-04-10",
      });
    });

    it("does not fetch when developerId is null", () => {
      const { result } = renderHook(
        () => useBoxScore(null, "repo1", "2026-04-10"),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("does not fetch when repoId is null", () => {
      const { result } = renderHook(
        () => useBoxScore("dev1", null, "2026-04-10"),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("does not fetch when date is empty string", () => {
      const { result } = renderHook(
        () => useBoxScore("dev1", "repo1", ""),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("handles fetch error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Fetch failed"));

      const { result } = renderHook(
        () => useBoxScore("dev1", "repo1", "2026-04-10"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("returns null when no data available", async () => {
      (invoke as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(
        () => useBoxScore("dev1", "repo1", "2026-04-10"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
    });
  });

  describe("useLeaderboard", () => {
    it("fetches leaderboard for repo and date range", async () => {
      const mockLeaderboard = [
        { developer_id: "dev1", score: 1000 },
        { developer_id: "dev2", score: 800 },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockLeaderboard);

      const { result } = renderHook(
        () => useLeaderboard("repo1", "2026-04-01", "2026-04-10"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockLeaderboard);
      expect(invoke).toHaveBeenCalledWith("get_leaderboard", {
        repoId: "repo1",
        fromDate: "2026-04-01",
        toDate: "2026-04-10",
      });
    });

    it("does not fetch when repoId is null", () => {
      const { result } = renderHook(
        () => useLeaderboard(null, "2026-04-01", "2026-04-10"),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("handles fetch error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Fetch failed"));

      const { result } = renderHook(
        () => useLeaderboard("repo1", "2026-04-01", "2026-04-10"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("returns empty array for empty leaderboard", async () => {
      (invoke as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(
        () => useLeaderboard("repo1", "2026-04-01", "2026-04-10"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("useActivityTimeline", () => {
    it("fetches activity timeline for a scoped date range", async () => {
      const mockTimeline = [{ date: "2026-04-01", commits: 3 }];
      (invoke as jest.Mock).mockResolvedValue(mockTimeline);

      const { result } = renderHook(
        () =>
          useActivityTimeline(
            { repoId: "repo1", workspaceId: null },
            { fromDate: "2026-04-01", toDate: "2026-04-30" }
          ),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockTimeline);
      expect(invoke).toHaveBeenCalledWith("get_activity_timeline", {
        repoId: "repo1",
        workspaceId: null,
        fromDate: "2026-04-01",
        toDate: "2026-04-30",
      });
    });

    it("does not fetch timeline without a repo or workspace scope", () => {
      renderHook(
        () =>
          useActivityTimeline(
            { repoId: null, workspaceId: null },
            { fromDate: "2026-04-01", toDate: "2026-04-30" }
          ),
        { wrapper }
      );

      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("useUpdateFormula", () => {
    it("updates the scoring formula successfully", async () => {
      (invoke as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateFormula(), { wrapper });

      await act(async () => {
        result.current.mutate("commits * 10 + insertions * 0.5");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("update_formula", {
        expression: "commits * 10 + insertions * 0.5",
      });
    });

    it("handles formula update error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Invalid formula"));

      const { result } = renderHook(() => useUpdateFormula(), { wrapper });

      await act(async () => {
        result.current.mutate("invalid formula");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("invalidates relevant queries on success", async () => {
      (invoke as jest.Mock).mockResolvedValue(undefined);

      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useUpdateFormula(), { wrapper });

      await act(async () => {
        result.current.mutate("commits * 10");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQuerySpy).toHaveBeenCalled();
    });
  });
});
