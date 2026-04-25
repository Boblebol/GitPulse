use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
pub struct RepoBranchCursor {
    pub repo_id: String,
    pub branch_name: String,
    pub last_indexed_commit_sha: String,
    pub last_scan_run_id: Option<String>,
    pub updated_at: String,
}

pub async fn fetch_repo_branch_cursor(
    pool: &SqlitePool,
    repo_id: &str,
    branch_name: &str,
) -> Result<Option<RepoBranchCursor>, sqlx::Error> {
    sqlx::query_as(
        "SELECT repo_id, branch_name, last_indexed_commit_sha, last_scan_run_id, updated_at
         FROM repo_branch_cursors
         WHERE repo_id = ? AND branch_name = ?",
    )
    .bind(repo_id)
    .bind(branch_name)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_repo_branch_cursor(
    pool: &SqlitePool,
    repo_id: &str,
    branch_name: &str,
    last_indexed_commit_sha: &str,
    last_scan_run_id: Option<&str>,
) -> Result<RepoBranchCursor, sqlx::Error> {
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO repo_branch_cursors
         (repo_id, branch_name, last_indexed_commit_sha, last_scan_run_id, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(repo_id, branch_name) DO UPDATE SET
             last_indexed_commit_sha = excluded.last_indexed_commit_sha,
             last_scan_run_id = excluded.last_scan_run_id,
             updated_at = excluded.updated_at",
    )
    .bind(repo_id)
    .bind(branch_name)
    .bind(last_indexed_commit_sha)
    .bind(last_scan_run_id)
    .bind(&now)
    .execute(pool)
    .await?;

    fetch_repo_branch_cursor(pool, repo_id, branch_name)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::models::scan::create_scan_run;
    use crate::test_utils::seed_workspace_and_repo;
    use tempfile::TempDir;

    #[tokio::test]
    async fn fetch_repo_branch_cursor_returns_none_when_missing() {
        let pool = test_pool().await;

        let cursor = fetch_repo_branch_cursor(&pool, "missing-repo", "main")
            .await
            .unwrap();

        assert!(cursor.is_none());
    }

    #[tokio::test]
    async fn upsert_repo_branch_cursor_inserts_cursor_without_scan_run() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;

        let cursor = upsert_repo_branch_cursor(&pool, &repo_id, "main", "commit-a", None)
            .await
            .unwrap();

        assert_eq!(cursor.repo_id, repo_id);
        assert_eq!(cursor.branch_name, "main");
        assert_eq!(cursor.last_indexed_commit_sha, "commit-a");
        assert_eq!(cursor.last_scan_run_id, None);
        assert!(!cursor.updated_at.is_empty());
    }

    #[tokio::test]
    async fn upsert_repo_branch_cursor_updates_existing_branch_cursor() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;
        let scan_run = create_scan_run(&pool, &repo_id, "main", "head-sha")
            .await
            .unwrap();

        upsert_repo_branch_cursor(&pool, &repo_id, "main", "commit-a", None)
            .await
            .unwrap();

        let cursor =
            upsert_repo_branch_cursor(&pool, &repo_id, "main", "commit-b", Some(&scan_run.id))
                .await
                .unwrap();

        assert_eq!(cursor.last_indexed_commit_sha, "commit-b");
        assert_eq!(
            cursor.last_scan_run_id.as_deref(),
            Some(scan_run.id.as_str())
        );

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM repo_branch_cursors WHERE repo_id = ? AND branch_name = ?",
        )
        .bind(&repo_id)
        .bind("main")
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(count, 1);
    }
}
