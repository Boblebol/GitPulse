use chrono::Utc;
use serde::Serialize;
use sqlx::SqlitePool;

use crate::AppState;

pub(crate) const DEFAULT_PLAYER_SCORE_FORMULA: &str =
    "(commits * 10) + (insertions * 0.5) - (deletions * 0.3) + (files_touched * 2) + (streak_bonus * 3)";

pub(crate) const USER_DATA_TABLES: &[&str] = &[
    "dirty_aggregate_scopes",
    "repo_branch_cursors",
    "scan_runs",
    "stats_daily_developer",
    "stats_daily_file",
    "stats_daily_directory",
    "stats_developer_global",
    "stats_file_global",
    "stats_directory_global",
    "commit_file_changes",
    "commits",
    "file_name_history",
    "files",
    "aliases",
    "developers",
    "workspace_repos",
    "repos",
    "workspaces",
];

#[derive(Debug, thiserror::Error)]
pub(crate) enum DataError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("aggregate error: {0}")]
    Aggregate(#[from] crate::aggregation::engine::AggError),
    #[error("scan state error: {0}")]
    Scan(#[from] crate::models::scan::ScanRunError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AggregateRebuildResult {
    pub started_at: String,
    pub completed_at: String,
    pub status: String,
}

#[tauri::command]
pub async fn delete_all_data(state: tauri::State<'_, AppState>) -> Result<(), String> {
    inner_delete_all_data(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rebuild_aggregates(
    state: tauri::State<'_, AppState>,
) -> Result<AggregateRebuildResult, String> {
    inner_rebuild_aggregates(&state.db)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_delete_all_data(pool: &SqlitePool) -> Result<(), DataError> {
    let mut tx = pool.begin().await?;

    for table in USER_DATA_TABLES {
        let statement = format!("DELETE FROM {table}");
        sqlx::query(&statement).execute(&mut *tx).await?;
    }

    sqlx::query(
        "UPDATE metric_formulas
         SET expression = ?, updated_at = ?
         WHERE name = 'player_score'",
    )
    .bind(DEFAULT_PLAYER_SCORE_FORMULA)
    .bind(Utc::now().to_rfc3339())
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

pub(crate) async fn inner_rebuild_aggregates(
    pool: &SqlitePool,
) -> Result<AggregateRebuildResult, DataError> {
    crate::models::scan::ensure_no_running_scan(pool).await?;

    let started_at = Utc::now().to_rfc3339();
    crate::aggregation::engine::recalculate_all(pool).await?;
    let completed_at = Utc::now().to_rfc3339();

    Ok(AggregateRebuildResult {
        started_at,
        completed_at,
        status: "completed".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use crate::db::test_pool;

    #[tokio::test]
    async fn delete_all_data_clears_user_tables_and_resets_formula() {
        let pool = test_pool().await;

        sqlx::query(
            "UPDATE metric_formulas SET expression = 'commits', updated_at = '2026-01-01T00:00:00Z'
             WHERE name = 'player_score'",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'WS', '2024-01-01T00:00:00Z')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('repo1', 'ws1', 'Repo', '/tmp/gitpulse-repo', 'main', '2024-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO workspace_repos (workspace_id, repo_id) VALUES ('ws1', 'repo1')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO developers (id, name, created_at) VALUES ('dev1', 'Dev', '2024-01-01T00:00:00Z')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO aliases (id, developer_id, git_name, git_email, created_at)
             VALUES ('alias1', 'dev1', 'Dev', 'dev@example.com', '2024-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO files (id, repo_id, current_path, created_at)
             VALUES ('file1', 'repo1', 'src/main.rs', '2024-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO file_name_history (id, file_id, old_path, new_path, changed_at)
             VALUES ('hist1', 'file1', 'main.rs', 'src/main.rs', '2024-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO commits (id, repo_id, sha, author_alias_id, message, committed_at, insertions, deletions, files_changed)
             VALUES ('commit1', 'repo1', 'abc', 'alias1', 'message', '2024-01-01T00:00:00Z', 10, 2, 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO commit_file_changes (id, commit_id, file_id, change_type, insertions, deletions)
             VALUES ('change1', 'commit1', 'file1', 'M', 10, 2)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO stats_daily_developer (id, developer_id, repo_id, date, commits, insertions, deletions, files_touched, player_score, top_file_id)
             VALUES ('sdd1', 'dev1', 'repo1', '2024-01-01', 1, 10, 2, 1, 42.0, 'file1')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO stats_daily_file (id, file_id, date, commits, insertions, deletions, churn_score)
             VALUES ('sdf1', 'file1', '2024-01-01', 1, 10, 2, 12.0)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO stats_daily_directory (id, repo_id, directory_path, date, commits, insertions, deletions, files_touched)
             VALUES ('sdg1', 'repo1', 'src', '2024-01-01', 1, 10, 2, 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO stats_developer_global (id, developer_id, total_commits, total_insertions, total_deletions, files_touched, active_days, longest_streak, avg_commit_size)
             VALUES ('devg1', 'dev1', 1, 10, 2, 1, 1, 1, 12.0)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO stats_file_global (id, file_id, commit_count, total_insertions, total_deletions, unique_authors, churn_score, co_touch_score)
             VALUES ('fileg1', 'file1', 1, 10, 2, 1, 12.0, 0.0)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO stats_directory_global (id, repo_id, directory_path, commit_count, total_insertions, total_deletions, files_touched, unique_authors, churn_score)
             VALUES ('dirg1', 'repo1', 'src', 1, 10, 2, 1, 1, 12.0)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO scan_runs (id, repo_id, branch, target_head_sha, status, started_at, updated_at)
             VALUES ('scan1', 'repo1', 'main', 'abc', 'completed', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO repo_branch_cursors (repo_id, branch_name, last_indexed_commit_sha, last_scan_run_id, updated_at)
             VALUES ('repo1', 'main', 'abc', 'scan1', '2024-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO dirty_aggregate_scopes (repo_id, date, created_at, updated_at)
             VALUES ('repo1', '2024-01-01', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        super::inner_delete_all_data(&pool).await.unwrap();

        for table in super::USER_DATA_TABLES {
            let sql = format!("SELECT COUNT(*) FROM {table}");
            let count: i64 = sqlx::query_scalar(&sql).fetch_one(&pool).await.unwrap();
            assert_eq!(count, 0, "{table} should be empty");
        }

        let expression: String = sqlx::query_scalar(
            "SELECT expression FROM metric_formulas WHERE name = 'player_score'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(expression, super::DEFAULT_PLAYER_SCORE_FORMULA);
    }

    #[tokio::test]
    async fn rebuild_aggregates_recreates_stats_from_raw_facts() {
        let pool = test_pool().await;
        seed_raw_commit(&pool).await;

        for table in [
            "stats_daily_developer",
            "stats_daily_file",
            "stats_daily_directory",
            "stats_developer_global",
            "stats_file_global",
            "stats_directory_global",
        ] {
            let sql = format!("SELECT COUNT(*) FROM {table}");
            let count: i64 = sqlx::query_scalar(&sql).fetch_one(&pool).await.unwrap();
            assert_eq!(count, 0, "{table} should start empty");
        }

        let result = super::inner_rebuild_aggregates(&pool).await.unwrap();

        assert_eq!(result.status, "completed");
        assert!(!result.started_at.is_empty());
        assert!(!result.completed_at.is_empty());

        let developer_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stats_daily_developer")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(developer_rows, 1);

        let commits: i64 = sqlx::query_scalar(
            "SELECT commits FROM stats_daily_developer WHERE developer_id = 'dev1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(commits, 1);

        let global_developer_rows: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM stats_developer_global")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(global_developer_rows, 1);
    }

    #[tokio::test]
    async fn rebuild_aggregates_rejects_running_scans() {
        let pool = test_pool().await;
        seed_raw_commit(&pool).await;

        sqlx::query(
            "INSERT INTO scan_runs
             (id, repo_id, branch, target_head_sha, cursor_sha, status,
              commits_indexed, files_processed, error_message,
              started_at, updated_at, completed_at)
             VALUES ('scan1', 'repo1', 'main', 'abc', NULL, 'running',
                     0, 0, NULL, '2024-01-01T00:00:00Z',
                     '2024-01-01T00:00:00Z', NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let error = super::inner_rebuild_aggregates(&pool)
            .await
            .expect_err("running scans should block aggregate rebuilds")
            .to_string();

        assert!(error.contains("scan already running"));

        let developer_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stats_daily_developer")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(developer_rows, 0);
    }

    async fn seed_raw_commit(pool: &sqlx::SqlitePool) {
        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'WS', '2024-01-01T00:00:00Z')")
            .execute(pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('repo1', 'ws1', 'Repo', '/tmp/gitpulse-repo', 'main', '2024-01-01T00:00:00Z')",
        )
        .execute(pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO workspace_repos (workspace_id, repo_id) VALUES ('ws1', 'repo1')")
            .execute(pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO developers (id, name, created_at) VALUES ('dev1', 'Dev', '2024-01-01T00:00:00Z')")
            .execute(pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO aliases (id, developer_id, git_name, git_email, created_at)
             VALUES ('alias1', 'dev1', 'Dev', 'dev@example.com', '2024-01-01T00:00:00Z')",
        )
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO files (id, repo_id, current_path, created_at)
             VALUES ('file1', 'repo1', 'src/main.rs', '2024-01-01T00:00:00Z')",
        )
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO commits
             (id, repo_id, sha, author_alias_id, message, committed_at,
              insertions, deletions, files_changed)
             VALUES ('commit1', 'repo1', 'abc', 'alias1', 'message',
                     '2024-01-01T12:00:00Z', 10, 2, 1)",
        )
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO commit_file_changes
             (id, commit_id, file_id, change_type, insertions, deletions)
             VALUES ('change1', 'commit1', 'file1', 'M', 10, 2)",
        )
        .execute(pool)
        .await
        .unwrap();
    }
}
