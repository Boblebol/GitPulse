import { useState } from "react";
import { useDeveloperGlobalStats, useDailyStats } from "../hooks/useStats";
import { useRenameDeveloper } from "../hooks/useDevelopers";
import { useAppContext } from "../context/AppContext";
import StatCard from "../components/StatCard";
import ActivityChart from "../components/ActivityChart";
import { Pencil, Check, X, ChevronDown } from "lucide-react";

// ── Per-developer 30-day activity panel ─────────────────────────────────────

function DevActivityPanel({ devId }: { devId: string }) {
  const { repoId } = useAppContext();

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

  const { data = [], isLoading } = useDailyStats(devId, repoId, fromDate, toDate);

  if (!repoId) {
    return (
      <p className="text-xs text-on-surface-variant py-2">
        Select a repository to view activity.
      </p>
    );
  }
  if (isLoading) {
    return <p className="text-xs text-on-surface-variant py-2">Loading…</p>;
  }

  const commitData = data.map((d) => ({ date: d.date, value: d.commits }));
  const scoreData  = data.map((d) => ({ date: d.date, value: d.player_score }));

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-on-surface-variant mb-1">Commits / day</p>
        <ActivityChart
          data={commitData}
          valueLabel="Commits"
          color="#4ae176"
          height={100}
        />
      </div>
      <div>
        <p className="text-xs text-on-surface-variant mb-1">Player Score / day</p>
        <ActivityChart
          data={scoreData}
          valueLabel="Score"
          color="#ffb599"
          height={100}
        />
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Developers() {
  const { analysisScope } = useAppContext();
  const { data: devStats = [], isLoading } = useDeveloperGlobalStats(analysisScope);
  const rename = useRenameDeveloper();
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function startEdit(id: string, currentName: string) {
    setEditing(id);
    setEditName(currentName);
  }

  function commitEdit(id: string) {
    if (editName.trim()) {
      rename.mutate({ developerId: id, newName: editName.trim() });
    }
    setEditing(null);
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  const maxCommits = devStats.length > 0
    ? Math.max(...devStats.map((d) => d.total_commits))
    : 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold text-on-surface"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          Developers
        </h1>
        <p className="text-on-surface-variant text-sm mt-0.5">
          All-time stats per developer across every repository.
        </p>
      </div>

      {/* Summary row */}
      {devStats.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Developers" value={devStats.length} accent />
          <StatCard
            label="Total Commits"
            value={devStats.reduce((s, d) => s + d.total_commits, 0).toLocaleString()}
          />
          <StatCard
            label="Best Streak"
            value={Math.max(...devStats.map((d) => d.longest_streak))}
            sub="days consecutive"
          />
        </div>
      )}

      {/* Developer table */}
      {isLoading && (
        <p className="text-on-surface-variant text-sm">Loading…</p>
      )}
      {!isLoading && devStats.length === 0 && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          No developer stats yet. Sync a repository first.
        </div>
      )}
      {devStats.length > 0 && (
        <div className="rounded-lg overflow-hidden bg-surface-container-low">
          {/* Table header */}
          <div
            className="grid text-xs uppercase tracking-widest text-on-surface-variant px-4 py-2"
            style={{ gridTemplateColumns: "1fr 80px 80px 80px 80px 80px 28px 28px" }}
          >
            <span>Developer</span>
            <span className="text-right">Commits</span>
            <span className="text-right">+Lines</span>
            <span className="text-right">−Lines</span>
            <span className="text-right">Days</span>
            <span className="text-right">Streak</span>
            <span />
            <span />
          </div>

          {/* Rows */}
          {devStats.map((d, i) => {
            const isExpanded = expandedId === d.developer_id;
            const barPct = maxCommits > 0
              ? (d.total_commits / maxCommits) * 100
              : 0;

            return (
              <div key={d.developer_id} className="overflow-hidden">
                {/* Main row */}
                <div
                  className={[
                    "grid items-center px-4 py-3 transition-colors cursor-pointer",
                    i % 2 === 0
                      ? "bg-surface-container-low"
                      : "bg-surface-container",
                    "hover:bg-surface-container-highest",
                  ].join(" ")}
                  style={{ gridTemplateColumns: "1fr 80px 80px 80px 80px 80px 28px 28px" }}
                  onClick={() => toggleExpand(d.developer_id)}
                >
                  {/* Name / edit */}
                  <div className="flex items-center gap-2 min-w-0">
                    {editing === d.developer_id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")  commitEdit(d.developer_id);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-surface-container-highest text-on-surface text-sm rounded px-2 py-0.5 w-40 outline-none ring-1 ring-primary/40"
                      />
                    ) : (
                      <div className="min-w-0 flex-1">
                        <span
                          className="font-semibold text-on-surface truncate block"
                          style={{ fontFamily: "Space Grotesk, sans-serif" }}
                        >
                          {d.developer_name}
                        </span>
                        {/* Commit bar */}
                        <div className="mt-1 h-0.5 rounded-full bg-surface-container-highest overflow-hidden w-full max-w-[200px]">
                          <div
                            className="h-full rounded-full gradient-primary transition-all duration-500"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {editing === d.developer_id && (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); commitEdit(d.developer_id); }}
                          className="text-tertiary hover:text-tertiary/80"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing(null); }}
                          className="text-error hover:text-error/80"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <span className="text-right text-on-surface font-medium" style={{ fontFamily: "Public Sans, sans-serif" }}>
                    {d.total_commits.toLocaleString()}
                  </span>
                  <span className="text-right text-tertiary text-sm" style={{ fontFamily: "Public Sans, sans-serif" }}>
                    +{d.total_insertions.toLocaleString()}
                  </span>
                  <span className="text-right text-error text-sm" style={{ fontFamily: "Public Sans, sans-serif" }}>
                    −{d.total_deletions.toLocaleString()}
                  </span>
                  <span className="text-right text-on-surface-variant text-sm" style={{ fontFamily: "Public Sans, sans-serif" }}>
                    {d.active_days}
                  </span>
                  <span className="text-right text-primary text-sm font-bold" style={{ fontFamily: "Public Sans, sans-serif" }}>
                    {d.longest_streak}
                  </span>

                  {/* Edit button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(d.developer_id, d.developer_name); }}
                    className="text-on-surface-variant hover:text-on-surface transition-colors justify-self-end"
                  >
                    <Pencil size={13} />
                  </button>

                  {/* Expand chevron */}
                  <ChevronDown
                    size={13}
                    className={[
                      "text-on-surface-variant transition-transform duration-200 justify-self-end",
                      isExpanded ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </div>

                {/* Activity panel */}
                {isExpanded && (
                  <div className="px-4 py-4 bg-surface-container-highest border-t border-outline-variant/10">
                    <p
                      className="text-xs uppercase tracking-widest text-on-surface-variant mb-3"
                      style={{ fontFamily: "Inter, sans-serif" }}
                    >
                      Last 30 days
                    </p>
                    <DevActivityPanel devId={d.developer_id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
