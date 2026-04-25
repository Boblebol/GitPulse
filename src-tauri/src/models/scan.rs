use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use thiserror::Error;
use uuid::Uuid;

/// Persisted lifecycle status for a repository scan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanRunStatus {
    Running,
    Paused,
    Completed,
    Failed,
}

impl ScanRunStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    fn from_db(value: &str) -> Result<Self, ScanRunError> {
        match value {
            "running" => Ok(Self::Running),
            "paused" => Ok(Self::Paused),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            other => Err(ScanRunError::InvalidStatus(other.to_string())),
        }
    }
}

/// One durable scan run row.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScanRun {
    pub id: String,
    pub repo_id: String,
    pub branch: String,
    pub target_head_sha: String,
    pub cursor_sha: Option<String>,
    pub status: ScanRunStatus,
    pub commits_indexed: i64,
    pub files_processed: i64,
    pub error_message: Option<String>,
    pub started_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct ScanRunRow {
    id: String,
    repo_id: String,
    branch: String,
    target_head_sha: String,
    cursor_sha: Option<String>,
    status: String,
    commits_indexed: i64,
    files_processed: i64,
    error_message: Option<String>,
    started_at: String,
    updated_at: String,
    completed_at: Option<String>,
}

impl TryFrom<ScanRunRow> for ScanRun {
    type Error = ScanRunError;

    fn try_from(row: ScanRunRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            repo_id: row.repo_id,
            branch: row.branch,
            target_head_sha: row.target_head_sha,
            cursor_sha: row.cursor_sha,
            status: ScanRunStatus::from_db(&row.status)?,
            commits_indexed: row.commits_indexed,
            files_processed: row.files_processed,
            error_message: row.error_message,
            started_at: row.started_at,
            updated_at: row.updated_at,
            completed_at: row.completed_at,
        })
    }
}

/// Errors raised by scan-run persistence helpers.
#[derive(Debug, Error)]
pub enum ScanRunError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("invalid scan run status in database: {0}")]
    InvalidStatus(String),
}

/// Create a new running scan run for a repository and branch.
pub async fn create_scan_run(
    pool: &SqlitePool,
    repo_id: &str,
    branch: &str,
    target_head_sha: &str,
) -> Result<ScanRun, ScanRunError> {
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO scan_runs
         (id, repo_id, branch, target_head_sha, cursor_sha, status,
          commits_indexed, files_processed, error_message,
          started_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, NULL, ?, 0, 0, NULL, ?, ?, NULL)",
    )
    .bind(&id)
    .bind(repo_id)
    .bind(branch)
    .bind(target_head_sha)
    .bind(ScanRunStatus::Running.as_str())
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    fetch_scan_run(pool, &id)
        .await?
        .ok_or_else(|| ScanRunError::InvalidStatus("missing inserted scan run".to_string()))
}

/// Fetch a scan run by id.
pub async fn fetch_scan_run(
    pool: &SqlitePool,
    scan_run_id: &str,
) -> Result<Option<ScanRun>, ScanRunError> {
    let row: Option<ScanRunRow> = sqlx::query_as(
        "SELECT id, repo_id, branch, target_head_sha, cursor_sha, status,
                commits_indexed, files_processed, error_message,
                started_at, updated_at, completed_at
         FROM scan_runs
         WHERE id = ?",
    )
    .bind(scan_run_id)
    .fetch_optional(pool)
    .await?;

    row.map(ScanRun::try_from).transpose()
}

/// Persist incremental progress for a running scan.
pub async fn update_scan_run_progress(
    pool: &SqlitePool,
    scan_run_id: &str,
    cursor_sha: Option<&str>,
    commits_indexed: i64,
    files_processed: i64,
) -> Result<(), ScanRunError> {
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "UPDATE scan_runs
         SET cursor_sha = ?,
             commits_indexed = ?,
             files_processed = ?,
             updated_at = ?
         WHERE id = ?",
    )
    .bind(cursor_sha)
    .bind(commits_indexed)
    .bind(files_processed)
    .bind(&now)
    .bind(scan_run_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Mark a scan run as completed.
pub async fn complete_scan_run(pool: &SqlitePool, scan_run_id: &str) -> Result<(), ScanRunError> {
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "UPDATE scan_runs
         SET status = ?,
             error_message = NULL,
             updated_at = ?,
             completed_at = ?
         WHERE id = ?",
    )
    .bind(ScanRunStatus::Completed.as_str())
    .bind(&now)
    .bind(&now)
    .bind(scan_run_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Mark a scan run as failed and store the failure reason.
pub async fn fail_scan_run(
    pool: &SqlitePool,
    scan_run_id: &str,
    error_message: &str,
) -> Result<(), ScanRunError> {
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "UPDATE scan_runs
         SET status = ?,
             error_message = ?,
             updated_at = ?,
             completed_at = NULL
         WHERE id = ?",
    )
    .bind(ScanRunStatus::Failed.as_str())
    .bind(error_message)
    .bind(&now)
    .bind(scan_run_id)
    .execute(pool)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::test_utils::seed_workspace_and_repo;
    use tempfile::TempDir;

    #[tokio::test]
    async fn create_scan_run_persists_running_state() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;

        let run = create_scan_run(&pool, &repo_id, "main", "head-sha")
            .await
            .unwrap();

        assert_eq!(run.repo_id, repo_id);
        assert_eq!(run.branch, "main");
        assert_eq!(run.target_head_sha, "head-sha");
        assert_eq!(run.cursor_sha, None);
        assert_eq!(run.status, ScanRunStatus::Running);
        assert_eq!(run.commits_indexed, 0);
        assert_eq!(run.files_processed, 0);
        assert_eq!(run.error_message, None);
        assert_eq!(run.completed_at, None);
    }

    #[tokio::test]
    async fn update_scan_run_progress_updates_cursor_and_counters() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;
        let run = create_scan_run(&pool, &repo_id, "main", "head-sha")
            .await
            .unwrap();

        update_scan_run_progress(&pool, &run.id, Some("cursor-sha"), 12, 34)
            .await
            .unwrap();

        let updated = fetch_scan_run(&pool, &run.id).await.unwrap().unwrap();

        assert_eq!(updated.cursor_sha.as_deref(), Some("cursor-sha"));
        assert_eq!(updated.commits_indexed, 12);
        assert_eq!(updated.files_processed, 34);
        assert_eq!(updated.status, ScanRunStatus::Running);
    }

    #[tokio::test]
    async fn complete_scan_run_sets_completed_status_and_timestamp() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;
        let run = create_scan_run(&pool, &repo_id, "main", "head-sha")
            .await
            .unwrap();

        complete_scan_run(&pool, &run.id).await.unwrap();

        let completed = fetch_scan_run(&pool, &run.id).await.unwrap().unwrap();

        assert_eq!(completed.status, ScanRunStatus::Completed);
        assert!(completed.completed_at.is_some());
        assert!(completed.error_message.is_none());
    }

    #[tokio::test]
    async fn fail_scan_run_sets_failed_status_and_error_message() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;
        let run = create_scan_run(&pool, &repo_id, "main", "head-sha")
            .await
            .unwrap();

        fail_scan_run(&pool, &run.id, "boom").await.unwrap();

        let failed = fetch_scan_run(&pool, &run.id).await.unwrap().unwrap();

        assert_eq!(failed.status, ScanRunStatus::Failed);
        assert_eq!(failed.error_message.as_deref(), Some("boom"));
        assert!(failed.completed_at.is_none());
    }
}
