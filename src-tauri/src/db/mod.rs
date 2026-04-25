pub mod migrations;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::Path;
use std::str::FromStr;
use thiserror::Error;

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
    let pool = SqlitePool::connect("sqlite::memory:").await.expect("in-memory pool");
    migrations::run(&pool).await.expect("test migrations");
    pool
}

/// Open (or create) the SQLite database at `db_path`, apply all pending migrations,
/// and return a connection pool with the recommended pragmas.
pub async fn open(db_path: &Path) -> Result<SqlitePool, DbError> {
    let options = SqliteConnectOptions::from_str(&format!(
        "sqlite://{}?mode=rwc",
        db_path.display()
    ))?
    .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
    .foreign_keys(true)
    .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
    .pragma("cache_size", "-32000"); // 32 MB page cache

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    migrations::run(&pool).await?;

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Migration integrity ───────────────────────────────────────────────────

    #[tokio::test]
    async fn migrations_create_all_expected_tables() {
        let pool = test_pool().await;

        let tables: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        let expected = [
            "aliases",
            "commit_file_changes",
            "commits",
            "developers",
            "file_name_history",
            "files",
            "metric_formulas",
            "repos",
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
        sqlx::query(
            "INSERT INTO developers (id, name, created_at) VALUES ('d1', 'Dev', ?)",
        )
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
}
