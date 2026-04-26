import { useState } from "react";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import { usePeriodLeaderboard } from "../hooks/useHistoricalStats";
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

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatScore(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1);
}

export default function Seasons() {
  const { analysisScope, analysisScopeMode, repoId, workspaceId } = useAppContext();
  const [period, setPeriod] = useState<PeriodSelection>(() => currentPeriod());
  const { data: rows = [], isLoading } = usePeriodLeaderboard(analysisScope, period);

  const hasAnalysisTarget =
    analysisScopeMode === "workspace" ? workspaceId != null : repoId != null;
  const totalCommits = rows.reduce((sum, row) => sum + row.total_commits, 0);
  const topRow = rows[0];

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
            Seasons
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Period rankings for the selected scope.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
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
            <StatCard label="Developers" value={rows.length} accent />
            <StatCard label="Commits" value={formatNumber(totalCommits)} />
            <StatCard
              label="Top Score"
              value={topRow ? formatScore(topRow.total_player_score) : "0"}
              sub={topRow?.developer_name}
            />
          </div>

          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Leaderboard
            </h2>
            {isLoading ? (
              <p className="text-on-surface-variant text-sm">Loading...</p>
            ) : rows.length === 0 ? (
              <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
                No leaderboard data for this period. Sync a repository first.
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden bg-surface-container-low">
                <div
                  className="grid px-4 py-2 text-xs uppercase tracking-widest text-on-surface-variant"
                  style={{ gridTemplateColumns: "56px 1fr 90px 90px 90px 90px 80px" }}
                >
                  <span>Rank</span>
                  <span>Developer</span>
                  <span className="text-right">Score</span>
                  <span className="text-right">Commits</span>
                  <span className="text-right">+Lines</span>
                  <span className="text-right">-Lines</span>
                  <span className="text-right">Streak</span>
                </div>
                {rows.map((row, index) => (
                  <div
                    key={row.developer_id}
                    className={[
                      "grid items-center px-4 py-3 transition-colors",
                      index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container",
                      "hover:bg-surface-container-highest",
                    ].join(" ")}
                    style={{ gridTemplateColumns: "56px 1fr 90px 90px 90px 90px 80px" }}
                  >
                    <span className="text-sm font-semibold text-primary">#{row.rank}</span>
                    <span className="min-w-0 truncate font-semibold text-on-surface">
                      {row.developer_name}
                    </span>
                    <span className="text-right text-on-surface">
                      {formatScore(row.total_player_score)}
                    </span>
                    <span className="text-right text-on-surface-variant">
                      {formatNumber(row.total_commits)}
                    </span>
                    <span className="text-right text-tertiary">
                      +{formatNumber(row.total_insertions)}
                    </span>
                    <span className="text-right text-error">
                      -{formatNumber(row.total_deletions)}
                    </span>
                    <span className="text-right text-primary">{row.best_streak}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
