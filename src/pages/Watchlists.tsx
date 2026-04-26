import { useMemo, useState } from "react";
import { BookmarkPlus, Trash2 } from "lucide-react";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import { useWatchlist } from "../hooks/useWatchlist";
import { useActivityTimeline, useFileStats } from "../hooks/useStats";
import type { FileGlobalRow, WatchlistItemType } from "../types";
import {
  buildMetricDelta,
  previousRangeQuery,
  summarizeActivity,
  type MetricDelta,
} from "../utils/compare";
import { timeRangeToQuery } from "../utils/timeRange";

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  });
}

function formatDelta(delta: MetricDelta): string {
  const sign = delta.delta > 0 ? "+" : "";
  return `${sign}${formatNumber(delta.delta)}`;
}

function deltaClass(delta: MetricDelta): string {
  if (delta.delta > 0) return "text-primary";
  if (delta.delta < 0) return "text-error";
  return "text-on-surface-variant";
}

function hotspotCount(rows: FileGlobalRow[]): number {
  return rows.filter((row) => row.churn_score + row.co_touch_score >= 70).length;
}

function siloCount(rows: FileGlobalRow[]): number {
  return rows.filter((row) => row.unique_authors <= 1 && row.commit_count >= 2).length;
}

function volatilityCount(rows: FileGlobalRow[]): number {
  return rows.filter((row) => row.commit_count >= 3).length;
}

function topFileLabel(rows: FileGlobalRow[]): string {
  const topFile = rows[0];
  if (!topFile) return "No file activity";
  return topFile.file_path;
}

function typeLabel(type: WatchlistItemType): string {
  if (type === "repo") return "Repository";
  if (type === "directory") return "Directory";
  return "File";
}

