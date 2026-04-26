import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TimeRange, TimeRangeMode } from "../types";
import { createTimeRange, shiftTimeRange } from "../utils/timeRange";

interface Props {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const MODES: Array<{ value: TimeRangeMode; label: string }> = [
  { value: "all", label: "All time" },
  { value: "last_7", label: "Last 7" },
  { value: "last_14", label: "Last 14" },
  { value: "last_30", label: "Last 30" },
  { value: "last_90", label: "Last 90" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];

export default function TimeRangePicker({ value, onChange }: Props) {
  const canNavigate = value.mode === "week" || value.mode === "month";
  const rangeLabel =
    value.fromDate && value.toDate ? `${value.fromDate} to ${value.toDate}` : "All history";

  const updateMode = (mode: TimeRangeMode) => {
    onChange(createTimeRange(mode, value.anchorDate, {
      fromDate: value.fromDate ?? value.anchorDate,
      toDate: value.toDate ?? value.anchorDate,
    }));
  };

  const updateCustomDate = (field: "fromDate" | "toDate", date: string) => {
    onChange(
      createTimeRange("custom", date || value.anchorDate, {
        fromDate: field === "fromDate" ? date : value.fromDate ?? value.anchorDate,
        toDate: field === "toDate" ? date : value.toDate ?? value.anchorDate,
      }),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.mode}
        onChange={(event) => updateMode(event.target.value as TimeRangeMode)}
        className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40"
        aria-label="Time range"
      >
        {MODES.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>

      {canNavigate && (
        <div className="flex items-center rounded-lg bg-surface-container p-0.5">
          <button
            type="button"
            onClick={() => onChange(shiftTimeRange(value, -1))}
            className="rounded-md px-2 py-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
            aria-label="Previous period"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => onChange(shiftTimeRange(value, 1))}
            className="rounded-md px-2 py-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
            aria-label="Next period"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {value.mode === "custom" ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.fromDate ?? value.anchorDate}
            onChange={(event) => updateCustomDate("fromDate", event.target.value)}
            className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40"
            aria-label="Custom range start"
          />
          <input
            type="date"
            value={value.toDate ?? value.anchorDate}
            onChange={(event) => updateCustomDate("toDate", event.target.value)}
            className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40"
            aria-label="Custom range end"
          />
        </div>
      ) : (
        <span className="text-xs text-on-surface-variant">{rangeLabel}</span>
      )}
    </div>
  );
}
