import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useReassignAlias } from "../../hooks/useDevelopers";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useDevelopers hooks", () => {
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe("useReassignAlias", () => {
    it("moves an alias to a target developer and invalidates dependent caches", async () => {
      (invoke as jest.Mock).mockResolvedValue(undefined);
      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useReassignAlias(), { wrapper });

      await act(async () => {
        result.current.mutate({
          aliasId: "alias1",
          targetDeveloperId: "dev2",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("reassign_alias", {
        aliasId: "alias1",
        targetDeveloperId: "dev2",
      });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["developers"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({
        queryKey: ["developers", "unreviewed"],
      });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["stats"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({
        queryKey: ["activity_timeline"],
      });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({
        queryKey: ["daily_stats"],
      });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["file_stats"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({
        queryKey: ["directory_stats"],
      });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({
        queryKey: ["leaderboard"],
      });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["box_score"] });
    });
  });
});
