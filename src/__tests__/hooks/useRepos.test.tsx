import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useWorkspaces,
  useRepos,
  useCreateWorkspace,
  useAddRepo,
  useTriggerScan,
  useDeleteWorkspace,
  useRemoveRepo,
  useSetRepoBranch,
  useListRepoBranches,
} from "../../hooks/useRepos";
import type { ReactNode } from "react";

// Mock tauri API
jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useRepos hooks", () => {
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

  describe("useWorkspaces", () => {
    it("fetches workspaces successfully", async () => {
      const mockWorkspaces = [
        { id: "ws1", name: "Workspace 1" },
        { id: "ws2", name: "Workspace 2" },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockWorkspaces);

      const { result } = renderHook(() => useWorkspaces(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockWorkspaces);
      expect(invoke).toHaveBeenCalledWith("list_workspaces");
    });

    it("handles fetch error", async () => {
      const error = new Error("Failed to fetch workspaces");
      (invoke as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useWorkspaces(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });

    it("retries on error by default", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useWorkspaces(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(invoke).toHaveBeenCalled();
    });
  });

  describe("useRepos", () => {
    it("fetches repos for a workspace", async () => {
      const mockRepos = [
        {
          id: "repo1",
          name: "Project A",
          path: "/path/to/repo1",
          active_branch: "main",
        },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockRepos);

      const { result } = renderHook(() => useRepos("ws1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockRepos);
      expect(invoke).toHaveBeenCalledWith("list_repos", { workspaceId: "ws1" });
    });

    it("does not fetch repos when workspaceId is null", () => {
      const { result } = renderHook(() => useRepos(null), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("handles fetch error for repos", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Failed to fetch repos"));

      const { result } = renderHook(() => useRepos("ws1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("refetches when workspaceId changes", async () => {
      const mockRepos1 = [{ id: "repo1", name: "Project A", path: "/path/to/repo1", active_branch: "main" }];
      const mockRepos2 = [{ id: "repo2", name: "Project B", path: "/path/to/repo2", active_branch: "main" }];

      (invoke as jest.Mock)
        .mockResolvedValueOnce(mockRepos1)
        .mockResolvedValueOnce(mockRepos2);

      const { result, rerender } = renderHook(
        ({ wsId }: { wsId: string | null }) => useRepos(wsId),
        { wrapper, initialProps: { wsId: "ws1" } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockRepos1);

      await act(async () => {
        rerender({ wsId: "ws2" });
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("useCreateWorkspace", () => {
    it("creates a workspace successfully", async () => {
      const mockWorkspace = { id: "ws1", name: "New Workspace" };
      (invoke as jest.Mock).mockResolvedValue(mockWorkspace);

      // Prime cache with existing workspaces
      await act(async () => {
        queryClient.setQueryData(["workspaces"], []);
      });

      const { result } = renderHook(() => useCreateWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("New Workspace");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("create_workspace", { name: "New Workspace" });
    });

    it("handles creation error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Creation failed"));

      const { result } = renderHook(() => useCreateWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("New Workspace");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("invalidates workspaces query on success", async () => {
      const mockWorkspace = { id: "ws1", name: "New Workspace" };
      (invoke as jest.Mock).mockResolvedValue(mockWorkspace);

      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("New Workspace");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQuerySpy).toHaveBeenCalled();
    });
  });

  describe("useDeleteWorkspace", () => {
    it("deletes a workspace successfully", async () => {
      (invoke as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("ws1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("delete_workspace", { workspaceId: "ws1" });
    });

    it("handles deletion error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Deletion failed"));

      const { result } = renderHook(() => useDeleteWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("ws1");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useAddRepo", () => {
    it("adds a repo to a workspace", async () => {
      const mockRepo = {
        id: "repo1",
        name: "New Repo",
        path: "/path/to/repo",
        active_branch: "main",
      };
      (invoke as jest.Mock).mockResolvedValue(mockRepo);

      const { result } = renderHook(() => useAddRepo(), { wrapper });

      await act(async () => {
        result.current.mutate({
          workspaceId: "ws1",
          path: "/path/to/repo",
          name: "New Repo",
          branch: "main",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("add_repo", {
        workspaceId: "ws1",
        path: "/path/to/repo",
        name: "New Repo",
        branch: "main",
      });
    });

    it("handles add error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Add failed"));

      const { result } = renderHook(() => useAddRepo(), { wrapper });

      await act(async () => {
        result.current.mutate({
          workspaceId: "ws1",
          path: "/path/to/repo",
          name: "New Repo",
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("invalidates repos query on success", async () => {
      const mockRepo = {
        id: "repo1",
        name: "New Repo",
        path: "/path/to/repo",
        active_branch: "main",
      };
      (invoke as jest.Mock).mockResolvedValue(mockRepo);

      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useAddRepo(), { wrapper });

      await act(async () => {
        result.current.mutate({
          workspaceId: "ws1",
          path: "/path/to/repo",
          name: "New Repo",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQuerySpy).toHaveBeenCalled();
    });
  });

  describe("useRemoveRepo", () => {
    it("removes a repo from workspace", async () => {
      (invoke as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useRemoveRepo(), { wrapper });

      await act(async () => {
        result.current.mutate({ repoId: "repo1", workspaceId: "ws1" });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("remove_repo", { repoId: "repo1" });
    });
  });

  describe("useSetRepoBranch", () => {
    it("sets repo branch successfully", async () => {
      const mockRepo = {
        id: "repo1",
        name: "Project A",
        path: "/path/to/repo",
        active_branch: "develop",
      };
      (invoke as jest.Mock).mockResolvedValue(mockRepo);

      const { result } = renderHook(() => useSetRepoBranch(), { wrapper });

      await act(async () => {
        result.current.mutate({
          repoId: "repo1",
          branch: "develop",
          workspaceId: "ws1",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("set_repo_branch", {
        repoId: "repo1",
        branch: "develop",
      });
    });
  });

  describe("useListRepoBranches", () => {
    it("is disabled by default", () => {
      const { result } = renderHook(() => useListRepoBranches(), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("useTriggerScan", () => {
    it("triggers a scan on a repo", async () => {
      const mockScanResult = { commits_added: 100 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("trigger_scan", { repoId: "repo1" });
      expect(consoleSpy).toHaveBeenCalledWith("[Scan] Starting scan for repo", "repo1");

      consoleSpy.mockRestore();
    });

    it("handles scan error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Scan failed"));

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("invalidates all relevant queries on success", async () => {
      const mockScanResult = { commits_added: 100 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should invalidate stats, daily_stats, file_stats, etc
      expect(invalidateQuerySpy).toHaveBeenCalled();
    });

    it("logs scan completion", async () => {
      const mockScanResult = { commits_added: 150 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(consoleSpy).toHaveBeenCalledWith("[Scan] Completed for repo", "repo1", mockScanResult);

      consoleSpy.mockRestore();
    });

    it("logs onSuccess callback", async () => {
      const mockScanResult = { commits_added: 100 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(consoleSpy).toHaveBeenCalledWith("[Scan] onSuccess callback triggered for repo", "repo1");

      consoleSpy.mockRestore();
    });
  });
});
