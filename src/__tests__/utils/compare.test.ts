import {
  buildMetricDelta,
  previousRangeFor,
  summarizeActivity,
} from "../../utils/compare";
import { createTimeRange } from "../../utils/timeRange";
import type { ActivityTimelineRow } from "../../types";

describe("compare utilities", () => {
  it("builds the previous period for bounded time ranges", () => {
    expect(previousRangeFor(createTimeRange("week", "2026-04-26"))).toMatchObject({
      fromDate: "2026-04-13",
      toDate: "2026-04-19",
    });
    expect(previousRangeFor(createTimeRange("last_7", "2026-04-26"))).toMatchObject({
      fromDate: "2026-04-13",
      toDate: "2026-04-19",
    });
    expect(
      previousRangeFor(
        createTimeRange("custom", "2026-04-26", {
          fromDate: "2026-04-10",
          toDate: "2026-04-12",
        }),
      ),
    ).toMatchObject({
      fromDate: "2026-04-07",
      toDate: "2026-04-09",
    });
  });

  it("returns null for all-time comparisons", () => {
    expect(previousRangeFor(createTimeRange("all", "2026-04-26"))).toBeNull();
  });

  it("summarizes activity timeline rows", () => {
    const rows: ActivityTimelineRow[] = [
      {
        date: "2026-04-20",
        commits: 2,
        insertions: 30,
        deletions: 10,
        files_touched: 4,
      },
      {
        date: "2026-04-21",
        commits: 3,
        insertions: 70,
        deletions: 20,
        files_touched: 6,
      },
    ];

    expect(summarizeActivity(rows)).toEqual({
      commits: 5,
      insertions: 100,
      deletions: 30,
      filesTouched: 10,
      churn: 130,
    });
  });

  it("builds absolute and percentage deltas", () => {
    expect(buildMetricDelta("Commits", 15, 10)).toEqual({
      label: "Commits",
      current: 15,
      previous: 10,
      delta: 5,
      percentDelta: 50,
    });
    expect(buildMetricDelta("Hotspots", 4, 0)).toMatchObject({
      delta: 4,
      percentDelta: null,
    });
  });
});
