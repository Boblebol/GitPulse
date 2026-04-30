import { useMemo, useState } from "react";
import { Copy, Download, FileText } from "lucide-react";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import {
  useActivityTimeline,
  useDeveloperGlobalStats,
  useFileStats,
} from "../hooks/useStats";
import { useWeeklyRecap } from "../hooks/useWeeklyRecap";
import {
  buildCodeHealthMarkdown,
  buildDashboardMarkdown,
} from "../utils/reports";
import {
  downloadReportFile,
  type ReportExportFormat,
  type ReportExportInput,
} from "../utils/reportExports";
import { createTimeRange, timeRangeToQuery } from "../utils/timeRange";

type ReportType = "dashboard" | "code_health" | "weekly";

function reportTypeLabel(type: ReportType): string {
  if (type === "code_health") return "Code Health";
  if (type === "weekly") return "Weekly Recap";
  return "Dashboard";
}

function currentWeekStart(anchorDate: string): string {
  return createTimeRange("week", anchorDate).fromDate ?? anchorDate;
}

export default function Reports() {
  const {
    analysisScope,
    analysisScopeMode,
    repoId,
    workspaceId,
    timeRange,
    addNotification,
  } = useAppContext();
  const [reportType, setReportType] = useState<ReportType>("dashboard");
  const dateRange = timeRangeToQuery(timeRange);
  const scopeLabel = analysisScopeMode === "workspace" ? "Workspace" : "Repository";
  const weekStart = currentWeekStart(timeRange.anchorDate);

  const { data: developers = [], isLoading: loadingDevelopers } =
    useDeveloperGlobalStats(analysisScope, dateRange);
  const { data: activity = [], isLoading: loadingActivity } =
    useActivityTimeline(analysisScope, dateRange);
  const { data: files = [], isLoading: loadingFiles } =
    useFileStats(repoId, dateRange);
  const { data: weeklyRecap, isLoading: loadingWeekly } =
    useWeeklyRecap(analysisScope, weekStart);

  const hasAnalysisTarget =
    analysisScopeMode === "workspace" ? workspaceId != null : repoId != null;
  const loading =
    loadingDevelopers || loadingActivity || loadingFiles || loadingWeekly;

  const markdown = useMemo(() => {
    if (reportType === "weekly") {
      return (
        weeklyRecap?.markdown ??
        "# GitPulse Weekly Recap\n\nNo weekly recap data for this scope yet.\n"
      );
    }

    if (reportType === "code_health") {
      return buildCodeHealthMarkdown({
        scopeLabel,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
        files,
      });
    }

    return buildDashboardMarkdown({
      scopeLabel,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      developers,
      activity,
      files,
    });
  }, [
    activity,
    dateRange.fromDate,
    dateRange.toDate,
    developers,
    files,
    reportType,
    scopeLabel,
    weeklyRecap?.markdown,
  ]);

  const exportInput: ReportExportInput = useMemo(
    () => ({
      reportType,
      reportLabel: reportTypeLabel(reportType),
      scopeLabel,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      markdown,
      developers,
      activity,
      files,
      weeklyRecap: weeklyRecap ?? null,
    }),
    [
      activity,
      dateRange.fromDate,
      dateRange.toDate,
      developers,
      files,
      markdown,
      reportType,
      scopeLabel,
      weeklyRecap,
    ],
  );

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      addNotification("Report copied", "success");
    } catch {
      addNotification("Could not copy report", "error");
    }
  };

  const exportReport = (format: ReportExportFormat) => {
    try {
      downloadReportFile(exportInput, format);
      addNotification(`Report exported as ${format.toUpperCase()}`, "success");
    } catch {
      addNotification(`Could not export ${format.toUpperCase()} report`, "error");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Reports
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Export reports for retros, standups, OSS updates and handoffs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyMarkdown}
            disabled={!hasAnalysisTarget || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy size={16} />
            Copy Markdown
          </button>
          {(["csv", "pdf", "pptx"] as const).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => exportReport(format)}
              disabled={!hasAnalysisTarget || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={16} />
              Export {format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!hasAnalysisTarget && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a repository or workspace in the sidebar.
        </div>
      )}

      {hasAnalysisTarget && (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <StatCard label="Report" value={reportTypeLabel(reportType)} accent />
            <StatCard label="Developers" value={developers.length} />
            <StatCard label="Files" value={files.length} />
            <StatCard label="Week" value={weekStart} />
          </section>

          <section className="rounded-lg bg-surface-container-low p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText size={17} className="text-primary" />
                <h2
                  className="text-sm uppercase tracking-widest text-on-surface-variant"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Report Export
                </h2>
              </div>
              <label className="text-xs text-on-surface-variant">
                Report type
                <select
                  aria-label="Report type"
                  value={reportType}
                  onChange={(event) =>
                    setReportType(event.target.value as ReportType)
                  }
                  className="ml-2 rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="dashboard">Dashboard</option>
                  <option value="code_health">Code Health</option>
                  <option value="weekly">Weekly Recap</option>
                </select>
              </label>
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-on-surface-variant">Loading...</p>
            ) : (
              <textarea
                aria-label="Report markdown"
                readOnly
                value={markdown}
                className="mt-4 h-[520px] w-full resize-none rounded-lg bg-surface-container p-4 font-mono text-sm leading-6 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
