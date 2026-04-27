import { useState } from "react";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import FieldHint from "../components/FieldHint";
import HelpTooltip from "../components/HelpTooltip";
import PageHelp from "../components/PageHelp";
import {
  useActivitySignalStats,
  useDeveloperFocusStats,
  useDirectoryHealthStats,
  useFileCouplingGraph,
  useFileHealthStats,
  useFileVolatilityStats,
  useReviewRiskCommits,
} from "../hooks/useCodeHealth";
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

function formatScore(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMetric(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  });
}

export default function CodeHealth() {
  const { repoId } = useAppContext();
  const [period, setPeriod] = useState<PeriodSelection>(() => currentPeriod());
  const { data: files = [], isLoading: loadingFiles } = useFileHealthStats(
    repoId,
    period,
  );
  const { data: directories = [], isLoading: loadingDirectories } =
    useDirectoryHealthStats(repoId, period);
  const { data: focusRows = [], isLoading: loadingFocus } =
    useDeveloperFocusStats(repoId, period);
  const { data: riskCommits = [], isLoading: loadingRisk } =
    useReviewRiskCommits(repoId, period);
  const { data: activitySignals = [], isLoading: loadingSignals } =
    useActivitySignalStats(repoId, period);
  const { data: volatilityRows = [], isLoading: loadingVolatility } =
    useFileVolatilityStats(repoId, period);
  const { data: couplingRows = [], isLoading: loadingCoupling } =
    useFileCouplingGraph(repoId, period);

  const loading = loadingFiles || loadingDirectories;
  const loadingAdvanced =
    loadingFocus ||
    loadingRisk ||
    loadingSignals ||
    loadingVolatility ||
    loadingCoupling;
  const hotspotFiles = files.filter((file) => file.hotspot_score >= 70).length;
  const siloFiles = files.filter((file) => file.silo_risk).length;
  const averageDirectoryHealth =
    directories.length > 0
      ? directories.reduce((sum, row) => sum + row.directory_health_score, 0) /
        directories.length
      : 0;
  const topRiskScore = riskCommits[0]?.risk_score ?? 0;
  const topVolatilityScore = volatilityRows[0]?.volatility_score ?? 0;
  const topActivitySignal = activitySignals[0]?.dominant_signal ?? "-";

  const updatePeriodType = (periodType: PeriodType) => {
    setPeriod({ periodType, periodKey: defaultKeyForType(periodType) });
  };

  if (!repoId) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a repository in the sidebar.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Code Health
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Hotspots, ownership risk and maintainer coverage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Code health period type"
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
            aria-label="Code health period key"
            aria-describedby="code-health-period-key-hint"
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

      <PageHelp
        title="Code health guide"
        items={[
          "Hotspots are files with high activity and risk signals; review them before broad refactors.",
          "Silo risk means one owner dominates a file, so knowledge may be concentrated.",
          "Review risk, volatility, and coupling are directional signals; use them to decide where to inspect next.",
        ]}
      />
      <FieldHint id="code-health-period-key-hint">
        Use formats like <code className="text-primary">2026-04</code>, <code className="text-primary">2026-Q2</code>, <code className="text-primary">2026</code>, or <code className="text-primary">all</code> depending on the period type.
      </FieldHint>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Files" value={files.length} accent />
        <StatCard label="Hotspots" value={hotspotFiles} />
        <StatCard label="Silo Risk" value={siloFiles} />
        <StatCard
          label="Directory Risk"
          value={formatScore(averageDirectoryHealth)}
        />
        <StatCard label="Review Risk" value={formatScore(topRiskScore)} />
        <StatCard label="Volatility" value={formatScore(topVolatilityScore)} />
        <StatCard label="Couplings" value={couplingRows.length} />
        <StatCard label="Signal" value={topActivitySignal} />
      </div>

      <section>
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          File Hotspots
          <HelpTooltip label="What is a hotspot?" className="ml-1.5">
            A hotspot is a file with enough activity, churn, ownership, or coupling signals to deserve attention.
          </HelpTooltip>
        </h2>
        {loadingFiles ? (
          <p className="text-on-surface-variant text-sm">Loading...</p>
        ) : files.length === 0 ? (
          <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
            No file health data for this period. Sync the repository first.
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden bg-surface-container-low">
            <div
              className="grid px-4 py-2 text-xs uppercase tracking-widest text-on-surface-variant"
              style={{ gridTemplateColumns: "1fr 86px 86px 92px 110px 92px" }}
            >
              <span>File</span>
              <span className="text-right">Hotspot</span>
              <span className="text-right">Churn</span>
              <span className="text-right">Authors</span>
              <span className="text-right">Owner</span>
              <span className="text-right">Bus</span>
            </div>
            {files.slice(0, 30).map((file, index) => (
              <div
                key={file.file_id}
                className={[
                  "grid items-center px-4 py-3 transition-colors",
                  index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container",
                  "hover:bg-surface-container-highest",
                ].join(" ")}
                style={{ gridTemplateColumns: "1fr 86px 86px 92px 110px 92px" }}
              >
                <div className="min-w-0">
                  <span className="block truncate font-mono text-sm text-on-surface">
                    {file.file_path}
                  </span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {file.primary_owner_name ?? "No owner"}
                  </span>
                </div>
                <span className="text-right font-semibold text-primary">
                  {formatScore(file.hotspot_score)}
                </span>
                <span className="text-right text-on-surface-variant">
                  {formatScore(file.churn_score)}
                </span>
                <span className="text-right text-on-surface-variant">
                  {file.unique_authors}
                </span>
                <span className="text-right text-on-surface-variant">
                  {formatPercent(file.primary_owner_share)}
                </span>
                <span className="text-right text-on-surface-variant">
                  {file.bus_factor}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Directory Health
          <HelpTooltip label="What is directory risk?" className="ml-1.5">
            Directory risk summarizes file hotspots, churn, and silo signals under the same folder.
          </HelpTooltip>
        </h2>
        {loading ? (
          <p className="text-on-surface-variant text-sm">Loading...</p>
        ) : directories.length === 0 ? (
          <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
            No directory health data for this period. Sync the repository first.
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden bg-surface-container-low">
            <div
              className="grid px-4 py-2 text-xs uppercase tracking-widest text-on-surface-variant"
              style={{ gridTemplateColumns: "1fr 90px 90px 96px 96px 90px" }}
            >
              <span>Directory</span>
              <span className="text-right">Risk</span>
              <span className="text-right">Files</span>
              <span className="text-right">Hotspots</span>
              <span className="text-right">Silos</span>
              <span className="text-right">Churn</span>
            </div>
            {directories.map((directory, index) => (
              <div
                key={directory.directory_path || "root"}
                className={[
                  "grid items-center px-4 py-3 transition-colors",
                  index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container",
                  "hover:bg-surface-container-highest",
                ].join(" ")}
                style={{ gridTemplateColumns: "1fr 90px 90px 96px 96px 90px" }}
              >
                <span className="min-w-0 truncate font-mono text-sm text-on-surface">
                  {directory.directory_path || "root"}
                </span>
                <span className="text-right font-semibold text-primary">
                  {formatScore(directory.directory_health_score)}
                </span>
                <span className="text-right text-on-surface-variant">
                  {directory.files_touched}
                </span>
                <span className="text-right text-on-surface-variant">
                  {directory.hotspot_file_count}
                </span>
                <span className="text-right text-on-surface-variant">
                  {directory.silo_file_count}
                </span>
                <span className="text-right text-on-surface-variant">
                  {formatScore(directory.churn_score)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Developer Focus
          <HelpTooltip label="What is developer focus?" className="ml-1.5">
            Focus compares how concentrated a developer's work is versus frequent switching across files and directories.
          </HelpTooltip>
        </h2>
        {loadingFocus ? (
          <p className="text-on-surface-variant text-sm">Loading...</p>
        ) : focusRows.length === 0 ? (
          <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
            No focus data for this period. Sync the repository first.
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden bg-surface-container-low">
            <div
              className="grid px-4 py-2 text-xs uppercase tracking-widest text-on-surface-variant"
              style={{ gridTemplateColumns: "1fr 90px 90px 96px 96px 120px" }}
            >
              <span>Developer</span>
              <span className="text-right">Focus</span>
              <span className="text-right">Switch</span>
              <span className="text-right">Files</span>
              <span className="text-right">Dirs</span>
              <span className="text-right">Profile</span>
            </div>
            {focusRows.slice(0, 20).map((developer, index) => (
              <div
                key={developer.developer_id}
                className={[
                  "grid items-center px-4 py-3 transition-colors",
                  index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container",
                  "hover:bg-surface-container-highest",
                ].join(" ")}
                style={{ gridTemplateColumns: "1fr 90px 90px 96px 96px 120px" }}
              >
                <div className="min-w-0">
                  <span className="block truncate font-semibold text-on-surface">
                    {developer.developer_name}
                  </span>
                  <span className="block text-xs text-on-surface-variant">
                    {developer.commits} commits / {developer.active_days} days
                  </span>
                </div>
                <span className="text-right font-semibold text-primary">
                  {formatScore(developer.focus_score)}
                </span>
                <span className="text-right text-on-surface-variant">
                  {formatScore(developer.context_switching_index)}
                </span>
                <span className="text-right text-on-surface-variant">
                  {developer.files_touched}
                </span>
                <span className="text-right text-on-surface-variant">
                  {developer.directories_touched}
                </span>
                <span className="text-right text-on-surface-variant">
                  {developer.profile_label}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div>
          <h2
            className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Review Risk Proxy
            <HelpTooltip label="What is review risk?" className="ml-1.5">
              Review risk flags commits that touched many files or directories and may need closer review.
            </HelpTooltip>
          </h2>
          {loadingRisk ? (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          ) : riskCommits.length === 0 ? (
            <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
              No risky commits for this period.
            </div>
          ) : (
            <div className="space-y-2">
              {riskCommits.slice(0, 8).map((commit) => (
                <article
                  key={commit.commit_id}
                  className="rounded-lg bg-surface-container-low p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">
                        {commit.message || commit.sha.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {commit.developer_name} / {commit.files_changed} files /{" "}
                        {commit.directories_touched} dirs
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-semibold text-primary">
                      {formatScore(commit.risk_score)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-on-surface-variant">
                    +{formatMetric(commit.insertions)} / -
                    {formatMetric(commit.deletions)} / co-touch{" "}
                    {formatScore(commit.max_file_co_touch_score)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2
            className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Activity Signals
            <HelpTooltip label="What are activity signals?" className="ml-1.5">
              Activity signals estimate whether a period looks more feature-heavy, refactor-heavy, or cleanup-heavy.
            </HelpTooltip>
          </h2>
          {loadingSignals ? (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          ) : activitySignals.length === 0 ? (
            <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
              No activity signal for this period.
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden bg-surface-container-low">
              <div
                className="grid px-4 py-2 text-xs uppercase tracking-widest text-on-surface-variant"
                style={{ gridTemplateColumns: "1fr 88px 88px 88px 110px" }}
              >
                <span>Bucket</span>
                <span className="text-right">Feature</span>
                <span className="text-right">Refactor</span>
                <span className="text-right">Cleanup</span>
                <span className="text-right">Signal</span>
              </div>
              {activitySignals.slice(0, 12).map((signal, index) => (
                <div
                  key={signal.period_bucket}
                  className={[
                    "grid items-center px-4 py-3 transition-colors",
                    index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container",
                    "hover:bg-surface-container-highest",
                  ].join(" ")}
                  style={{ gridTemplateColumns: "1fr 88px 88px 88px 110px" }}
                >
                  <span className="min-w-0 truncate font-mono text-sm text-on-surface">
                    {signal.period_bucket}
                  </span>
                  <span className="text-right text-on-surface-variant">
                    {formatScore(signal.feature_score)}
                  </span>
                  <span className="text-right text-on-surface-variant">
                    {formatScore(signal.refactor_score)}
                  </span>
                  <span className="text-right text-on-surface-variant">
                    {formatScore(signal.cleanup_score)}
                  </span>
                  <span className="text-right font-semibold text-primary">
                    {signal.dominant_signal}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div>
          <h2
            className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Code Volatility
            <HelpTooltip label="What is volatility?" className="ml-1.5">
              Volatility highlights files that keep changing across multiple weeks, especially with repeated churn.
            </HelpTooltip>
          </h2>
          {loadingVolatility ? (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          ) : volatilityRows.length === 0 ? (
            <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
              No volatile files for this period.
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden bg-surface-container-low">
              <div
                className="grid px-4 py-2 text-xs uppercase tracking-widest text-on-surface-variant"
                style={{ gridTemplateColumns: "1fr 86px 86px 90px" }}
              >
                <span>File</span>
                <span className="text-right">Volatility</span>
                <span className="text-right">Weeks</span>
                <span className="text-right">Churn</span>
              </div>
              {volatilityRows.slice(0, 12).map((file, index) => (
                <div
                  key={file.file_id}
                  className={[
                    "grid items-center px-4 py-3 transition-colors",
                    index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container",
                    "hover:bg-surface-container-highest",
                  ].join(" ")}
                  style={{ gridTemplateColumns: "1fr 86px 86px 90px" }}
                >
                  <div className="min-w-0">
                    <span className="block truncate font-mono text-sm text-on-surface">
                      {file.file_path}
                    </span>
                    <span className="block text-xs text-on-surface-variant">
                      {file.commits} commits / {file.unique_authors} authors
                    </span>
                  </div>
                  <span className="text-right font-semibold text-primary">
                    {formatScore(file.volatility_score)}
                  </span>
                  <span className="text-right text-on-surface-variant">
                    {file.active_weeks}
                  </span>
                  <span className="text-right text-on-surface-variant">
                    {formatMetric(file.churn)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2
            className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Coupling Graph
            <HelpTooltip label="What is coupling?" className="ml-1.5">
              Coupling shows file pairs that often change in the same commits. Strong pairs may hide design dependencies.
            </HelpTooltip>
          </h2>
          {loadingCoupling ? (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          ) : couplingRows.length === 0 ? (
            <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
              No coupled file pairs for this period.
            </div>
          ) : (
            <div className="space-y-2">
              {couplingRows.slice(0, 10).map((pair) => (
                <article
                  key={`${pair.source_file_id}-${pair.target_file_id}`}
                  className="rounded-lg bg-surface-container-low p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate font-mono text-sm text-on-surface">
                        {pair.source_file_path}
                      </p>
                      <p className="truncate font-mono text-sm text-on-surface-variant">
                        {pair.target_file_path}
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-semibold text-primary">
                      {formatScore(pair.coupling_score)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-on-surface-variant">
                    {pair.co_touch_count} shared commits
                    {pair.last_touched_at ? ` / ${pair.last_touched_at}` : ""}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {loadingAdvanced && (
        <p className="text-xs text-on-surface-variant">
          Advanced metrics are still loading.
        </p>
      )}
    </div>
  );
}