export default function Watchlists() {
  const {
    analysisScope,
    analysisScopeMode,
    repoId,
    workspaceId,
    timeRange,
    addNotification,
  } = useAppContext();
  const { items, addItem, removeItem } = useWatchlist();
  const [type, setType] = useState<WatchlistItemType>("file");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");

  const currentRange = timeRangeToQuery(timeRange);
  const previousRange = previousRangeQuery(timeRange);
  const { data: currentActivity = [], isLoading: loadingCurrentActivity } =
    useActivityTimeline(analysisScope, currentRange);
  const { data: previousActivity = [], isLoading: loadingPreviousActivity } =
    useActivityTimeline(
      analysisScope,
      previousRange ?? { fromDate: "", toDate: "" },
    );
  const { data: currentFiles = [], isLoading: loadingCurrentFiles } = useFileStats(
    repoId,
    currentRange,
  );
  const { data: previousFiles = [], isLoading: loadingPreviousFiles } = useFileStats(
    repoId,
    previousRange,
  );

  const hasAnalysisTarget =
    analysisScopeMode === "workspace" ? workspaceId != null : repoId != null;
  const hasPreviousRange = previousRange != null;
  const loading =
    loadingCurrentActivity ||
    loadingPreviousActivity ||
    loadingCurrentFiles ||
    loadingPreviousFiles;

  const trackedItems = items.filter((item) => {
    if (analysisScopeMode === "workspace") {
      return item.workspaceId === workspaceId;
    }
    return item.repoId === repoId;
  });

  const activityDeltas = useMemo(() => {
    const current = summarizeActivity(currentActivity);
    const previous = summarizeActivity(previousActivity);

    return [
      buildMetricDelta("Commits", current.commits, previous.commits),
      buildMetricDelta("Churn", current.churn, previous.churn),
      buildMetricDelta("Files Touched", current.filesTouched, previous.filesTouched),
    ];
  }, [currentActivity, previousActivity]);

  const healthDeltas = useMemo(
    () => [
      buildMetricDelta(
        "Hotspots",
        hotspotCount(currentFiles),
        hotspotCount(previousFiles),
      ),
      buildMetricDelta("Silo Risks", siloCount(currentFiles), siloCount(previousFiles)),
      buildMetricDelta(
        "Volatile Files",
        volatilityCount(currentFiles),
        volatilityCount(previousFiles),
      ),
    ],
    [currentFiles, previousFiles],
  );

  const addManualWatch = () => {
    const trimmedTarget = target.trim();
    if (trimmedTarget === "") {
      addNotification("Choose a target to watch", "error");
      return;
    }

    addItem({
      type,
      label: label.trim() || trimmedTarget,
      target: trimmedTarget,
      repoId,
      workspaceId,
    });
    setTarget("");
    setLabel("");
    addNotification("Watch added", "success");
  };

  const watchSelectedRepo = () => {
    if (!repoId) return;
    addItem({
      type: "repo",
      label: "Selected repository",
      target: repoId,
      repoId,
      workspaceId,
    });
    addNotification("Repository added to watchlist", "success");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Watchlists & Compare
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Track important code areas and compare the selected period with the previous one.
          </p>
        </div>
        <button
          type="button"
          onClick={watchSelectedRepo}
          disabled={!repoId}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <BookmarkPlus size={16} />
          Watch Repo
        </button>
      </div>

      {!hasAnalysisTarget && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a repository or workspace in the sidebar.
        </div>
      )}

      {hasAnalysisTarget && (
        <>
          {!hasPreviousRange && (
            <div className="rounded-lg bg-surface-container-low p-4 text-sm text-on-surface-variant">
              Choose a bounded time range to enable period comparison.
            </div>
          )}

          <section className="grid gap-3 lg:grid-cols-[360px_1fr]">
            <div className="rounded-lg bg-surface-container-low p-4">
              <h2
                className="text-sm uppercase tracking-widest text-on-surface-variant"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Add Watch
              </h2>
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-on-surface-variant">
                  Watch type
                  <select
                    aria-label="Watch type"
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as WatchlistItemType)
                    }
                    className="mt-1 w-full rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                  >
                    <option value="file">File</option>
                    <option value="directory">Directory</option>
                    <option value="repo">Repository</option>
                  </select>
                </label>
                <label className="block text-xs text-on-surface-variant">
                  Target
                  <input
                    aria-label="Target"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder="src/app.ts or src/features"
                    className="mt-1 w-full rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </label>
                <label className="block text-xs text-on-surface-variant">
                  Label
                  <input
                    aria-label="Label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Optional display name"
                    className="mt-1 w-full rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </label>
                <button
                  type="button"
                  onClick={addManualWatch}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Add Watch
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-surface-container-low p-4">
              <h2
                className="text-sm uppercase tracking-widest text-on-surface-variant"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Tracked Areas
              </h2>
              {trackedItems.length === 0 ? (
                <div className="mt-4 rounded-lg bg-surface-container p-8 text-center text-sm text-on-surface-variant">
                  No tracked areas yet.
                </div>
              ) : (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {trackedItems.map((item) => (
                    <article
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-surface-container p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                          {typeLabel(item.type)}
                        </p>
                        <h3 className="mt-1 truncate text-sm font-semibold text-on-surface">
                          {item.label}
                        </h3>
                        <p className="mt-1 truncate font-mono text-xs text-on-surface-variant">
                          {item.target}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => removeItem(item.id)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
                      >
                        <Trash2 size={15} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Period Compare
            </h2>
            {loading ? (
              <p className="text-on-surface-variant text-sm">Loading...</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {activityDeltas.map((delta, index) => (
                  <StatCard
                    key={delta.label}
                    label={delta.label}
                    value={formatDelta(delta)}
                    accent={index === 0}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2
                className="text-sm uppercase tracking-widest text-on-surface-variant"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Code Area Delta
              </h2>
              <p className="text-xs text-on-surface-variant">
                Top file: {topFileLabel(currentFiles)}
              </p>
            </div>
            {!repoId ? (
              <div className="rounded-lg bg-surface-container-low p-6 text-center text-sm text-on-surface-variant">
                File-level deltas need a selected repository.
              </div>
            ) : (
              <div className="rounded-lg bg-surface-container-low p-4">
                <div className="grid gap-2 md:grid-cols-3">
                  {healthDeltas.map((delta) => (
                    <div
                      key={delta.label}
                      className="rounded-lg bg-surface-container p-4"
                    >
                      <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                        {delta.label}
                      </p>
                      <p
                        className={[
                          "mt-2 text-2xl font-bold",
                          deltaClass(delta),
                        ].join(" ")}
                        style={{ fontFamily: "Public Sans, sans-serif" }}
                      >
                        {formatDelta(delta)}
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {formatNumber(delta.current)} current /{" "}
                        {formatNumber(delta.previous)} previous
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
