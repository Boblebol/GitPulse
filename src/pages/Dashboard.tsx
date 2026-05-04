import { useAppContext } from "../context/AppContext";
import { useActivityTimeline, useDeveloperGlobalStats, useFileStats } from "../hooks/useStats";
import { usePauseScan, useResumeScan, useScanStatus, useTriggerScan } from "../hooks/useRepos";
import { useInsights } from "../hooks/useInsights";
import ActivityChart from "../components/ActivityChart";
import StatCard from "../components/StatCard";
import TimeRangePicker from "../components/TimeRangePicker";
import HelpTooltip from "../components/HelpTooltip";
import PageHelp from "../components/PageHelp";
import {
  DEMO_ACTIVITY_TIMELINE,
  DEMO_DEVELOPER_STATS,
  DEMO_TOP_FILES,
} from "../data/demo";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCode2,
  Flame,
  GitCommit,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { activityRowsToChartPoints } from "../utils/dashboard";
import {
  formatScanCommitProgress,
  formatScanEta,
  formatScanProgressPercent,
} from "../utils/scanProgress";
import { timeRangeToQuery } from "../utils/timeRange";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function Dashboard() {
  const {
    repoId,
    workspaceId,
    analysisScopeMode,
    analysisScope,
    timeRange,
    setTimeRange,
    scanProgressByRepo,
    scanningRepoId,
    setScanningRepoId,
    setSyncStatus,
    isDemoMode,
    enableDemoMode,
    disableDemoMode,
  } = useAppContext();
  const dateRange = timeRangeToQuery(timeRange);
  const { data: devStats = [], isLoading } = useDeveloperGlobalStats(
    analysisScope,
    dateRange,
  );
  const { data: activityRows = [] } = useActivityTimeline(analysisScope, dateRange);
  const { data: topFiles = [], isLoading: loadingFiles } = useFileStats(repoId, dateRange);
  const { data: insightRows = [] } = useInsights(analysisScope, dateRange);
  const displayedDevStats = isDemoMode ? DEMO_DEVELOPER_STATS : devStats;
  const displayedActivityRows = isDemoMode ? DEMO_ACTIVITY_TIMELINE : activityRows;
  const displayedTopFiles = isDemoMode ? DEMO_TOP_FILES : topFiles;
  const loadingContributors = isDemoMode ? false : isLoading;
  const loadingTopFiles = isDemoMode ? false : loadingFiles;
  const scan = useTriggerScan();
  const pauseScan = usePauseScan();
  const resumeScan = useResumeScan();
  const { data: persistedScanProgress } = useScanStatus(repoId);
  const scanProgress = repoId
    ? scanProgressByRepo[repoId] ?? persistedScanProgress ?? undefined
    : undefined;
  const hasScanProgress = scanProgress != null;
  const isSelectedRepoScanning =
    repoId != null && (scan.isPending || scanningRepoId === repoId);
  const isScanControlPending = pauseScan.isPending || resumeScan.isPending;
  const scanRunId = scanProgress?.scan_run_id;
  const isScanRunning = scanProgress?.status === "running";
  const canResumeScan =
    scanProgress?.status === "paused" || scanProgress?.status === "failed";
  const syncDisabled = scan.isPending || scanningRepoId !== null || isScanControlPending;
  const pauseDisabled =
    !scanRunId || !isScanRunning || scan.isPending || isScanControlPending;
  const resumeDisabled =
    !scanRunId || !canResumeScan || scan.isPending || isScanControlPending;
  const scanStatusLabel = scanProgress
    ? scanProgress.status.charAt(0).toUpperCase() + scanProgress.status.slice(1)
    : "";
  const scanStatusTone = scanProgress?.status === "failed"
    ? "bg-error-container text-error"
    : scanProgress?.status === "completed"
      ? "bg-tertiary-container text-tertiary"
      : "bg-surface-container-high text-on-surface";
  const scanProgressPercentLabel = scanProgress
    ? formatScanProgressPercent(scanProgress)
    : null;
  const scanEtaLabel = scanProgress ? formatScanEta(scanProgress) : null;

  const handleSyncRepo = () => {
    if (!repoId) return;

    setScanningRepoId(repoId);
    setSyncStatus("Fetching commits…");
    scan.mutate(repoId, {
      onSuccess: () => {
        setScanningRepoId(null);
        setSyncStatus("");
      },
      onError: () => {
        setScanningRepoId(null);
        setSyncStatus("");
      },
    });
  };

  const handlePauseScan = () => {
    if (!scanRunId || pauseDisabled) return;

    pauseScan.mutate(scanRunId);
  };

  const handleResumeScan = () => {
    if (!repoId || resumeDisabled) return;

    resumeScan.mutate(repoId);
  };

  const hasAnalysisTarget =
    isDemoMode ||
    (analysisScopeMode === "workspace" ? workspaceId != null : repoId != null);
  const activityData = activityRowsToChartPoints(displayedActivityRows);
  const activityTotals = displayedActivityRows.reduce(
    (acc, row) => ({
      commits: acc.commits + row.commits,
      insertions: acc.insertions + row.insertions,
      deletions: acc.deletions + row.deletions,
    }),
    { commits: 0, insertions: 0, deletions: 0 },
  );

  const totals = displayedDevStats.reduce(
    (acc, d) => ({
      commits:    acc.commits    + d.total_commits,
      insertions: acc.insertions + d.total_insertions,
      deletions:  acc.deletions  + d.total_deletions,
    }),
    { commits: 0, insertions: 0, deletions: 0 },
  );

  const maxCommits = displayedDevStats.length > 0
    ? Math.max(...displayedDevStats.map((d) => d.total_commits))
    : 1;

  // Most recent committer (by last_commit_at)
  const mostRecent = displayedDevStats
    .filter((d) => d.last_commit_at)
    .sort((a, b) => (b.last_commit_at! > a.last_commit_at! ? 1 : -1))[0];

  // Best streak holder
  const streakHolder = displayedDevStats.reduce<typeof displayedDevStats[0] | null>(
    (best, d) => (!best || d.longest_streak > best.longest_streak ? d : best),
    null,
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Dashboard
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Repository overview at a glance.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          {repoId && (
            <button
              aria-label="Sync selected repository"
              onClick={handleSyncRepo}
              disabled={syncDisabled}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-on-primary gradient-primary disabled:opacity-50 transition-opacity"
            >
              <RefreshCw size={15} className={isSelectedRepoScanning ? "animate-spin" : ""} />
              {isSelectedRepoScanning ? "Scanning…" : "Sync Repo"}
            </button>
          )}
        </div>
      </div>

      <PageHelp
        title="Dashboard basics"
        items={[
          "Start here after the first scan: it summarizes activity, contributors, and files for the selected scope.",
          "Use the time range to switch between historical context and recent movement.",
          "Sync reads local Git history into GitPulse; it does not modify your repository.",
        ]}
      />

      {/* Scan progress */}
      {scanProgress && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "rounded-lg px-4 py-3 text-sm",
            scanStatusTone,
          ].join(" ")}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-center gap-2 font-semibold">
              {scanProgress.status === "failed" ? (
                <AlertCircle size={16} className="shrink-0" />
              ) : scanProgress.status === "completed" ? (
                <CheckCircle2 size={16} className="shrink-0" />
              ) : (
                <RefreshCw size={16} className="shrink-0 animate-spin" />
              )}
              <span className="truncate">{scanStatusLabel}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
              <span className="whitespace-nowrap">
                Commits:{" "}
                <span className="font-semibold">
                  {formatScanCommitProgress(scanProgress)}
                </span>
              </span>
              <span className="whitespace-nowrap">
                Files: <span className="font-semibold">{fmt(scanProgress.files_processed)}</span>
              </span>
              {scanProgressPercentLabel && (
                <span className="whitespace-nowrap font-semibold">
                  {scanProgressPercentLabel}
                </span>
              )}
              {scanEtaLabel && scanProgress.status === "running" && (
                <span className="whitespace-nowrap">ETA {scanEtaLabel}</span>
              )}
            </div>
            {(scanProgress.error || scanProgress.message) && (
              <p className="min-w-0 flex-1 basis-full truncate text-xs opacity-80 sm:basis-auto">
                {scanProgress.error || scanProgress.message}
              </p>
            )}
            {scanProgress.progress_percent != null &&
              Number.isFinite(scanProgress.progress_percent) && (
                <div className="basis-full overflow-hidden rounded-full bg-surface-container-highest">
                  <div
                    className="h-1.5 rounded-full bg-tertiary transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(100, scanProgress.progress_percent))}%`,
                    }}
                  />
                </div>
              )}
            {(isScanRunning || canResumeScan) && (
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {isScanRunning && (
                  <button
                    type="button"
                    onClick={handlePauseScan}
                    disabled={pauseDisabled}
                    className="flex items-center gap-1.5 rounded-full bg-surface-container-highest px-3 py-1.5 text-xs font-semibold text-on-surface disabled:opacity-50 transition-opacity"
                  >
                    <Pause size={13} />
                    Pause
                  </button>
                )}
                {canResumeScan && (
                  <button
                    type="button"
                    onClick={handleResumeScan}
                    disabled={resumeDisabled}
                    className="flex items-center gap-1.5 rounded-full bg-surface-container-highest px-3 py-1.5 text-xs font-semibold text-on-surface disabled:opacity-50 transition-opacity"
                  >
                    <Play size={13} />
                    Resume
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan result / error */}
      {scan.isSuccess && !hasScanProgress && (
        <div className="rounded-lg bg-tertiary-container px-4 py-2 text-tertiary text-sm">
          Scan complete — {scan.data.commits_added} new commits,{" "}
          {scan.data.files_processed} files processed.
        </div>
      )}
      {scan.isError && !hasScanProgress && (
        <div className="rounded-lg bg-error-container px-4 py-2 text-error text-sm">
          Scan failed: {scan.error}
        </div>
      )}

      {isDemoMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-container px-4 py-3 text-primary">
          <div>
            <p className="text-sm font-semibold">Demo Mode</p>
            <p className="text-xs opacity-80">
              Sample data is shown locally. Add and scan a repository to replace it.
            </p>
          </div>
          <button
            type="button"
            onClick={disableDemoMode}
            className="rounded-full bg-surface-container-highest px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Exit Demo
          </button>
        </div>
      )}

      {/* No repo selected */}
      {!hasAnalysisTarget && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          <p>Select a workspace and repository in the sidebar to analyze your data, or try the demo first.</p>
          <button
            type="button"
            onClick={enableDemoMode}
            className="mt-4 rounded-full px-4 py-2 text-sm font-semibold text-on-primary gradient-primary"
          >
            Try Demo
          </button>
        </div>
      )}

      {hasAnalysisTarget && (
        <>
          {!isDemoMode && insightRows.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2
                  className="text-sm uppercase tracking-widest text-on-surface-variant"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Insights Preview
                </h2>
                <Link
                  to="/insights"
                  className="rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-highest"
                >
                  Open Insights
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {insightRows.slice(0, 3).map((insight) => (
                  <article
                    key={insight.insight_key}
                    className="rounded-lg bg-surface-container-low p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                          {insight.category.split("_").join(" ")}
                        </p>
                        <h3
                          className="mt-2 truncate font-bold text-on-surface"
                          style={{ fontFamily: "Space Grotesk, sans-serif" }}
                        >
                          {insight.title}
                        </h3>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-1 text-xs font-semibold text-primary">
                        {insight.severity}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-on-surface-variant">
                      {insight.summary}
                    </p>
                    <p className="mt-3 truncate font-mono text-xs text-on-surface-variant">
                      {insight.entity_label}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Summary stats */}
          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              All-Time Totals
              <HelpTooltip label="What are all-time totals?" className="ml-1.5">
                Totals add up commits, insertions, and deletions for the selected scope and time range.
              </HelpTooltip>
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Commits"    value={fmt(totals.commits)}    accent />
              <StatCard label="Insertions" value={`+${fmt(totals.insertions)}`} />
              <StatCard label="Deletions"  value={`−${fmt(totals.deletions)}`} />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2
                className="text-sm uppercase tracking-widest text-on-surface-variant"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Activity Timeline
                <HelpTooltip label="What is the activity timeline?" className="ml-1.5">
                  This chart shows commit volume by date for the selected repository or workspace.
                </HelpTooltip>
              </h2>
              <div className="flex gap-3 text-xs text-on-surface-variant">
                <span>{fmt(activityTotals.commits)} commits</span>
                <span className="text-tertiary">+{fmt(activityTotals.insertions)}</span>
                <span className="text-error">-{fmt(activityTotals.deletions)}</span>
              </div>
            </div>
            <div
              className="bg-surface-container-high rounded-lg px-4 pt-4 pb-2"
              role="img"
              aria-label={`Activity timeline with ${fmt(activityTotals.commits)} commits, ${fmt(activityTotals.insertions)} insertions, and ${fmt(activityTotals.deletions)} deletions.`}
            >
              <ActivityChart
                data={activityData}
                valueLabel="Commits"
                color="#ffb599"
                height={180}
              />
            </div>
          </section>

          {/* Spotlight cards */}
          {(mostRecent || streakHolder) && (
            <section>
              <h2
                className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Spotlights
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {mostRecent && (
                  <div className="bg-surface-container-high rounded-lg px-4 py-3 flex items-center gap-3">
                    <div className="rounded-full bg-surface-container-highest p-2">
                      <Clock size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-on-surface-variant">Last Active</p>
                      <p
                        className="font-semibold text-on-surface truncate"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {mostRecent.developer_name}
                      </p>
                      <p className="text-xs text-on-surface-variant font-mono">
                        {mostRecent.last_commit_at?.slice(0, 10) ?? "—"}
                      </p>
                    </div>
                  </div>
                )}
                {streakHolder && streakHolder.longest_streak > 0 && (
                  <div className="bg-surface-container-high rounded-lg px-4 py-3 flex items-center gap-3">
                    <div className="rounded-full bg-surface-container-highest p-2">
                      <Flame size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-on-surface-variant">Best Streak</p>
                      <p
                        className="font-semibold text-on-surface truncate"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {streakHolder.developer_name}
                      </p>
                      <p className="text-xs text-primary font-bold" style={{ fontFamily: "Public Sans, sans-serif" }}>
                        {streakHolder.longest_streak} days consecutive
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Top contributors */}
          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Top Contributors
              <HelpTooltip label="How are top contributors ranked?" className="ml-1.5">
                Contributors are sorted by commit volume in the selected scope. Clean aliases first if one person appears under multiple names.
              </HelpTooltip>
            </h2>
            {loadingContributors ? (
              <div className="text-on-surface-variant text-sm">Loading…</div>
            ) : displayedDevStats.length === 0 ? (
              <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant text-sm">
                No data yet. Sync a repository first.
              </div>
            ) : (
              <div className="space-y-2">
                {displayedDevStats.slice(0, 8).map((d, i) => {
                  const barPct = maxCommits > 0
                    ? (d.total_commits / maxCommits) * 100
                    : 0;
                  return (
                    <div
                      key={d.developer_id}
                      className={[
                        "bg-surface-container-high rounded-lg px-4 py-3 relative overflow-hidden",
                        i === 0 ? "accent-bar pl-5" : "",
                      ].join(" ")}
                    >
                      {/* Background bar */}
                      <div
                        className="absolute inset-y-0 left-0 opacity-[0.06] pointer-events-none transition-all duration-700"
                        style={{
                          width: `${barPct}%`,
                          background: "linear-gradient(90deg, #f26522, transparent)",
                        }}
                      />

                      <div className="flex items-center justify-between relative">
                        <div className="min-w-0 flex-1 mr-4">
                          <div className="flex items-center gap-2">
                            <p
                              className="font-semibold text-on-surface truncate"
                              style={{ fontFamily: "Space Grotesk, sans-serif" }}
                            >
                              {d.developer_name}
                            </p>
                            {d.longest_streak >= 3 && (
                              <span className="flex items-center gap-0.5 text-xs text-primary font-semibold shrink-0">
                                <Flame size={11} />
                                {d.longest_streak}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            {d.active_days} active days
                            {d.last_commit_at && (
                              <span className="ml-2 font-mono">
                                · last {d.last_commit_at.slice(0, 10)}
                              </span>
                            )}
                          </p>
                          {/* Commit bar */}
                          <div className="mt-2 h-1 rounded-full bg-surface-container-highest overflow-hidden">
                            <div
                              className="h-full rounded-full gradient-primary transition-all duration-700"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className="text-lg font-bold text-primary"
                            style={{ fontFamily: "Public Sans, sans-serif" }}
                          >
                            {fmt(d.total_commits)}
                          </p>
                          <p className="text-xs text-on-surface-variant flex items-center gap-1 justify-end">
                            <GitCommit size={10} />
                            commits
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Top Files
              <HelpTooltip label="What are top files?" className="ml-1.5">
                Files with the most commits in the selected repository and range. Co-touch shows how often a file changes with other files.
              </HelpTooltip>
            </h2>
            {loadingTopFiles ? (
              <div className="text-on-surface-variant text-sm">Loading…</div>
            ) : displayedTopFiles.length === 0 ? (
              <div className="rounded-lg bg-surface-container-low p-6 text-center text-on-surface-variant text-sm">
                No file data for the selected repository and range.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {displayedTopFiles.slice(0, 8).map((file) => (
                  <div
                    key={file.file_id}
                    className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-container-high px-4 py-3"
                    title={file.file_path}
                  >
                    <FileCode2 size={15} className="shrink-0 text-on-surface-variant" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-on-surface">
                        {file.file_path}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {file.unique_authors} authors · co-touch {file.co_touch_score.toFixed(1)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-primary">
                        {fmt(file.commit_count)}
                      </p>
                      <p className="text-xs text-on-surface-variant">commits</p>
                    </div>
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
