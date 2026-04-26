import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  AnalysisScope,
  HallOfFameEntry,
  HistoricalRecordRow,
  PeriodAwardRow,
  PeriodLeaderboardRow,
  PeriodSelection,
} from "../types";

type HistoricalScope = Pick<AnalysisScope, "repoId" | "workspaceId">;

function hasScope(scope: HistoricalScope): boolean {
  return scope.repoId != null || scope.workspaceId != null;
}

function periodParams(scope: HistoricalScope, period: PeriodSelection) {
  return {
    repoId: scope.repoId ?? null,
    workspaceId: scope.workspaceId ?? null,
    periodType: period.periodType,
    periodKey: period.periodKey,
  };
}

function periodQueryEnabled(scope: HistoricalScope, period: PeriodSelection): boolean {
  return hasScope(scope) && period.periodKey.trim() !== "";
}

export function usePeriodLeaderboard(
  scope: HistoricalScope,
  period: PeriodSelection,
) {
  const repoId = scope.repoId ?? null;
  const workspaceId = scope.workspaceId ?? null;

  return useQuery<PeriodLeaderboardRow[]>({
    queryKey: [
      "period_leaderboard",
      repoId,
      workspaceId,
      period.periodType,
      period.periodKey,
    ],
    queryFn: () => invoke("get_period_leaderboard", periodParams(scope, period)),
    enabled: periodQueryEnabled(scope, period),
  });
}

export function usePeriodAwards(scope: HistoricalScope, period: PeriodSelection) {
  const repoId = scope.repoId ?? null;
  const workspaceId = scope.workspaceId ?? null;

  return useQuery<PeriodAwardRow[]>({
    queryKey: [
      "period_awards",
      repoId,
      workspaceId,
      period.periodType,
      period.periodKey,
    ],
    queryFn: () => invoke("get_period_awards", periodParams(scope, period)),
    enabled: periodQueryEnabled(scope, period),
  });
}

export function useHistoricalRecords(
  scope: HistoricalScope,
  period: PeriodSelection,
) {
  const repoId = scope.repoId ?? null;
  const workspaceId = scope.workspaceId ?? null;

  return useQuery<HistoricalRecordRow[]>({
    queryKey: [
      "historical_records",
      repoId,
      workspaceId,
      period.periodType,
      period.periodKey,
    ],
    queryFn: () => invoke("get_historical_records", periodParams(scope, period)),
    enabled: periodQueryEnabled(scope, period),
  });
}

export function useHallOfFame(scope: HistoricalScope) {
  const repoId = scope.repoId ?? null;
  const workspaceId = scope.workspaceId ?? null;

  return useQuery<HallOfFameEntry[]>({
    queryKey: ["hall_of_fame", repoId, workspaceId],
    queryFn: () =>
      invoke("get_hall_of_fame", {
        repoId,
        workspaceId,
      }),
    enabled: hasScope(scope),
  });
}
