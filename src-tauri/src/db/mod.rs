pub mod migrations;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::Path;
use std::str::FromStr;
use thiserror::Error;
use tracing::warn;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Create an in-memory SQLite pool with all migrations applied.
/// Used exclusively in tests.
#[cfg(test)]
pub(crate) async fn test_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:")
        .await
        .expect("in-memory pool");
    migrations::run(&pool).await.expect("test migrations");
    pool
}

/// Open (or create) the SQLite database at `db_path`, apply all pending migrations,
/// and return a connection pool with the recommended pragmas.
pub async fn open(db_path: &Path) -> Result<SqlitePool, DbError> {
    let options =
        SqliteConnectOptions::from_str(&format!("sqlite://{}?mode=rwc", db_path.display()))?
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .foreign_keys(true)
            .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
            .pragma("cache_size", "-32000"); // 32 MB page cache

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    clear_interrupted_scan_runs(&pool).await?;
    migrations::run(&pool).await?;

    Ok(pool)
}

async fn clear_interrupted_scan_runs(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    if !table_exists(pool, "scan_runs").await? {
        return Ok(());
    }

    let result = sqlx::query(
        "UPDATE scan_runs
         SET status = 'failed',
             error_message = COALESCE(
                 error_message,
                 'Scan was interrupted by a previous GitPulse shutdown. Start a new scan to continue.'
             ),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             completed_at = NULL
         WHERE status = 'running'",
    )
    .execute(pool)
    .await?;

    if result.rows_affected() > 0 {
        warn!(
            rows_affected = result.rows_affected(),
            "marked interrupted running scan runs as failed during startup"
        );
    }

    Ok(())
}

