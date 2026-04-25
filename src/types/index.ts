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
