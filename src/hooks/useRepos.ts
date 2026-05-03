import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useAppContext } from "../context/AppContext";
import type {
  AddRepoInput,
  AddReposResult,
  Repo,
  RepoImportCandidate,
  ScanProgress,
  ScanResult,
  Workspace,
} from "../types";

type QueryInvalidator = {
  invalidateQueries: (filters: { queryKey: unknown[] }) => unknown;
};

type ScanProgressResponse = Partial<ScanProgress> & {
  id?: string;
  repoId?: string;
  scanRunId?: string;
  commitsIndexed?: number;
  filesProcessed?: number;
  cursorSha?: string | null;
  lastIndexedCommitSha?: string | null;
  targetHeadSha?: string;
  error_message?: string | null;
};

function invalidateScanDependentQueries(qc: QueryInvalidator, repoId?: string) {
  qc.invalidateQueries({ queryKey: ["stats"] });
  qc.invalidateQueries({ queryKey: ["daily_stats"] });
  qc.invalidateQueries({ queryKey: ["file_stats"] });
  qc.invalidateQueries({ queryKey: ["directory_stats"] });
  qc.invalidateQueries({ queryKey: ["leaderboard"] });
  qc.invalidateQueries({ queryKey: ["box_score"] });
  qc.invalidateQueries({ queryKey: ["repos"] });

  if (repoId != null) {
    qc.invalidateQueries({ queryKey: ["scan_status", repoId] });
  }
}

function normalizeScanProgress(progress: ScanProgressResponse | null): ScanProgress | null {
  if (progress == null) return null;

  const normalized: ScanProgress = {
    repo_id: progress.repo_id ?? progress.repoId ?? "",
    scan_run_id: progress.scan_run_id ?? progress.scanRunId ?? progress.id ?? "",
    status: progress.status ?? "running",
    commits_indexed: progress.commits_indexed ?? progress.commitsIndexed ?? 0,
    files_processed: progress.files_processed ?? progress.filesProcessed ?? 0,
    cursor_sha: progress.cursor_sha ?? progress.cursorSha ?? null,
    target_head_sha: progress.target_head_sha ?? progress.targetHeadSha ?? "",
  };

  const lastIndexedCommitSha =
    progress.last_indexed_commit_sha ?? progress.lastIndexedCommitSha;
  if (lastIndexedCommitSha !== undefined) {
    normalized.last_indexed_commit_sha = lastIndexedCommitSha;
  }
  if (progress.message !== undefined) {
    normalized.message = progress.message;
  }
  if (progress.error !== undefined) {
    normalized.error = progress.error;
  } else if (progress.error_message != null) {
    normalized.error = progress.error_message;
  }

  return normalized;
}

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

export function useRepoBranches(path: string | null) {
  return useQuery<string[]>({
    queryKey: ["branches", path],
    queryFn: () => invoke("list_repo_branches", { path }),
    enabled: path != null && path.trim() !== "",
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

export function useDiscoverRepoImportCandidates() {
  return useMutation<RepoImportCandidate[], string, string[]>({
    mutationFn: (paths) => invoke("discover_repo_import_candidates", { paths }),
  });
}

export function useAddRepos() {
  const qc = useQueryClient();
  return useMutation<
    AddReposResult,
    string,
    { workspaceId: string; repos: AddRepoInput[] }
  >({
    mutationFn: ({ workspaceId, repos }) =>
      invoke("add_repos", { workspaceId, repos }),
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
    onSuccess: (repo, vars) => {
      qc.invalidateQueries({ queryKey: ["repos", vars.workspaceId] });
      qc.invalidateQueries({ queryKey: ["branches", repo.path] });
      invalidateScanDependentQueries(qc, repo.id);
    },
  });
}

export function useTriggerScan() {
  const qc = useQueryClient();
  return useMutation<ScanResult, string, string>({
    mutationFn: (repoId) => invoke<ScanResult>("trigger_scan", { repoId }),
    onSuccess: (_data, repoId) => {
      invalidateScanDependentQueries(qc, repoId);
    },
  });
}

export function usePauseScan() {
  return useMutation<void, string, string>({
    mutationFn: (scanRunId) => invoke("pause_scan", { scanRunId }),
  });
}

export function useResumeScan() {
  const qc = useQueryClient();
  return useMutation<ScanResult, string, string>({
    mutationFn: async (repoId) => {
      const result = await invoke("resume_scan", { repoId });
      return result as ScanResult;
    },
    onSuccess: (_data, repoId) => {
      invalidateScanDependentQueries(qc, repoId);
    },
  });
}

export function useScanStatus(repoId: string | null) {
  return useQuery<ScanProgress | null>({
    queryKey: ["scan_status", repoId],
    queryFn: async () => {
      const result = await invoke<ScanProgressResponse | null>("get_scan_status", {
        repoId,
      });
      return normalizeScanProgress(result);
    },
    enabled: repoId != null,
  });
}

export function useScanProgressEvents() {
  const qc = useQueryClient();
  const { setScanProgress, setScanningRepoId, setSyncStatus } = useAppContext();
  const handlersRef = useRef({
    setScanProgress,
    setScanningRepoId,
    setSyncStatus,
  });

  useEffect(() => {
    handlersRef.current = {
      setScanProgress,
      setScanningRepoId,
      setSyncStatus,
    };
  });

  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | undefined;

    const unlistenPromise = listen<ScanProgress>("scan_progress", (event) => {
      const progress = event.payload;
      const handlers = handlersRef.current;

      handlers.setScanProgress(progress);

      switch (progress.status) {
        case "running":
          handlers.setScanningRepoId(progress.repo_id);
          handlers.setSyncStatus(progress.message ?? "Scanning...");
          break;
        case "paused":
          handlers.setScanningRepoId(progress.repo_id);
          handlers.setSyncStatus(progress.message ?? "Scan paused");
          break;
        case "completed":
          handlers.setScanningRepoId(null);
          handlers.setSyncStatus("");
          invalidateScanDependentQueries(qc, progress.repo_id);
          break;
        case "failed":
          handlers.setScanningRepoId(null);
          handlers.setSyncStatus(progress.error ?? progress.message ?? "Scan failed");
          break;
      }
    });

    unlistenPromise.then((cleanup) => {
      if (isMounted) {
        unlisten = cleanup;
        return;
      }

      cleanup();
    });

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [qc]);
}
