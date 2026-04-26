import { useState } from "react";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import {
  useDirectoryHealthStats,
  useFileHealthStats,
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

export default function CodeHealth() {
  const { repoId } = useAppContext();
  const [period, setPeriod] = useState<PeriodSelection>(() => currentPeriod());
  const { data: files = [], isLoading: loadingFiles } = useFileHealthStats(
    repoId,
    period,
  );
  const { data: directories = [], isLoading: loadingDirectories } =
    useDirectoryHealthStats(repoId, period);

  const loading = loadingFiles || loadingDirectories;
  const hotspotFiles = files.filter((file) => file.hotspot_score >= 70).length;
  const siloFiles = files.filter((file) => file.silo_risk).length;
  const averageDirectoryHealth =
    directories.length > 0
      ? directories.reduce((sum, row) => sum + row.directory_health_score, 0) /
        directories.length
      : 0;

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

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Files" value={files.length} accent />
        <StatCard label="Hotspots" value={hotspotFiles} />
        <StatCard label="Silo Risk" value={siloFiles} />
        <StatCard
          label="Directory Risk"
          value={formatScore(averageDirectoryHealth)}
        />
      </div>

      <section>
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          File Hotspots
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
    </div>
  );
}
