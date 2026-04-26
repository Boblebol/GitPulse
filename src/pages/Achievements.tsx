import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BellOff, RotateCcw, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import { useActivityTimeline, useFileStats } from "../hooks/useStats";
import {
  buildCodeHealthAchievements,
} from "../utils/achievements";
import {
  previousRangeQuery,
  summarizeActivity,
} from "../utils/compare";
import { timeRangeToQuery } from "../utils/timeRange";
import {
  clearDismissedAchievements,
  dismissAchievement,
  loadDismissedAchievements,
} from "../utils/achievementDismissals";

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function scopeBucket(mode: string, workspaceId: string | null, repoId: string | null): string {
  if (mode === "workspace") return `workspace:${workspaceId ?? "none"}`;
  return `repo:${repoId ?? "none"}`;
}

export default function Achievements() {
  const {
    analysisScope,
    analysisScopeMode,
    repoId,
    workspaceId,
    timeRange,
  } = useAppContext();
  const currentRange = timeRangeToQuery(timeRange);
  const previousRange = previousRangeQuery(timeRange);
  const hasPreviousRange = previousRange != null;
  const hasAnalysisTarget =
    analysisScopeMode === "workspace" ? workspaceId != null : repoId != null;

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

  const currentSummary = useMemo(
    () => summarizeActivity(currentActivity),
    [currentActivity],
  );
  const previousSummary = useMemo(
    () => summarizeActivity(previousActivity),
    [previousActivity],
  );
  const achievements = useMemo(
    () =>
      hasPreviousRange
        ? buildCodeHealthAchievements({
            currentFiles,
            previousFiles,
            currentActivity: currentSummary,
            previousActivity: previousSummary,
          })
        : [],
    [
      currentFiles,
      currentSummary,
      hasPreviousRange,
      previousFiles,
      previousSummary,
    ],
  );
  const dismissalBucket = useMemo(
    () =>
      [
        scopeBucket(analysisScopeMode, workspaceId, repoId),
        currentRange.fromDate,
        currentRange.toDate,
      ].join(":"),
    [analysisScopeMode, currentRange.fromDate, currentRange.toDate, repoId, workspaceId],
  );
  const [dismissedKeys, setDismissedKeys] = useState<string[]>(() =>
    loadDismissedAchievements(dismissalBucket),
  );

  useEffect(() => {
    setDismissedKeys(loadDismissedAchievements(dismissalBucket));
  }, [dismissalBucket]);

  const dismissedSet = useMemo(() => new Set(dismissedKeys), [dismissedKeys]);
  const visibleAchievements = useMemo(
    () =>
      achievements.filter(
        (achievement) => !dismissedSet.has(achievement.achievement_key),
      ),
    [achievements, dismissedSet],
  );
  const ignoredCount = achievements.length - visibleAchievements.length;
  const loading =
    loadingCurrentActivity ||
    loadingPreviousActivity ||
    loadingCurrentFiles ||
    loadingPreviousFiles;

  const ignoreAchievement = (achievementKey: string) => {
    setDismissedKeys(dismissAchievement(dismissalBucket, achievementKey));
  };

  const showIgnored = () => {
    setDismissedKeys(clearDismissedAchievements(dismissalBucket));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Achievements
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Code health wins for the selected period.
          </p>
        </div>
        {ignoredCount > 0 && (
          <button
            type="button"
            onClick={showIgnored}
            className="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <RotateCcw size={16} />
            Show ignored
          </button>
        )}
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
              Choose a bounded time range to unlock achievements.
            </div>
          )}

          <section className="grid gap-3 md:grid-cols-3">
            <StatCard
              label="Achievements"
              value={visibleAchievements.length}
              sub={`${ignoredCount} ignored`}
              accent
            />
            <StatCard
              label="Cleanup Delta"
              value={formatNumber(currentSummary.deletions - currentSummary.insertions)}
              sub="Deletions minus insertions"
            />
            <StatCard
              label="Churn"
              value={formatNumber(currentSummary.churn)}
              sub={`${formatNumber(currentSummary.filesTouched)} files touched`}
            />
          </section>

          <section className="rounded-lg bg-surface-container-low p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="text-primary" />
              <h2
                className="text-sm uppercase tracking-widest text-on-surface-variant"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Code Health Achievements
              </h2>
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-on-surface-variant">Loading...</p>
            ) : visibleAchievements.length === 0 ? (
              <div className="mt-4 rounded-lg bg-surface-container p-8 text-center text-sm text-on-surface-variant">
                No code health achievements for this period yet.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {visibleAchievements.map((achievement) => (
                  <article
                    key={achievement.achievement_key}
                    className="rounded-lg bg-surface-container p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-primary">
                          Health win
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-on-surface">
                          {achievement.title}
                        </h3>
                      </div>
                      <div className="rounded-lg bg-surface-container-high px-3 py-2 text-right">
                        <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                          Impact
                        </p>
                        <p className="text-xl font-bold text-on-surface">
                          {formatNumber(achievement.metric_value)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-on-surface-variant">
                      {achievement.summary}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={achievement.route}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        Open signal
                        <ArrowRight size={15} />
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          ignoreAchievement(achievement.achievement_key)
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                        aria-label={`Ignore ${achievement.title}`}
                      >
                        <BellOff size={15} />
                        Ignore
                      </button>
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
