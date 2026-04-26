import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { AnalysisScope, InsightRow } from "../types";

type InsightScope = Pick<AnalysisScope, "repoId" | "workspaceId">;

interface InsightDateRange {
  fromDate?: string | null;
  toDate?: string | null;
}

function hasInsightScope(scope: InsightScope): boolean {
  return scope.repoId != null || scope.workspaceId != null;
}

export function useInsights(
  scope: InsightScope,
  dateRange?: InsightDateRange | null,
) {
  const repoId = scope.repoId ?? null;
  const workspaceId = scope.workspaceId ?? null;
  const fromDate = dateRange?.fromDate ?? null;
  const toDate = dateRange?.toDate ?? null;

  return useQuery<InsightRow[]>({
    queryKey: ["insights", repoId, workspaceId, fromDate, toDate],
    queryFn: () =>
      invoke("get_insights", {
        repoId,
        workspaceId,
        fromDate,
        toDate,
      }),
    enabled: hasInsightScope(scope),
  });
}
