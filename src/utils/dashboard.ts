import type { ActivityTimelineRow } from "../types";
import type { ChartPoint } from "../components/ActivityChart";

export function activityRowsToChartPoints(rows: ActivityTimelineRow[]): ChartPoint[] {
  return rows.map((row) => ({
    date: row.date,
    value: row.commits,
  }));
}
