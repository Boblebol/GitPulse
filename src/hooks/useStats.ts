import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  DeveloperGlobalRow,
  FileGlobalRow,
  LeaderboardEntry,
  StatsDailyDeveloper,
  StatsDirectoryGlobal,
} from "../types";

// ── Global stats ──────────────────────────────────────────────────────────────

export function useDeveloperGlobalStats() {
  return useQuery<DeveloperGlobalRow[]>({
    queryKey: ["stats", "developer_global"],
    queryFn: () => invoke("get_developer_global_stats"),
  });
}

export function useFileStats(repoId: string | null) {
  return useQuery<FileGlobalRow[]>({
    queryKey: ["file_stats", repoId],
    queryFn: () => invoke("get_file_stats", { repoId }),
    enabled: repoId != null,
  });
}

export function useDirectoryStats(repoId: string | null) {
  return useQuery<StatsDirectoryGlobal[]>({
    queryKey: ["directory_stats", repoId],
    queryFn: () => invoke("get_directory_stats", { repoId }),
    enabled: repoId != null,
  });
}

// ── Daily stats ───────────────────────────────────────────────────────────────

export function useDailyStats(
  developerId: string | null,
  repoId: string | null,
  fromDate: string,
  toDate: string,
) {
  return useQuery<StatsDailyDeveloper[]>({
    queryKey: ["daily_stats", developerId, repoId, fromDate, toDate],
    queryFn: () =>
      invoke("get_daily_stats", { developerId, repoId, fromDate, toDate }),
    enabled: developerId != null && repoId != null,
  });
}

// ── Box Score ─────────────────────────────────────────────────────────────────

export function useBoxScore(
  developerId: string | null,
  repoId: string | null,
  date: string,
) {
  return useQuery<StatsDailyDeveloper | null>({
    queryKey: ["box_score", developerId, repoId, date],
    queryFn: () => invoke("get_box_score", { developerId, repoId, date }),
    enabled: developerId != null && repoId != null && date !== "",
  });
}

export function useLeaderboard(
  repoId: string | null,
  fromDate: string,
  toDate: string,
) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", repoId, fromDate, toDate],
    queryFn: () => invoke("get_leaderboard", { repoId, fromDate, toDate }),
    enabled: repoId != null,
  });
}

// ── Formula ───────────────────────────────────────────────────────────────────

export function useUpdateFormula() {
  const qc = useQueryClient();
  return useMutation<void, string, string>({
    mutationFn: (expression) => invoke("update_formula", { expression }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["box_score"] });
    },
  });
}