async fn table_exists(pool: &SqlitePool, table_name: &str) -> Result<bool, sqlx::Error> {
    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1
         FROM sqlite_master
         WHERE type = 'table' AND name = ?
         LIMIT 1",
    )
    .bind(table_name)
    .fetch_optional(pool)
    .await?;

    Ok(exists.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Executor;

    async fn apply_embedded_migrations_through(pool: &SqlitePool, max_version: i64) {
        pool.execute(
            r#"
CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
);
            "#,
        )
        .await
        .unwrap();

        let migrator = sqlx::migrate!("src/db/migrations");
        for migration in migrator
            .iter()
            .filter(|migration| migration.version <= max_version)
        {
            pool.execute(&*migration.sql).await.unwrap();
            sqlx::query(
                "INSERT INTO _sqlx_migrations
                 (version, description, success, checksum, execution_time)
                 VALUES (?, ?, TRUE, ?, 0)",
            )
            .bind(migration.version)
            .bind(&*migration.description)
            .bind(&*migration.checksum)
            .execute(pool)
            .await
            .unwrap();
        }
    }

    // ── Migration integrity ───────────────────────────────────────────────────

    #[tokio::test]
    async fn migrations_create_all_expected_tables() {
        let pool = test_pool().await;

        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .unwrap();

        let expected = [
            "aliases",
            "commit_file_changes",
            "commits",
            "developers",
            "dirty_aggregate_scopes",
            "file_name_history",
            "files",
            "metric_formulas",
            "repos",
            "repo_branch_cursors",
            "scan_runs",
            "stats_daily_developer",
            "stats_daily_directory",
            "stats_daily_file",
            "stats_developer_global",
            "stats_directory_global",
            "stats_file_global",
            "workspace_repos",
            "workspaces",
        ];

        for table in &expected {
            assert!(
                tables.contains(&table.to_string()),
                "missing table: {table}"
            );
        }
    }

    #[tokio::test]
    async fn migrations_seed_player_score_formula() {
        let pool = test_pool().await;

        let expr: String = sqlx::query_scalar(
            "SELECT expression FROM metric_formulas WHERE name = 'player_score'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        // Formula must reference the documented variables.
        assert!(expr.contains("commits"));
        assert!(expr.contains("insertions"));
        assert!(expr.contains("deletions"));
        assert!(expr.contains("files_touched"));
        assert!(expr.contains("streak_bonus"));
    }

    #[tokio::test]
    async fn migrations_foreign_key_constraint_on_repos() {
        let pool = test_pool().await;

        // Inserting a repo with a non-existent workspace_id must fail.
        let result = sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('r1', 'nonexistent-ws', 'test', '/tmp/test', 'main', '2024-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await;

        assert!(
            result.is_err(),
            "FK constraint on repos.workspace_id should have been enforced"
        );
    }

    #[tokio::test]
    async fn migrations_unique_constraint_on_alias_name_email() {
        let pool = test_pool().await;

        let now = "2024-01-01T00:00:00Z";
        sqlx::query("INSERT INTO developers (id, name, created_at) VALUES ('d1', 'Dev', ?)")
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO aliases (id, developer_id, git_name, git_email, created_at)
             VALUES ('a1', 'd1', 'Dev', 'dev@example.com', ?)",
        )
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        // Inserting a second alias with the same (git_name, git_email) must fail.
        let result = sqlx::query(
            "INSERT INTO aliases (id, developer_id, git_name, git_email, created_at)
             VALUES ('a2', 'd1', 'Dev', 'dev@example.com', ?)",
        )
        .bind(now)
        .execute(&pool)
        .await;

        assert!(
            result.is_err(),
            "UNIQUE constraint on (git_name, git_email) should have been enforced"
        );
    }

    #[tokio::test]
    async fn migrations_scan_runs_cascade_when_repo_is_deleted() {
        let pool = test_pool().await;
        let now = "2024-01-01T00:00:00Z";

        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'WS', ?)")
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('repo1', 'ws1', 'Repo', '/tmp/repo1', 'main', ?)",
        )
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO scan_runs
             (id, repo_id, branch, target_head_sha, cursor_sha, status,
              commits_indexed, files_processed, error_message,
              started_at, updated_at, completed_at)
             VALUES ('scan1', 'repo1', 'main', 'head-sha', NULL, 'running',
                     0, 0, NULL, ?, ?, NULL)",
        )
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM repos WHERE id = 'repo1'")
            .execute(&pool)
            .await
            .unwrap();

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM scan_runs")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn migrations_repo_branch_cursors_are_unique_per_repo_branch() {
        let pool = test_pool().await;
        let now = "2024-01-01T00:00:00Z";

        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'WS', ?)")
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('repo1', 'ws1', 'Repo', '/tmp/repo1', 'main', ?)",
        )
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO repo_branch_cursors
             (repo_id, branch_name, last_indexed_commit_sha, last_scan_run_id, updated_at)
             VALUES ('repo1', 'main', 'sha-a', NULL, ?)",
        )
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        let result = sqlx::query(
            "INSERT INTO repo_branch_cursors
             (repo_id, branch_name, last_indexed_commit_sha, last_scan_run_id, updated_at)
             VALUES ('repo1', 'main', 'sha-b', NULL, ?)",
        )
        .bind(now)
        .execute(&pool)
        .await;

        assert!(
            result.is_err(),
            "UNIQUE constraint on repo_branch_cursors(repo_id, branch_name) should have been enforced"
        );
    }

    #[tokio::test]
    async fn migrations_repo_branch_cursors_cascade_with_repo_and_null_deleted_scan_run() {
        let pool = test_pool().await;
        let now = "2024-01-01T00:00:00Z";

        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'WS', ?)")
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('repo1', 'ws1', 'Repo', '/tmp/repo1', 'main', ?)",
        )
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO scan_runs
             (id, repo_id, branch, target_head_sha, cursor_sha, status,
              commits_indexed, files_processed, error_message,
              started_at, updated_at, completed_at)
             VALUES ('scan1', 'repo1', 'main', 'head-sha', NULL, 'running',
                     0, 0, NULL, ?, ?, NULL)",
        )
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO repo_branch_cursors
             (repo_id, branch_name, last_indexed_commit_sha, last_scan_run_id, updated_at)
             VALUES ('repo1', 'main', 'sha-a', 'scan1', ?)",
        )
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM scan_runs WHERE id = 'scan1'")
            .execute(&pool)
            .await
            .unwrap();

        let scan_run_id: Option<String> = sqlx::query_scalar(
            "SELECT last_scan_run_id FROM repo_branch_cursors WHERE repo_id = 'repo1' AND branch_name = 'main'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(scan_run_id, None);

        sqlx::query("DELETE FROM repos WHERE id = 'repo1'")
            .execute(&pool)
            .await
            .unwrap();

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM repo_branch_cursors")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn migrations_dirty_aggregate_scopes_are_unique_per_repo_date_and_cascade() {
        let pool = test_pool().await;
        let now = "2024-01-01T00:00:00Z";

        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'WS', ?)")
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('repo1', 'ws1', 'Repo', '/tmp/repo1', 'main', ?)",
        )
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO dirty_aggregate_scopes (repo_id, date, created_at, updated_at)
             VALUES ('repo1', '2024-03-14', ?, ?)",
        )
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        let duplicate = sqlx::query(
            "INSERT INTO dirty_aggregate_scopes (repo_id, date, created_at, updated_at)
             VALUES ('repo1', '2024-03-14', ?, ?)",
        )
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;

        assert!(
            duplicate.is_err(),
            "PRIMARY KEY on dirty_aggregate_scopes(repo_id, date) should have been enforced"
        );

        sqlx::query("DELETE FROM repos WHERE id = 'repo1'")
            .execute(&pool)
            .await
            .unwrap();

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dirty_aggregate_scopes")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn open_clears_legacy_running_scans_before_single_running_migration() {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("gitpulse.db");
        let url = format!("sqlite://{}?mode=rwc", db_path.display());
        let legacy_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();

        apply_embedded_migrations_through(&legacy_pool, 5).await;

        let now = "2024-01-01T00:00:00Z";
        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'WS', ?)")
            .bind(now)
            .execute(&legacy_pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('repo1', 'ws1', 'Repo', '/tmp/repo1', 'main', ?)",
        )
        .bind(now)
        .execute(&legacy_pool)
        .await
        .unwrap();

        for scan_id in ["scan1", "scan2"] {
            sqlx::query(
                "INSERT INTO scan_runs
                 (id, repo_id, branch, target_head_sha, cursor_sha, status,
                  commits_indexed, files_processed, error_message,
                  started_at, updated_at, completed_at)
                 VALUES (?, 'repo1', 'main', 'head-sha', NULL, 'running',
                         0, 0, NULL, ?, ?, NULL)",
            )
            .bind(scan_id)
            .bind(now)
            .bind(now)
            .execute(&legacy_pool)
            .await
            .unwrap();
        }

        legacy_pool.close().await;

        let pool = open(&db_path).await.unwrap();

        let running_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM scan_runs WHERE status = 'running'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let failed_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM scan_runs WHERE status = 'failed'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let migration_006_applied: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE version = 6")
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(running_count, 0);
        assert_eq!(failed_count, 2);
        assert_eq!(migration_006_applied, 1);

        sqlx::query(
            "INSERT INTO scan_runs
             (id, repo_id, branch, target_head_sha, cursor_sha, status,
              commits_indexed, files_processed, error_message,
              started_at, updated_at, completed_at)
             VALUES ('scan3', 'repo1', 'main', 'head-sha', NULL, 'running',
                     0, 0, NULL, ?, ?, NULL)",
        )
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        let duplicate_running = sqlx::query(
            "INSERT INTO scan_runs
             (id, repo_id, branch, target_head_sha, cursor_sha, status,
              commits_indexed, files_processed, error_message,
              started_at, updated_at, completed_at)
             VALUES ('scan4', 'repo1', 'main', 'head-sha', NULL, 'running',
                     0, 0, NULL, ?, ?, NULL)",
        )
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;

        assert!(duplicate_running.is_err());
    }

    #[tokio::test]
    async fn open_clears_interrupted_running_scan_after_single_running_migration() {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("gitpulse.db");
        let pool = open(&db_path).await.unwrap();

        let now = "2024-01-01T00:00:00Z";
        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'WS', ?)")
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES ('repo1', 'ws1', 'Repo', '/tmp/repo1', 'main', ?)",
        )
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO scan_runs
             (id, repo_id, branch, target_head_sha, cursor_sha, status,
              commits_indexed, files_processed, error_message,
              started_at, updated_at, completed_at)
             VALUES ('scan1', 'repo1', 'main', 'head-sha', NULL, 'running',
                     0, 0, NULL, ?, ?, NULL)",
        )
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();
        pool.close().await;

        let reopened = open(&db_path).await.unwrap();

        let status: String = sqlx::query_scalar("SELECT status FROM scan_runs WHERE id = 'scan1'")
            .fetch_one(&reopened)
            .await
            .unwrap();

        assert_eq!(status, "failed");
    }
}
