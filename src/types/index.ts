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
