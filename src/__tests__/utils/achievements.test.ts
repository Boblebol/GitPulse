import type { FileGlobalRow } from "../../types";
import type { ActivitySummary } from "../../utils/compare";
import { buildCodeHealthAchievements } from "../../utils/achievements";

function file(overrides: Partial<FileGlobalRow>): FileGlobalRow {
  return {
    file_id: "file",
    file_path: "src/app.ts",
    commit_count: 1,
    total_insertions: 0,
    total_deletions: 0,
    unique_authors: 2,
    churn_score: 10,
    co_touch_score: 5,
    first_seen_at: "2026-04-20",
    last_seen_at: "2026-04-26",
    ...overrides,
  };
}

const emptyActivity: ActivitySummary = {
  commits: 0,
  insertions: 0,
  deletions: 0,
  filesTouched: 0,
  churn: 0,
};

describe("buildCodeHealthAchievements", () => {
  it("rewards code health improvements without ranking individual developers", () => {
    const achievements = buildCodeHealthAchievements({
      currentFiles: [
        file({ file_id: "current-hotspot", churn_score: 45, co_touch_score: 30 }),
        file({ file_id: "current-silo", unique_authors: 1, commit_count: 3 }),
      ],
      previousFiles: [
        file({ file_id: "previous-hotspot-1", churn_score: 80, co_touch_score: 15 }),
        file({ file_id: "previous-hotspot-2", churn_score: 60, co_touch_score: 20 }),
        file({ file_id: "previous-silo-1", unique_authors: 1, commit_count: 4 }),
        file({ file_id: "previous-silo-2", unique_authors: 1, commit_count: 2 }),
        file({ file_id: "previous-volatile", commit_count: 5 }),
      ],
      currentActivity: {
        commits: 6,
        insertions: 120,
        deletions: 220,
        filesTouched: 8,
        churn: 340,
      },
      previousActivity: emptyActivity,
    });

    expect(achievements.map((achievement) => achievement.title)).toEqual([
      "Hotspot cooled down",
      "Knowledge spread",
      "Volatility reduced",
      "Cleanup week",
    ]);
    expect(achievements[0]).toMatchObject({
      achievement_key: "hotspot_cooled_down",
      metric_value: 1,
      tone: "positive",
      route: "/health",
    });
    expect(achievements[1].summary).toContain("Silo-risk files dropped from 2 to 1");
    expect(
      achievements
        .map((achievement) => `${achievement.title} ${achievement.summary}`)
        .join(" "),
    ).not.toMatch(/developer|player|rank|winner/i);
  });

  it("returns no achievements when the current period did not improve", () => {
    const achievements = buildCodeHealthAchievements({
      currentFiles: [file({ churn_score: 90, co_touch_score: 20 })],
      previousFiles: [file({ churn_score: 90, co_touch_score: 20 })],
      currentActivity: {
        commits: 3,
        insertions: 200,
        deletions: 10,
        filesTouched: 4,
        churn: 210,
      },
      previousActivity: emptyActivity,
    });

    expect(achievements).toEqual([]);
  });
});
