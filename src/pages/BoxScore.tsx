import { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useLeaderboard, useBoxScore, useDailyStats } from "../hooks/useStats";
import { useDeveloperGlobalStats } from "../hooks/useStats";
import { Trophy, Flame, TrendingUp, TrendingDown } from "lucide-react";
import ActivityChart from "../components/ActivityChart";
import TimeRangePicker from "../components/TimeRangePicker";
import { timeRangeToQuery } from "../utils/timeRange";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BoxScore() {
  const { repoId, analysisScope, timeRange, setTimeRange } = useAppContext();
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedDevId, setSelectedDevId] = useState<string | null>(null);
  const { fromDate, toDate } = timeRangeToQuery(timeRange);

  const { data: devStats = [] } = useDeveloperGlobalStats(analysisScope);
  const { data: leaderboard = [], isLoading: loadingBoard } = useLeaderboard(repoId, fromDate, toDate);
  const { data: card } = useBoxScore(selectedDevId, repoId, selectedDate);
  const { data: dailyData = [] } = useDailyStats(selectedDevId, repoId, fromDate, toDate);

  if (!repoId) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          Select a repository in the sidebar.
        </div>
      </div>
    );
  }

  const trendData = dailyData.map((d) => ({ date: d.date, value: d.player_score }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Box Score
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Daily performance cards & monthly leaderboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-end">
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          <input
            type="date"
            value={selectedDate}
            max={today()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40"
          />
          <select
            value={selectedDevId ?? ""}
            onChange={(e) => setSelectedDevId(e.target.value || null)}
            className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40"
          >
            <option value="">All developers</option>
            {devStats.map((d) => (
              <option key={d.developer_id} value={d.developer_id}>
                {d.developer_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Day card */}
      {selectedDevId && (
        <section>
          <h2
            className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {selectedDate}
          </h2>
          {card ? (
            <div className="bg-surface-container-high rounded-lg p-5 relative overflow-hidden">
              <div
                className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at 100% 0%, rgba(242,101,34,0.08) 0%, transparent 70%)",
                }}
              />
              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-1 flex flex-col justify-center items-center">
                  <span
                    className="text-5xl font-black gradient-primary-text"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    {card.player_score.toFixed(0)}
                  </span>
                  <span className="text-xs text-on-surface-variant mt-1">Player Score</span>
                </div>
                <div className="col-span-4 grid grid-cols-4 gap-3">
                  {[
                    { label: "Commits",  value: card.commits,       Icon: TrendingUp  },
                    { label: "+Lines",   value: card.insertions,    Icon: TrendingUp  },
                    { label: "−Lines",   value: card.deletions,     Icon: TrendingDown },
                    { label: "Files",    value: card.files_touched, Icon: null        },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-surface-container rounded-lg px-3 py-2.5">
                      <p className="text-xs text-on-surface-variant">{label}</p>
                      <p
                        className="text-xl font-bold text-on-surface mt-0.5"
                        style={{ fontFamily: "Public Sans, sans-serif" }}
                      >
                        {value.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              {card.streak >= 3 && (
                <div className="flex items-center gap-1.5 mt-4 text-primary text-sm font-semibold">
                  <Flame size={15} />
                  {card.streak}-day streak
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-surface-container-low p-6 text-center text-on-surface-variant text-sm">
              No activity on {selectedDate}.
            </div>
          )}
        </section>
      )}

      {/* Monthly trend chart */}
      {selectedDevId && (
        <section>
          <h2
            className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Monthly Trend — {fromDate} → {toDate}
          </h2>
          <div className="bg-surface-container-high rounded-lg px-4 pt-4 pb-2">
            {trendData.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-on-surface-variant">Player Score / day</span>
                  <span
                    className="text-xs text-primary font-bold"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    {trendData.reduce((s, p) => s + p.value, 0).toFixed(0)} pts total
                  </span>
                </div>
                <ActivityChart
                  data={trendData}
                  valueLabel="Player Score"
                  color="#ffb599"
                  height={140}
                />
              </>
            ) : (
              <p className="text-xs text-on-surface-variant py-8 text-center">
                No activity this month.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Monthly leaderboard */}
      <section>
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant mb-3"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Leaderboard — {fromDate} → {toDate}
        </h2>
        {loadingBoard ? (
          <p className="text-on-surface-variant text-sm">Loading…</p>
        ) : leaderboard.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No data for this period.</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry) => {
              const maxScore = leaderboard[0].total_player_score || 1;
              const pct = (entry.total_player_score / maxScore) * 100;
              return (
                <div
                  key={entry.developer_id}
                  className={[
                    "flex items-center gap-4 bg-surface-container-high rounded-lg px-4 py-3 relative overflow-hidden",
                    entry.rank === 1 ? "accent-bar pl-5" : "",
                  ].join(" ")}
                >
                  {/* Score bar background */}
                  <div
                    className="absolute inset-y-0 left-0 opacity-10 pointer-events-none"
                    style={{
                      width: `${pct}%`,
                      background: "linear-gradient(90deg, #f26522, transparent)",
                    }}
                  />

                  {/* Rank */}
                  <span
                    className={[
                      "text-sm font-bold w-6 text-center relative",
                      entry.rank === 1 ? "text-primary" : "text-on-surface-variant",
                    ].join(" ")}
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    {entry.rank === 1 ? (
                      <Trophy size={16} className="mx-auto text-primary" />
                    ) : (
                      entry.rank
                    )}
                  </span>

                  {/* Name */}
                  <span
                    className="flex-1 font-semibold text-on-surface relative"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    {entry.developer_name}
                  </span>

                  {/* Stats */}
                  <span
                    className="text-sm text-on-surface-variant w-20 text-right relative"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    {entry.total_commits} commits
                  </span>
                  <span
                    className="text-sm text-on-surface-variant w-16 text-right relative"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    {entry.active_days}d active
                  </span>
                  <span
                    className="text-sm font-bold text-primary w-16 text-right relative"
                    style={{ fontFamily: "Public Sans, sans-serif" }}
                  >
                    {entry.total_player_score.toFixed(0)} pts
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
