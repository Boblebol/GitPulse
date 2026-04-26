import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  useDirectoryHealthStats,
  useFileHealthStats,
} from "../../hooks/useCodeHealth";
import type { PeriodSelection } from "../../types";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useCodeHealth hooks", () => {
  let queryClient: QueryClient;

  const period: PeriodSelection = {
    periodType: "quarter",
    periodKey: "2026-Q2",
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

  it("fetches file health stats with repo and period params", async () => {
    const rows = [{ file_id: "file1", file_path: "src/App.tsx" }];
    (invoke as jest.Mock).mockResolvedValue(rows);

    const { result } = renderHook(() => useFileHealthStats("repo1", period), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(rows);
    expect(invoke).toHaveBeenCalledWith("get_file_health_stats", {
      repoId: "repo1",
      periodType: "quarter",
      periodKey: "2026-Q2",
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["file_health_stats", "repo1", "quarter", "2026-Q2"],
      }),
    ).toBeDefined();
  });

  it("fetches directory health stats with repo and period params", async () => {
    const rows = [{ directory_path: "src", directory_health_score: 72 }];
    (invoke as jest.Mock).mockResolvedValue(rows);

    const { result } = renderHook(
      () => useDirectoryHealthStats("repo1", period),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(rows);
    expect(invoke).toHaveBeenCalledWith("get_directory_health_stats", {
      repoId: "repo1",
      periodType: "quarter",
      periodKey: "2026-Q2",
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["directory_health_stats", "repo1", "quarter", "2026-Q2"],
      }),
    ).toBeDefined();
  });

  it("does not fetch health queries when repo is missing", () => {
    const { result: fileHealth } = renderHook(
      () => useFileHealthStats(null, period),
      { wrapper },
    );
    const { result: directoryHealth } = renderHook(
      () => useDirectoryHealthStats(null, period),
      { wrapper },
    );

    expect(fileHealth.current.isLoading).toBe(false);
    expect(directoryHealth.current.isLoading).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
