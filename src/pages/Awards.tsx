import { useState } from "react";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import { usePeriodAwards } from "../hooks/useHistoricalStats";
import type { PeriodSelection, PeriodType } from "../types";

function currentPeriod(): PeriodSelection {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return {
    periodType: "month",
    periodKey: `${now.getFullYear()}-${month}`,
  };
}

function defaultKeyForType(periodType: PeriodType): string {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;

  if (periodType === "month") {
    return `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  if (periodType === "quarter") {
    return `${year}-Q${quarter}`;
  }
  if (periodType === "all_time") {
    return "all";
  }
  return String(year);
}

function formatAwardType(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMetric(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  });
}

export default function Awards() {
  const { analysisScope, analysisScopeMode, repoId, workspaceId } = useAppContext();
  const [period, setPeriod] = useState<PeriodSelection>(() => currentPeriod());
  const { data: awards = [], isLoading } = usePeriodAwards(analysisScope, period);

  const hasAnalysisTarget =
    analysisScopeMode === "workspace" ? workspaceId != null : repoId != null;
  const awardedDevelopers = new Set(
    awards.map((award) => award.winner_developer_id),
  ).size;

  const updatePeriodType = (periodType: PeriodType) => {
    setPeriod({ periodType, periodKey: defaultKeyForType(periodType) });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Awards
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Period awards for the selected scope.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Awards period type"
            value={period.periodType}
            onChange={(event) => updatePeriodType(event.target.value as PeriodType)}
            className="rounded-full bg-surface-container-high px-3 py-2 text-sm text-on-surface outline-none"
          >
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="calendar_year">Calendar Year</option>
            <option value="season">Season</option>
            <option value="all_time">All Time</option>
          </select>
          <input
            aria-label="Awards period key"
            value={period.periodKey}
            onChange={(event) =>
              setPeriod((current) => ({
                ...current,
                periodKey: event.target.value,
              }))
            }
            className="w-32 rounded-full bg-surface-container-high px-3 py-2 text-sm text-on-surface outline-none"
          />
        </div>
      </div>

      {!hasAnalysisTarget && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a repository or workspace in the sidebar.
        </div>
      )}

      {hasAnalysisTarget && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Awards" value={awards.length} accent />
            <StatCard label="Winners" value={awardedDevelopers} />
            <StatCard label="Period" value={period.periodKey} />
          </div>

          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Winners
            </h2>
            {isLoading ? (
              <p className="text-on-surface-variant text-sm">Loading...</p>
            ) : awards.length === 0 ? (
              <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
                No awards for this period. Sync a repository first.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {awards.map((award) => (
                  <article
                    key={award.award_key}
                    className="rounded-lg bg-surface-container-low p-4"
                  >
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                      {award.title || formatAwardType(award.award_key)}
                    </p>
                    <h2
                      className="mt-2 truncate text-xl font-bold text-on-surface"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {award.winner_developer_name}
                    </h2>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <span className="text-sm text-on-surface-variant">
                        {award.explanation}
                      </span>
                      <span className="shrink-0 text-lg font-semibold text-primary">
                        {formatMetric(award.metric_value)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
