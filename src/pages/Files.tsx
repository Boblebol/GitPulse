import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useAppContext } from "../context/AppContext";
import { useFileStats, useDirectoryStats } from "../hooks/useStats";
import StatCard from "../components/StatCard";
import { FileCode2 } from "lucide-react";

const COLORS = ["#f26522", "#ffb599", "#ffb599", "#9ba5c0"];
function barColor(i: number) {
  return COLORS[Math.min(i, COLORS.length - 1)];
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function formatScore(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1);
}

function directoryName(path: string): string {
  if (path === "") {
    return "root";
  }

  return basename(path);
}

function parentDirectoryLabel(path: string): string {
  if (path === "") {
    return "Parent: none";
  }

  const parentPath = path.split("/").slice(0, -1).join("/");
  return `Parent: ${parentPath || "root"}`;
}

export default function Files() {
  const { repoId } = useAppContext();
  const { data: files = [], isLoading: loadingFiles } = useFileStats(repoId);
  const { data: dirs = [], isLoading: loadingDirs }   = useDirectoryStats(repoId);

  if (!repoId) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a repository in the sidebar.
        </div>
      </div>
    );
  }

  const totalChurn = files.reduce((s, f) => s + f.churn_score, 0);
  const maxChurn   = files.length > 0 ? Math.max(...files.map((f) => f.churn_score)) : 1;

  // Top 10 files for bar chart
  const chartData = files.slice(0, 10).map((f) => ({
    name: basename(f.file_path),
    churn: parseFloat(f.churn_score.toFixed(1)),
    full: f.file_path,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold text-on-surface"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          Files
        </h1>
        <p className="text-on-surface-variant text-sm mt-0.5">
          Hotspots, churn scores and directory breakdown.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tracked Files" value={files.length}               accent />
        <StatCard label="Directories"   value={dirs.length}                />
        <StatCard label="Total Churn"   value={totalChurn.toFixed(1)}
          sub="insertions+deletions / age"
        />
      </div>

      {/* Churn bar chart */}
      {!loadingFiles && chartData.length > 0 && (
        <section>
          <h2
            className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Top 10 Files by Churn Score
          </h2>
          <div className="bg-surface-container-high rounded-lg px-4 pt-4 pb-2">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
              >
                <XAxis
                  type="number"
                  tick={{
                    fill: "#9ba5c0",
                    fontSize: 10,
                    fontFamily: "Public Sans, sans-serif",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{
                    fill: "#dae2fd",
                    fontSize: 10,
                    fontFamily: "Public Sans, sans-serif",
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={130}
                />
                <Tooltip
                  contentStyle={{
                    background: "#222a3d",
                    border: "1px solid rgba(89,65,56,0.3)",
                    borderRadius: 6,
                    color: "#dae2fd",
                    fontSize: 12,
                    fontFamily: "Public Sans, sans-serif",
                  }}
                  cursor={{ fill: "rgba(255,181,153,0.05)" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any, _: any, props: any) => [
                    Number(v).toFixed(1),
                    props?.payload?.full ?? "Churn",
                  ]}
                />
                <Bar dataKey="churn" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={barColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Most touched files list */}
      <section>
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Most Touched Files
        </h2>
        {loadingFiles ? (
          <p className="text-on-surface-variant text-sm">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-on-surface-variant text-sm">
            No file data. Sync the repository first.
          </p>
        ) : (
          <div className="rounded-lg overflow-hidden bg-surface-container-low">
            {files.slice(0, 20).map((f, i) => {
              const churnPct = maxChurn > 0 ? (f.churn_score / maxChurn) * 100 : 0;
              return (
                <div
                  key={f.file_id}
                  className={[
                    "flex items-center gap-4 px-4 py-2.5 transition-colors",
                    i % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container",
                    "hover:bg-surface-container-highest",
                  ].join(" ")}
                >
                  <FileCode2 size={14} className="text-on-surface-variant shrink-0" />

                  {/* Path + churn bar */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-on-surface font-mono truncate block">
                      {f.file_path}
                    </span>
                    <div className="mt-1 h-0.5 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${churnPct}%`,
                          background:
                            churnPct > 66
                              ? "linear-gradient(90deg, #f26522, #ffb599)"
                              : churnPct > 33
                              ? "#ffb599"
                              : "#9ba5c0",
                        }}
                      />
                    </div>
                  </div>

                  <span
                    className="text-xs text-on-surface-variant w-14 text-right shrink-0"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    {f.commit_count} commits
                  </span>
                  <span
                    className="text-xs text-tertiary w-16 text-right shrink-0"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    +{f.total_insertions.toLocaleString()}
                  </span>
                  <span
                    className="text-xs text-error w-16 text-right shrink-0"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    −{f.total_deletions.toLocaleString()}
                  </span>
                  <span
                    className="hidden sm:block text-xs text-on-surface-variant w-14 text-right shrink-0"
                    title="Co-touch score"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    Co {formatScore(f.co_touch_score)}
                  </span>
                  <span
                    className="text-xs text-primary w-16 text-right shrink-0"
                    title="Churn score"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    ⚡{formatScore(f.churn_score)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Directories */}
      <section>
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Directories
        </h2>
        {loadingDirs ? (
          <p className="text-on-surface-variant text-sm">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {dirs.slice(0, 12).map((d) => (
              <div
                key={d.id}
                className="bg-surface-container-high rounded-lg px-4 py-3"
                title={d.directory_path || "root"}
              >
                <p className="text-sm font-semibold text-on-surface font-mono truncate">
                  {directoryName(d.directory_path)}
                </p>
                <p className="mt-0.5 text-xs text-on-surface-variant font-mono truncate">
                  {parentDirectoryLabel(d.directory_path)}
                </p>
                <div className="flex gap-4 mt-1">
                  <span
                    className="text-xs text-on-surface-variant"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    {d.commit_count} commits
                  </span>
                  <span
                    className="text-xs text-on-surface-variant"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    {d.files_touched} files
                  </span>
                </div>
                {/* Churn bar */}
                <div className="mt-2 h-0.5 rounded-full bg-surface-container-highest overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{
                      width: `${Math.min((d.churn_score / (totalChurn || 1)) * 400, 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
