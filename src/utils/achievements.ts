import type { AchievementRow, FileGlobalRow } from "../types";
import type { ActivitySummary } from "./compare";

interface BuildCodeHealthAchievementsInput {
  currentFiles: FileGlobalRow[];
  previousFiles: FileGlobalRow[];
  currentActivity: ActivitySummary;
  previousActivity: ActivitySummary;
}

function hotspotCount(files: FileGlobalRow[]): number {
  return files.filter((file) => file.churn_score + file.co_touch_score >= 70).length;
}

function siloRiskCount(files: FileGlobalRow[]): number {
  return files.filter((file) => file.unique_authors <= 1 && file.commit_count >= 2).length;
}

function volatileFileCount(files: FileGlobalRow[]): number {
  return files.filter((file) => file.commit_count >= 3).length;
}

function improvement(
  previous: number,
  current: number,
  achievement: Omit<AchievementRow, "metric_value" | "tone">,
): AchievementRow | null {
  if (previous <= current) return null;

  return {
    ...achievement,
    metric_value: previous - current,
    tone: "positive",
  };
}

export function buildCodeHealthAchievements({
  currentFiles,
  previousFiles,
  currentActivity,
}: BuildCodeHealthAchievementsInput): AchievementRow[] {
  const currentHotspots = hotspotCount(currentFiles);
  const previousHotspots = hotspotCount(previousFiles);
  const currentSilos = siloRiskCount(currentFiles);
  const previousSilos = siloRiskCount(previousFiles);
  const currentVolatileFiles = volatileFileCount(currentFiles);
  const previousVolatileFiles = volatileFileCount(previousFiles);

  const achievements = [
    improvement(previousHotspots, currentHotspots, {
      achievement_key: "hotspot_cooled_down",
      title: "Hotspot cooled down",
      summary: `Hotspot files dropped from ${previousHotspots} to ${currentHotspots}.`,
      route: "/health",
    }),
    improvement(previousSilos, currentSilos, {
      achievement_key: "knowledge_spread",
      title: "Knowledge spread",
      summary: `Silo-risk files dropped from ${previousSilos} to ${currentSilos}.`,
      route: "/health",
    }),
    improvement(previousVolatileFiles, currentVolatileFiles, {
      achievement_key: "volatility_reduced",
      title: "Volatility reduced",
      summary: `Volatile files dropped from ${previousVolatileFiles} to ${currentVolatileFiles}.`,
      route: "/health",
    }),
  ].filter((achievement): achievement is AchievementRow => achievement != null);

  if (currentActivity.deletions > currentActivity.insertions) {
    achievements.push({
      achievement_key: "cleanup_week",
      title: "Cleanup week",
      summary: `Net cleanup of ${currentActivity.deletions - currentActivity.insertions} lines in the selected period.`,
      metric_value: currentActivity.deletions - currentActivity.insertions,
      tone: "positive",
      route: "/reports",
    });
  }

  return achievements;
}
