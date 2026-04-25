import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { Repo, ScanResult, Workspace } from "../types";

// ── Workspaces ────────────────────────────────────────────────────────────────

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: () => invoke("list_workspaces"),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation<Workspace, string, string>({
    mutationFn: (name) => invoke("create_workspace", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation<void, string, string>({
    mutationFn: (workspaceId) => invoke("delete_workspace", { workspaceId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

// ── Repos ─────────────────────────────────────────────────────────────────────

export function useRepos(workspaceId: string | null) {
  return useQuery<Repo[]>({
    queryKey: ["repos", workspaceId],
    queryFn: () => invoke("list_repos", { workspaceId }),
    enabled: workspaceId != null,
  });
}

export function useListRepoBranches() {
  return useQuery<string[]>({
    queryKey: ["branches"],
    queryFn: (context) => {
      const path = context.queryKey[1] as string;
      return invoke("list_repo_branches", { path });
    },
    enabled: false,
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation<
    Repo,
    string,
    { workspaceId: string; path: string; name: string; branch?: string }
  >({
    mutationFn: ({ workspaceId, path, name, branch }) =>
      invoke("add_repo", { workspaceId, path, name, branch }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["repos", vars.workspaceId] }),
  });
}

export function useRemoveRepo() {
  const qc = useQueryClient();
  return useMutation<void, string, { repoId: string; workspaceId: string }>({
    mutationFn: ({ repoId }) => invoke("remove_repo", { repoId }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["repos", vars.workspaceId] }),
  });
}

export function useSetRepoBranch() {
  const qc = useQueryClient();
  return useMutation<
    Repo,
    string,
    { repoId: string; branch: string; workspaceId: string }
  >({
    mutationFn: ({ repoId, branch }) =>
      invoke("set_repo_branch", { repoId, branch }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["repos", vars.workspaceId] }),
  });
}

export function useTriggerScan() {
  const qc = useQueryClient();
  return useMutation<ScanResult, string, string>({
    mutationFn: async (repoId) => {
      console.log("[Scan] Starting scan for repo", repoId);
      const result = await invoke("trigger_scan", { repoId });
      console.log("[Scan] Completed for repo", repoId, result);
      return result as ScanResult;
    },
    onSuccess: (_data, repoId) => {
      console.log("[Scan] onSuccess callback triggered for repo", repoId);
      // Invalidate all stats after a scan
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["daily_stats"] });
      qc.invalidateQueries({ queryKey: ["file_stats"] });
      qc.invalidateQueries({ queryKey: ["directory_stats"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["box_score"] });
      qc.invalidateQueries({ queryKey: ["repos"] });
    },
    onError: (error, repoId) => {
      console.error("[Scan] Error scanning repo", repoId, error);
    },
  });
}
