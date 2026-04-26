import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import { useWeeklyRecap } from "../hooks/useWeeklyRecap";
import { createTimeRange, shiftTimeRange } from "../utils/timeRange";

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function currentWeekStart(): string {
  return createTimeRange("week").fromDate ?? createTimeRange("week").anchorDate;
}

function shiftWeekStart(weekStart: string, amount: number): string {
  return shiftTimeRange(createTimeRange("week", weekStart), amount).fromDate ?? weekStart;
}

function normalizeWeekStart(date: string): string {
  return createTimeRange("week", date).fromDate ?? date;
}

export default function WeeklyRecap() {
  const {
    analysisScope,
    analysisScopeMode,
    repoId,
    workspaceId,
    addNotification,
  } = useAppContext();
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const { data: recap, isLoading } = useWeeklyRecap(analysisScope, weekStart);

  const hasAnalysisTarget =
    analysisScopeMode === "workspace" ? workspaceId != null : repoId != null;

  const copyMarkdown = async () => {
    if (!recap?.markdown) return;

    try {
      await navigator.clipboard.writeText(recap.markdown);
      addNotification("Weekly recap copied", "success");
    } catch {
      addNotification("Could not copy weekly recap", "error");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Weekly Recap
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Weekly repo or workspace summary ready for retros and updates.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-surface-container-low p-1">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeekStart((current) => shiftWeekStart(current, -1))}
            className="grid h-9 w-9 place-items-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <ChevronLeft size={17} />
          </button>
          <input
            aria-label="Week start"
            type="date"
            value={weekStart}
            onChange={(event) => setWeekStart(normalizeWeekStart(event.target.value))}
            className="h-9 rounded-md bg-surface-container px-3 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
          />
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekStart((current) => shiftWeekStart(current, 1))}
            className="grid h-9 w-9 place-items-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {!hasAnalysisTarget && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a repository or workspace in the sidebar.
        </div>
      )}

      {hasAnalysisTarget && (
        <>
          {isLoading && (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          )}

          {!isLoading && !recap && (
            <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
              No recap data yet. Sync a repository first.
            </div>
          )}

          {recap && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Commits" value={formatNumber(recap.commits)} accent />
                <StatCard label="Insertions" value={`+${formatNumber(recap.insertions)}`} />
                <StatCard label="Deletions" value={`-${formatNumber(recap.deletions)}`} />
                <StatCard label="Active Days" value={formatNumber(recap.active_days)} />
              </div>

              <section className="grid gap-3 lg:grid-cols-3">
                <article className="rounded-lg bg-surface-container-low p-4">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                    Week
                  </p>
                  <h2
                    className="mt-2 text-lg font-bold text-on-surface"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    {recap.week_start} to {recap.week_end}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {recap.scope_label}
                  </p>
                </article>

                <article className="rounded-lg bg-surface-container-low p-4">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                    Top Developer
                  </p>
                  <h2
                    className="mt-2 truncate text-lg font-bold text-on-surface"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    {recap.top_developer_name ?? "No activity"}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {formatNumber(recap.top_developer_commits)} commits
                  </p>
                </article>

                <article className="rounded-lg bg-surface-container-low p-4">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                    Top File
                  </p>
                  <h2
                    className="mt-2 truncate text-lg font-bold text-on-surface"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    title={recap.top_file_path ?? undefined}
                  >
                    {recap.top_file_path ?? "No files touched"}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {formatNumber(recap.top_file_commits)} commits
                  </p>
                </article>
              </section>

              {recap.top_insight_title && (
                <section className="rounded-lg bg-surface-container-low p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                        Top Insight
                      </p>
                      <h2
                        className="mt-2 text-lg font-bold text-on-surface"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {recap.top_insight_title}
                      </h2>
                    </div>
                    {recap.top_insight_severity && (
                      <span className="rounded-full bg-primary-container px-2.5 py-1 text-xs font-semibold text-primary">
                        {recap.top_insight_severity}
                      </span>
                    )}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2
                    className="text-sm uppercase tracking-widest text-on-surface-variant"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    Markdown
                  </h2>
                  <button
                    type="button"
                    onClick={copyMarkdown}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <Copy size={16} />
                    Copy Markdown
                  </button>
                </div>
                <textarea
                  aria-label="Weekly recap markdown"
                  readOnly
                  value={recap.markdown}
                  className="h-72 w-full resize-none rounded-lg bg-surface-container-low p-4 font-mono text-sm leading-6 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
