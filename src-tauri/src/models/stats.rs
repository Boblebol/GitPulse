use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StatsDailyDeveloper {
    pub id: String,
    pub developer_id: String,
    pub repo_id: String,
    pub date: String,           // YYYY-MM-DD
    pub commits: i64,
    pub insertions: i64,
    pub deletions: i64,
    pub files_touched: i64,
    pub streak: i64,
    pub player_score: f64,
    pub top_file_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StatsDailyFile {
    pub id: String,
    pub file_id: String,
    pub date: String,
    pub commits: i64,
    pub insertions: i64,
    pub deletions: i64,
    pub churn_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StatsDailyDirectory {
    pub id: String,
    pub repo_id: String,
    pub directory_path: String,
    pub date: String,
    pub commits: i64,
    pub insertions: i64,
    pub deletions: i64,
    pub files_touched: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StatsDeveloperGlobal {
    pub id: String,
    pub developer_id: String,
    pub total_commits: i64,
    pub total_insertions: i64,
    pub total_deletions: i64,
    pub files_touched: i64,
    pub active_days: i64,
    pub longest_streak: i64,
    pub avg_commit_size: f64,
    pub first_commit_at: Option<String>,
    pub last_commit_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StatsFileGlobal {
    pub id: String,
    pub file_id: String,
    pub commit_count: i64,
    pub total_insertions: i64,
    pub total_deletions: i64,
    pub unique_authors: i64,
    pub churn_score: f64,
    pub co_touch_score: f64,
    pub first_seen_at: Option<String>,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StatsDirectoryGlobal {
    pub id: String,
    pub repo_id: String,
    pub directory_path: String,
    pub commit_count: i64,
    pub total_insertions: i64,
    pub total_deletions: i64,
    pub files_touched: i64,
    pub unique_authors: i64,
    pub churn_score: f64,
}
