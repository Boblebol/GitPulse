import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  ActivitySignalRow,
  DeveloperFocusRow,
  DirectoryHealthRow,
  FileCouplingRow,
  FileHealthRow,
  FileVolatilityRow,
  PeriodSelection,
  ReviewRiskCommitRow,
} from "../types";

function healthParams(repoId: string, period: PeriodSelection) {
  return {
    repoId,
    periodType: period.periodType,
    periodKey: period.periodKey,
  };
}

function healthQueryEnabled(
  repoId: string | null,
  period: PeriodSelection,
): repoId is string {
  return repoId != null && period.periodKey.trim() !== "";
}

export function useFileHealthStats(
  repoId: string | null,
  period: PeriodSelection,
) {
  return useQuery<FileHealthRow[]>({
    queryKey: [
      "file_health_stats",
      repoId,
      period.periodType,
      period.periodKey,
    ],
    queryFn: () => invoke("get_file_health_stats", healthParams(repoId!, period)),
    enabled: healthQueryEnabled(repoId, period),
  });
}

export function useDirectoryHealthStats(
  repoId: string | null,
  period: PeriodSelection,
) {
  return useQuery<DirectoryHealthRow[]>({
    queryKey: [
      "directory_health_stats",
      repoId,
      period.periodType,
      period.periodKey,
    ],
    queryFn: () =>
      invoke("get_directory_health_stats", healthParams(repoId!, period)),
    enabled: healthQueryEnabled(repoId, period),
  });
}

export function useDeveloperFocusStats(
  repoId: string | null,
  period: PeriodSelection,
) {
  return useQuery<DeveloperFocusRow[]>({
    queryKey: ["developer_focus_stats", repoId, period.periodType, period.periodKey],
    queryFn: () => invoke("get_developer_focus_stats", healthParams(repoId!, period)),
    enabled: healthQueryEnabled(repoId, period),
  });
}

export function useReviewRiskCommits(
  repoId: string | null,
  period: PeriodSelection,
) {
  return useQuery<ReviewRiskCommitRow[]>({
    queryKey: ["review_risk_commits", repoId, period.periodType, period.periodKey],
    queryFn: () => invoke("get_review_risk_commits", healthParams(repoId!, period)),
    enabled: healthQueryEnabled(repoId, period),
  });
}

export function useActivitySignalStats(
  repoId: string | null,
  period: PeriodSelection,
) {
  return useQuery<ActivitySignalRow[]>({
    queryKey: ["activity_signal_stats", repoId, period.periodType, period.periodKey],
    queryFn: () => invoke("get_activity_signal_stats", healthParams(repoId!, period)),
    enabled: healthQueryEnabled(repoId, period),
  });
}

export function useFileVolatilityStats(
  repoId: string | null,
  period: PeriodSelection,
) {
  return useQuery<FileVolatilityRow[]>({
    queryKey: ["file_volatility_stats", repoId, period.periodType, period.periodKey],
    queryFn: () => invoke("get_file_volatility_stats", healthParams(repoId!, period)),
    enabled: healthQueryEnabled(repoId, period),
  });
}

export function useFileCouplingGraph(
  repoId: string | null,
  period: PeriodSelection,
) {
  return useQuery<FileCouplingRow[]>({
    queryKey: ["file_coupling_graph", repoId, period.periodType, period.periodKey],
    queryFn: () => invoke("get_file_coupling_graph", healthParams(repoId!, period)),
    enabled: healthQueryEnabled(repoId, period),
  });
}
