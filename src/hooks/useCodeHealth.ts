import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { DirectoryHealthRow, FileHealthRow, PeriodSelection } from "../types";

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
