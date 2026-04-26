import { Link } from "react-router-dom";
import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import { useInsights } from "../hooks/useInsights";
import { timeRangeToQuery } from "../utils/timeRange";

function formatMetric(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  });
}

function severityClass(severity: string): string {
  if (severity === "high") return "bg-error-container text-error";
  if (severity === "medium") return "bg-primary-container text-primary";
  return "bg-surface-container-high text-on-surface-variant";
}

function formatCategory(category: string): string {
  return category
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function Insights() {
  const { analysisScope, analysisScopeMode, repoId, workspaceId, timeRange } =
    useAppContext();
  const dateRange = timeRangeToQuery(timeRange);
  const { data: insights = [], isLoading } = useInsights(analysisScope, dateRange);

  const hasAnalysisTarget =
    analysisScopeMode === "workspace" ? workspaceId != null : repoId != null;
  const highCount = insights.filter((insight) => insight.severity === "high").length;
  const categoryCount = new Set(insights.map((insight) => insight.category)).size;
  const topInsight = insights[0] ?? null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Insights
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Local, explainable signals to decide what to inspect next.
          </p>
        </div>
      </div>

      {!hasAnalysisTarget && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a repository or workspace in the sidebar.
        </div>
      )}

      {hasAnalysisTarget && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Insights" value={insights.length} accent />
            <StatCard label="High Priority" value={highCount} />
            <StatCard label="Categories" value={categoryCount} />
          </div>

          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Inbox
            </h2>
            {isLoading ? (
              <p className="text-on-surface-variant text-sm">Loading...</p>
            ) : insights.length === 0 ? (
              <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
                No insights yet. Sync a repository first.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {insights.map((insight) => (
                  <article
                    key={insight.insight_key}
                    className="rounded-lg bg-surface-container-low p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                          {formatCategory(insight.category)}
                        </p>
                        <h2
                          className="mt-2 truncate text-lg font-bold text-on-surface"
                          style={{ fontFamily: "Space Grotesk, sans-serif" }}
                        >
                          {insight.title}
                        </h2>
                      </div>
                      <span
                        className={[
                          "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                          severityClass(insight.severity),
                        ].join(" ")}
                      >
                        {insight.severity}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm text-on-surface-variant">
                      {insight.summary}
                    </p>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <span className="min-w-0 truncate font-mono text-xs text-on-surface-variant">
                        {insight.entity_label}
                      </span>
                      <span className="shrink-0 text-lg font-semibold text-primary">
                        {formatMetric(insight.metric_value)}
                      </span>
                    </div>
                    <Link
                      to={insight.route}
                      className="mt-4 inline-flex rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-highest"
                    >
                      {insight.action_label}
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {topInsight && (
            <p className="text-xs text-on-surface-variant">
              Top signal: {topInsight.title} / {topInsight.entity_label}
            </p>
          )}
        </>
      )}
    </div>
  );
}
