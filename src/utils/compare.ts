import type { ActivityTimelineRow, TimeRange } from "../types";
import { createTimeRange, timeRangeToQuery } from "./timeRange";

export interface ActivitySummary {
  commits: number;
  insertions: number;
  deletions: number;
  filesTouched: number;
  churn: number;
}

export interface MetricDelta {
  label: string;
  current: number;
  previous: number;
  delta: number;
  percentDelta: number | null;
}

function parseDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatDate(parsed);
}

function daysBetweenInclusive(fromDate: string, toDate: string): number {
  const from = parseDate(fromDate).getTime();
  const to = parseDate(toDate).getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

export function previousRangeFor(range: TimeRange): TimeRange | null {
  if (range.fromDate == null || range.toDate == null) {
    return null;
  }

  if (range.mode === "week") {
    return createTimeRange("week", addDays(range.anchorDate, -7));
  }

  if (range.mode === "month") {
    const parsed = parseDate(range.anchorDate);
    parsed.setUTCMonth(parsed.getUTCMonth() - 1);
    return createTimeRange("month", formatDate(parsed));
  }

  const days = daysBetweenInclusive(range.fromDate, range.toDate);
  const previousTo = addDays(range.fromDate, -1);
  const previousFrom = addDays(previousTo, -(days - 1));

  return {
    ...range,
    anchorDate: previousTo,
    fromDate: previousFrom,
    toDate: previousTo,
  };
}

export function previousRangeQuery(range: TimeRange): {
  fromDate: string;
  toDate: string;
} | null {
  const previous = previousRangeFor(range);
  return previous ? timeRangeToQuery(previous) : null;
}

export function summarizeActivity(rows: ActivityTimelineRow[]): ActivitySummary {
  const summary = rows.reduce(
    (acc, row) => ({
      commits: acc.commits + row.commits,
      insertions: acc.insertions + row.insertions,
      deletions: acc.deletions + row.deletions,
      filesTouched: acc.filesTouched + row.files_touched,
    }),
    {
      commits: 0,
      insertions: 0,
      deletions: 0,
      filesTouched: 0,
    },
  );

  return {
    ...summary,
    churn: summary.insertions + summary.deletions,
  };
}

export function buildMetricDelta(
  label: string,
  current: number,
  previous: number,
): MetricDelta {
  return {
    label,
    current,
    previous,
    delta: current - previous,
    percentDelta: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}
