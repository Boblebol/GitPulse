// ── Workspace & Repo ──────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export interface Repo {
  id: string;
  workspace_id: string;
  name: string;
  path: string;
  active_branch: string;
  last_indexed_commit_sha: string | null;
  created_at: string;
}

export interface ScanResult {
  commits_added: number;
  files_processed: number;
}

export type ScanRunStatus = "running" | "paused" | "completed" | "failed";

export interface ScanProgress {
  repo_id: string;
  scan_run_id: string;
  status: ScanRunStatus;
  commits_indexed: number;
  files_processed: number;
  cursor_sha: string | null;
  last_indexed_commit_sha?: string | null;
  target_head_sha: string;
  message?: string;
  error?: string;
}

// ── Analysis Scope ───────────────────────────────────────────────────────────

export type AnalysisScopeMode = "repo" | "workspace";

export interface AnalysisScope {
  mode: AnalysisScopeMode;
  repoId: string | null;
  workspaceId: string | null;
}

// ── Time Ranges ──────────────────────────────────────────────────────────────

export type TimeRangeMode =
  | "all"
  | "last_7"
  | "last_14"
  | "last_30"
  | "last_90"
  | "week"
  | "month"
  | "custom";

export interface TimeRange {
  mode: TimeRangeMode;
  anchorDate: string;
  fromDate: string | null;
  toDate: string | null;
}

// ── Historical Periods ───────────────────────────────────────────────────────

export type PeriodType =
  | "month"
  | "quarter"
  | "calendar_year"
  | "season"
  | "all_time";

export interface PeriodSelection {
  periodType: PeriodType;
  periodKey: string;
}

// ── Developers & Aliases ──────────────────────────────────────────────────────

export interface Developer {
  id: string;
  name: string;
  created_at: string;
}

export interface Alias {
  id: string;
  developer_id: string;
  git_name: string;
  git_email: string;
  created_at: string;
}

