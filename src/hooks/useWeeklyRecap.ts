import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { AnalysisScope, WeeklyRecap } from "../types";

type RecapScope = Pick<AnalysisScope, "repoId" | "workspaceId">;

function hasRecapScope(scope: RecapScope): boolean {
  return scope.repoId != null || scope.workspaceId != null;
}

export function useWeeklyRecap(scope: RecapScope, weekStart: string) {
  const repoId = scope.repoId ?? null;
  const workspaceId = scope.workspaceId ?? null;

  return useQuery<WeeklyRecap>({
    queryKey: ["weekly_recap", repoId, workspaceId, weekStart],
    queryFn: () =>
      invoke("get_weekly_recap", {
        repoId,
        workspaceId,
        weekStart,
      }),
    enabled: hasRecapScope(scope) && weekStart.trim() !== "",
  });
}
