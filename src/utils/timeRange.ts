import type { TimeRange, TimeRangeMode } from "../types";

interface CustomRangeInput {
  fromDate: string;
  toDate: string;
}

const PRESET_DAYS: Partial<Record<TimeRangeMode, number>> = {
  last_7: 7,
  last_14: 14,
  last_30: 30,
  last_90: 90,
};

export function todayString(): string {
  return formatDate(new Date());
}

export function createTimeRange(
  mode: TimeRangeMode,
  anchorDate = todayString(),
  customRange?: CustomRangeInput,
): TimeRange {
  if (mode === "all") {
    return { mode, anchorDate, fromDate: null, toDate: null };
  }

  if (mode === "custom") {
    const fromDate = customRange?.fromDate ?? anchorDate;
    const toDate = customRange?.toDate ?? anchorDate;
    return normalizeCustomRange({ mode, anchorDate, fromDate, toDate });
  }

  const presetDays = PRESET_DAYS[mode];
  if (presetDays != null) {
    return {
      mode,
      anchorDate,
      fromDate: addDays(anchorDate, -(presetDays - 1)),
      toDate: anchorDate,
    };
  }

  if (mode === "week") {
    const fromDate = startOfWeek(anchorDate);
    return {
      mode,
      anchorDate,
      fromDate,
      toDate: addDays(fromDate, 6),
    };
  }

  const fromDate = startOfMonth(anchorDate);
  return {
    mode,
    anchorDate,
    fromDate,
    toDate: endOfMonth(anchorDate),
  };
}

export function shiftTimeRange(range: TimeRange, amount: number): TimeRange {
  if (range.mode === "week") {
    return createTimeRange("week", addDays(range.anchorDate, amount * 7));
  }

  if (range.mode === "month") {
    return createTimeRange("month", addMonths(range.anchorDate, amount));
  }

  return range;
}

export function timeRangeToQuery(range: TimeRange): { fromDate: string; toDate: string } {
  return {
    fromDate: range.fromDate ?? "0001-01-01",
    toDate: range.toDate ?? "9999-12-31",
  };
}

function normalizeCustomRange(range: TimeRange): TimeRange {
  if (range.fromDate != null && range.toDate != null && range.fromDate > range.toDate) {
    return {
      ...range,
      fromDate: range.toDate,
      toDate: range.fromDate,
    };
  }

  return range;
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

function addMonths(date: string, months: number): string {
  const parsed = parseDate(date);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return formatDate(parsed);
}

function startOfWeek(date: string): string {
  const parsed = parseDate(date);
  const day = parsed.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  parsed.setUTCDate(parsed.getUTCDate() - daysSinceMonday);
  return formatDate(parsed);
}

function startOfMonth(date: string): string {
  const parsed = parseDate(date);
  return formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)));
}

function endOfMonth(date: string): string {
  const parsed = parseDate(date);
  return formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)));
}