export interface DeveloperWithAliases extends Developer {
  aliases: Alias[];
  is_auto_created: boolean;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface StatsDailyDeveloper {
  id: string;
  developer_id: string;
  repo_id: string;
  date: string;           // YYYY-MM-DD
  commits: number;
  insertions: number;
  deletions: number;
  files_touched: number;
  streak: number;
  player_score: number;
  top_file_id: string | null;
}

/** Global developer stats enriched with display name. */
export interface DeveloperGlobalRow {
  developer_id: string;
  developer_name: string;
  total_commits: number;
  total_insertions: number;
  total_deletions: number;
  files_touched: number;
  active_days: number;
  longest_streak: number;
  avg_commit_size: number;
  first_commit_at: string | null;
  last_commit_at: string | null;
}

/** Per-file global stats enriched with current path. */
export interface FileGlobalRow {
  file_id: string;
  file_path: string;
  commit_count: number;
  total_insertions: number;
  total_deletions: number;
  unique_authors: number;
  churn_score: number;
  co_touch_score: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface StatsDirectoryGlobal {
  id: string;
  repo_id: string;
  directory_path: string;
  commit_count: number;
  total_insertions: number;
  total_deletions: number;
  files_touched: number;
  unique_authors: number;
  churn_score: number;
}

export interface ActivityTimelineRow {
  date: string;
  commits: number;
  insertions: number;
  deletions: number;
  files_touched: number;
}

// ── Insights ─────────────────────────────────────────────────────────────────

export interface InsightRow {
  insight_key: string;
  category: string;
  severity: "info" | "medium" | "high" | string;
  title: string;
  summary: string;
  entity_label: string;
  metric_value: number;
  action_label: string;
  route: string;
}

// ── Achievements ─────────────────────────────────────────────────────────────

export type AchievementTone = "positive" | "neutral";

export interface AchievementRow {
  achievement_key: string;
  title: string;
  summary: string;
  metric_value: number;
  tone: AchievementTone;
  route: string;
}

// ── Recaps ───────────────────────────────────────────────────────────────────

export interface WeeklyRecap {
  week_start: string;
  week_end: string;
  scope_label: string;
  commits: number;
  insertions: number;
  deletions: number;
  active_days: number;
  top_developer_name: string | null;
  top_developer_commits: number;
  top_file_path: string | null;
  top_file_commits: number;
  top_insight_title: string | null;
  top_insight_severity: string | null;
  markdown: string;
}

// ── Watchlists ───────────────────────────────────────────────────────────────

export type WatchlistItemType = "repo" | "file" | "directory";

export interface WatchlistItem {
  id: string;
  type: WatchlistItemType;
  label: string;
  target: string;
  repoId: string | null;
  workspaceId: string | null;
  createdAt: string;
}

// ── Box Score ─────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  developer_id: string;
  developer_name: string;
  total_commits: number;
  total_insertions: number;
  total_deletions: number;
  total_player_score: number;
  active_days: number;
  best_streak: number;
}

// ── V3 Historical Analytics ──────────────────────────────────────────────────

export interface PeriodLeaderboardRow {
  rank: number;
  developer_id: string;
  developer_name: string;
  total_commits: number;
  total_insertions: number;
  total_deletions: number;
  files_touched: number;
  active_days: number;
  best_streak: number;
  total_player_score: number;
  avg_player_score: number;
  adder_rank: number;
  remover_rank: number;
}

export interface PeriodAwardRow {
  award_key: string;
  title: string;
  winner_developer_id: string;
  winner_developer_name: string;
  metric_value: number;
  explanation: string;
}

export interface HistoricalRecordRow {
  record_key: string;
  title: string;
  holder_id: string | null;
  holder_name: string | null;
  value: number;
  date: string | null;
  period_key: string | null;
  explanation: string;
}

export interface HallOfFameEntry {
  category_key: string;
  title: string;
  developer_id: string;
  developer_name: string;
  value: number;
  highlight: string;
}

// ── V3 Code Health ───────────────────────────────────────────────────────────

export interface FileHealthRow {
  file_id: string;
  file_path: string;
  recent_commits: number;
  churn_score: number;
  co_touch_score: number;
  unique_authors: number;
  hotspot_score: number;
  primary_owner_id: string | null;
  primary_owner_name: string | null;
  primary_owner_share: number;
  active_maintainers: number;
  bus_factor: number;
  silo_risk: boolean;
}

export interface DirectoryHealthRow {
  directory_path: string;
  files_touched: number;
  commit_count: number;
  unique_authors: number;
  hotspot_file_count: number;
  silo_file_count: number;
  churn_score: number;
  directory_health_score: number;
}

export interface DeveloperFocusRow {
  developer_id: string;
  developer_name: string;
  commits: number;
  active_days: number;
  files_touched: number;
  directories_touched: number;
  context_switching_index: number;
  focus_score: number;
  profile_label: string;
}

export interface ReviewRiskCommitRow {
  commit_id: string;
  sha: string;
  message: string;
  committed_at: string;
  developer_id: string;
  developer_name: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  directories_touched: number;
  max_file_co_touch_score: number;
  risk_score: number;
}

export interface ActivitySignalRow {
  period_bucket: string;
  commits: number;
  insertions: number;
  deletions: number;
  files_changed: number;
  refactor_score: number;
  feature_score: number;
  cleanup_score: number;
  maintenance_score: number;
  dominant_signal: string;
}

export interface FileVolatilityRow {
  file_id: string;
  file_path: string;
  active_days: number;
  active_weeks: number;
  commits: number;
  churn: number;
  unique_authors: number;
  volatility_score: number;
}

export interface FileCouplingRow {
  source_file_id: string;
  source_file_path: string;
  target_file_id: string;
  target_file_path: string;
  co_touch_count: number;
  last_touched_at: string | null;
  coupling_score: number;
}
