import { useAppContext } from "../context/AppContext";
import { useDeveloperGlobalStats } from "../hooks/useStats";
import { useTriggerScan } from "../hooks/useRepos";
import StatCard from "../components/StatCard";
import { RefreshCw, Flame, GitCommit, Clock } from "lucide-react";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function Dashboard() {
  const { repoId } = useAppContext();
  const { data: devStats = [], isLoading } = useDeveloperGlobalStats();
  const scan = useTriggerScan();

  const totals = devStats.reduce(
    (acc, d) => ({
      commits:    acc.commits    + d.total_commits,
      insertions: acc.insertions + d.total_insertions,
      deletions:  acc.deletions  + d.total_deletions,
    }),
    { commits: 0, insertions: 0, deletions: 0 },
  );

  const maxCommits = devStats.length > 0
    ? Math.max(...devStats.map((d) => d.total_commits))
    : 1;

  // Most recent committer (by last_commit_at)
  const mostRecent = devStats
    .filter((d) => d.last_commit_at)
    .sort((a, b) => (b.last_commit_at! > a.last_commit_at! ? 1 : -1))[0];

  // Best streak holder
  const streakHolder = devStats.reduce<typeof devStats[0] | null>(
    (best, d) => (!best || d.longest_streak > best.longest_streak ? d : best),
    null,
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Dashboard
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Repository overview at a glance.
          </p>
        </div>
        {repoId && (
          <button
            onClick={() => scan.mutate(repoId)}
            disabled={scan.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-on-primary gradient-primary disabled:opacity-50 transition-opacity"
          >
            <RefreshCw size={15} className={scan.isPending ? "animate-spin" : ""} />
            {scan.isPending ? "Scanning…" : "Sync Repo"}
          </button>
        )}
      </div>

      {/* Scan result / error */}
      {scan.isSuccess && (
        <div className="rounded-lg bg-tertiary-container px-4 py-2 text-tertiary text-sm">
          Scan complete — {scan.data.commits_added} new commits,{" "}
          {scan.data.files_processed} files processed.
        </div>
      )}
      {scan.isError && (
        <div className="rounded-lg bg-error-container px-4 py-2 text-error text-sm">
          Scan failed: {scan.error}
        </div>
      )}

      {/* No repo selected */}
      {!repoId && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a workspace and repository in the sidebar to get started.
        </div>
      )}

      {repoId && (
        <>
          {/* Summary stats */}
          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              All-Time Totals
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Commits"    value={fmt(totals.commits)}    accent />
              <StatCard label="Insertions" value={`+${fmt(totals.insertions)}`} />
              <StatCard label="Deletions"  value={`−${fmt(totals.deletions)}`} />
            </div>
          </section>

          {/* Spotlight cards */}
          {(mostRecent || streakHolder) && (
            <section>
              <h2
                className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Spotlights
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {mostRecent && (
                  <div className="bg-surface-container-high rounded-lg px-4 py-3 flex items-center gap-3">
                    <div className="rounded-full bg-surface-container-highest p-2">
                      <Clock size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-on-surface-variant">Last Active</p>
                      <p
                        className="font-semibold text-on-surface truncate"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {mostRecent.developer_name}
                      </p>
                      <p className="text-xs text-on-surface-variant font-mono">
                        {mostRecent.last_commit_at?.slice(0, 10) ?? "—"}
                      </p>
                    </div>
                  </div>
                )}
                {streakHolder && streakHolder.longest_streak > 0 && (
                  <div className="bg-surface-container-high rounded-lg px-4 py-3 flex items-center gap-3">
                    <div className="rounded-full bg-surface-container-highest p-2">
                      <Flame size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-on-surface-variant">Best Streak</p>
                      <p
                        className="font-semibold text-on-surface truncate"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {streakHolder.developer_name}
                      </p>
                      <p className="text-xs text-primary font-bold" style={{ fontFamily: "Public Sans, sans-serif" }}>
                        {streakHolder.longest_streak} days consecutive
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Top contributors */}
          <section>
            <h2
              className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Top Contributors
            </h2>
            {isLoading ? (
              <div className="text-on-surface-variant text-sm">Loading…</div>
            ) : devStats.length === 0 ? (
              <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant text-sm">
                No data yet. Sync a repository first.
              </div>
            ) : (
              <div className="space-y-2">
                {devStats.slice(0, 8).map((d, i) => {
                  const barPct = maxCommits > 0
                    ? (d.total_commits / maxCommits) * 100
                    : 0;
                  return (
                    <div
                      key={d.developer_id}
                      className={[
                        "bg-surface-container-high rounded-lg px-4 py-3 relative overflow-hidden",
                        i === 0 ? "accent-bar pl-5" : "",
                      ].join(" ")}
                    >
                      {/* Background bar */}
                      <div
                        className="absolute inset-y-0 left-0 opacity-[0.06] pointer-events-none transition-all duration-700"
                        style={{
                          width: `${barPct}%`,
                          background: "linear-gradient(90deg, #f26522, transparent)",
                        }}
                      />

                      <div className="flex items-center justify-between relative">
                        <div className="min-w-0 flex-1 mr-4">
                          <div className="flex items-center gap-2">
                            <p
                              className="font-semibold text-on-surface truncate"
                              style={{ fontFamily: "Space Grotesk, sans-serif" }}
                            >
                              {d.developer_name}
                            </p>
                            {d.longest_streak >= 3 && (
                              <span className="flex items-center gap-0.5 text-xs text-primary font-semibold shrink-0">
                                <Flame size={11} />
                                {d.longest_streak}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            {d.active_days} active days
                            {d.last_commit_at && (
                              <span className="ml-2 font-mono">
                                · last {d.last_commit_at.slice(0, 10)}
                              </span>
                            )}
                          </p>
                          {/* Commit bar */}
                          <div className="mt-2 h-1 rounded-full bg-surface-container-highest overflow-hidden">
                            <div
                              className="h-full rounded-full gradient-primary transition-all duration-700"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className="text-lg font-bold text-primary"
                            style={{ fontFamily: "Public Sans, sans-serif" }}
                          >
                            {fmt(d.total_commits)}
                          </p>
                          <p className="text-xs text-on-surface-variant flex items-center gap-1 justify-end">
                            <GitCommit size={10} />
                            commits
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
