import StatCard from "../components/StatCard";
import { useAppContext } from "../context/AppContext";
import { useHallOfFame } from "../hooks/useHistoricalStats";

function formatMetric(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  });
}

function formatCategory(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function HallOfFame() {
  const { analysisScope, analysisScopeMode, repoId, workspaceId } = useAppContext();
  const { data: entries = [], isLoading } = useHallOfFame(analysisScope);

  const hasAnalysisTarget =
    analysisScopeMode === "workspace" ? workspaceId != null : repoId != null;
  const inductedDevelopers = new Set(
    entries.map((entry) => entry.developer_id),
  ).size;
  const topEntry = entries.reduce<typeof entries[number] | null>(
    (best, entry) => (best == null || entry.value > best.value ? entry : best),
    null,
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Hall of Fame
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Career leaders and all-time specialists for the selected scope.
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
            <StatCard label="HOF Entries" value={entries.length} accent />
            <StatCard label="Inducted Devs" value={inductedDevelopers} />
            <StatCard
              label="Top Mark"
              value={topEntry ? formatMetric(topEntry.value) : "0"}
            />
          </div>

          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Inductees
            </h2>
            {isLoading ? (
              <p className="text-on-surface-variant text-sm">Loading...</p>
            ) : entries.length === 0 ? (
              <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
                No Hall of Fame entries yet. Sync a repository first.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry) => (
                  <article
                    key={entry.category_key}
                    className="rounded-lg bg-surface-container-low p-4"
                  >
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                      {entry.title || formatCategory(entry.category_key)}
                    </p>
                    <h2
                      className="mt-2 truncate text-xl font-bold text-on-surface"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {entry.developer_name}
                    </h2>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <span className="text-sm text-on-surface-variant">
                        {entry.highlight}
                      </span>
                      <span className="shrink-0 text-lg font-semibold text-primary">
                        {formatMetric(entry.value)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
