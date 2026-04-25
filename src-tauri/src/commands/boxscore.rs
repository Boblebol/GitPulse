use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::aggregation::{evaluate_raw_score, recalculate_all, AggError};
use crate::aggregation::formulas::FormulaError;
use crate::models::stats::StatsDailyDeveloper;
use crate::AppState;

// ── Response types ────────────────────────────────────────────────────────────

/// One row in the leaderboard: ranked developer with period stats.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct LeaderboardEntry {
    pub rank: i64,
    pub developer_id: String,
    pub developer_name: String,
    pub total_commits: i64,
    pub total_insertions: i64,
    pub total_deletions: i64,
    /// Sum of daily player_score over the period. Used for ranking.
    pub total_player_score: f64,
    pub active_days: i64,
    pub best_streak: i64,
}

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub(crate) enum BoxError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("aggregation error: {0}")]
    Agg(#[from] AggError),
    #[error("invalid formula: {0}")]
    Formula(#[from] FormulaError),
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Return the box-score row for a specific developer / repo / date.
/// Returns `None` if the developer was not active on that date.
#[tauri::command]
pub async fn get_box_score(
    state: tauri::State<'_, AppState>,
    developer_id: String,
    repo_id: String,
    date: String,
) -> Result<Option<StatsDailyDeveloper>, String> {
    inner_get_box_score(&state.db, &developer_id, &repo_id, &date)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_box_score(
    pool: &SqlitePool,
    developer_id: &str,
    repo_id: &str,
    date: &str,
) -> Result<Option<StatsDailyDeveloper>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, developer_id, repo_id, date,
                commits, insertions, deletions, files_touched,
                streak, player_score, top_file_id
         FROM stats_daily_developer
         WHERE developer_id = ? AND repo_id = ? AND date = ?",
    )
    .bind(developer_id)
    .bind(repo_id)
    .bind(date)
    .fetch_optional(pool)
    .await
}

/// Ranked leaderboard for a repo over a date range (`YYYY-MM-DD`).
/// Ordered by average player score descending.
#[tauri::command]
pub async fn get_leaderboard(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    from_date: String,
    to_date: String,
) -> Result<Vec<LeaderboardEntry>, String> {
    inner_get_leaderboard(&state.db, &repo_id, &from_date, &to_date)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_leaderboard(
    pool: &SqlitePool,
    repo_id: &str,
    from_date: &str,
    to_date: &str,
) -> Result<Vec<LeaderboardEntry>, sqlx::Error> {
    sqlx::query_as(
        "WITH agg AS (
             SELECT sdd.developer_id,
                    d.name                   AS developer_name,
                    SUM(sdd.commits)         AS total_commits,
                    SUM(sdd.insertions)      AS total_insertions,
                    SUM(sdd.deletions)       AS total_deletions,
                    SUM(sdd.player_score)    AS total_player_score,
                    COUNT(sdd.date)          AS active_days,
                    MAX(sdd.streak)          AS best_streak
             FROM stats_daily_developer sdd
             JOIN developers d ON d.id = sdd.developer_id
             WHERE sdd.repo_id = ?
               AND sdd.date BETWEEN ? AND ?
             GROUP BY sdd.developer_id, d.name
         )
         SELECT ROW_NUMBER() OVER (ORDER BY total_player_score DESC) AS rank,
                developer_id, developer_name,
                total_commits, total_insertions, total_deletions,
                total_player_score, active_days, best_streak
         FROM agg
         ORDER BY rank",
    )
    .bind(repo_id)
    .bind(from_date)
    .bind(to_date)
    .fetch_all(pool)
    .await
}

/// Update the player-score formula, validate it, then rebuild aggregates.
#[tauri::command]
pub async fn update_formula(
    state: tauri::State<'_, AppState>,
    expression: String,
) -> Result<(), String> {
    inner_update_formula(&state.db, expression)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_update_formula(
    pool: &SqlitePool,
    expression: String,
) -> Result<(), BoxError> {
    // Validate formula with dummy values before persisting.
    evaluate_raw_score(&expression, 1, 0, 0, 0, 0)?;

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE metric_formulas SET expression = ?, updated_at = ? WHERE name = 'player_score'",
    )
    .bind(&expression)
    .bind(&now)
    .execute(pool)
    .await?;

    recalculate_all(pool).await?;
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::test_utils::{commit_at, init_repo, seed_workspace_and_repo};
    use tempfile::TempDir;

    const D1: i64 = 1704067200; // 2024-01-01
    const D2: i64 = 1704153600; // 2024-01-02
    const D3: i64 = 1704240000; // 2024-01-03

    async fn full_setup(tmp: &TempDir, pool: &SqlitePool) -> String {
        let (_, rid) = seed_workspace_and_repo(pool, tmp.path()).await;
        crate::git::scan_repo(pool, &rid, tmp.path(), "main").await.unwrap();
        recalculate_all(pool).await.unwrap();
        rid
    }

    // ── get_box_score ─────────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn box_score_returns_day_stats() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1"), ("b.txt", "2")], D1);
        let rid = full_setup(&tmp, &pool).await;

        let dev_id: String = sqlx::query_scalar("SELECT id FROM developers LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();

        let card = inner_get_box_score(&pool, &dev_id, &rid, "2024-01-01")
            .await
            .unwrap()
            .expect("card must exist for D1");

        assert_eq!(card.commits, 1);
        assert_eq!(card.files_touched, 2);
        assert_eq!(card.streak, 1);
        // Single row → 100th percentile
        assert!((card.player_score - 100.0).abs() < 1e-6);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn box_score_returns_none_for_inactive_day() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        let rid = full_setup(&tmp, &pool).await;

        let dev_id: String = sqlx::query_scalar("SELECT id FROM developers LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();

        // D2 has no commit
        let card = inner_get_box_score(&pool, &dev_id, &rid, "2024-01-02")
            .await
            .unwrap();
        assert!(card.is_none());
    }

    // ── get_leaderboard ───────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn leaderboard_ranks_developers_by_score() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        // Alice: 2 commits on 2 separate days → total_player_score = 50 + 100 = 150
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "v1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "v2")], D1 + 10); // same day D1
        commit_at(&repo, "c3", "Alice", "a@x.com", &[("c.txt", "v3")], D2);
        // Bob: 1 commit on 1 day → total_player_score = 100 (single-row = 100th pct)
        commit_at(&repo, "c4", "Bob", "b@x.com", &[("d.txt", "1")], D3);
        let rid = full_setup(&tmp, &pool).await;

        // Alice has 2 days: D1 (2 commits, 100th) + D2 (1 commit, 50th) = 150 total
        // Bob  has 1 day:  D3 (1 commit, 100th)                         = 100 total
        // → Alice ranked #1
        let board = inner_get_leaderboard(&pool, &rid, "2024-01-01", "2024-01-31")
            .await
            .unwrap();

        assert_eq!(board.len(), 2);
        assert_eq!(board[0].rank, 1);
        assert_eq!(board[0].developer_name, "Alice");
        assert_eq!(board[1].rank, 2);
        assert_eq!(board[1].developer_name, "Bob");
        assert!(board[0].total_player_score > board[1].total_player_score);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn leaderboard_empty_for_out_of_range_dates() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        let rid = full_setup(&tmp, &pool).await;

        let board = inner_get_leaderboard(&pool, &rid, "2025-01-01", "2025-12-31")
            .await
            .unwrap();
        assert!(board.is_empty());
    }

    // ── update_formula (E2E) ──────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn update_formula_changes_player_scores() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        // D1: small file (1 line) → low raw score with default formula
        // D2: large file (50 lines) → high raw score with default formula
        // After switching to "commits * 1", both days have equal raw → equal percentiles
        let big = "x\n".repeat(50);
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", &big)], D2);
        full_setup(&tmp, &pool).await;

        // Capture score before formula change (both rows → each is 50th / 100th percentile)
        let scores_before: Vec<f64> =
            sqlx::query_scalar("SELECT player_score FROM stats_daily_developer ORDER BY date")
                .fetch_all(&pool)
                .await
                .unwrap();

        // Switch to a formula that is purely commit-count based → equal raw → both at 50th percentile
        inner_update_formula(&pool, "commits * 1".into()).await.unwrap();

        let scores_after: Vec<f64> =
            sqlx::query_scalar("SELECT player_score FROM stats_daily_developer ORDER BY date")
                .fetch_all(&pool)
                .await
                .unwrap();

        assert_eq!(scores_after.len(), 2);
        // Verify the formula was actually persisted
        let stored: String =
            sqlx::query_scalar("SELECT expression FROM metric_formulas WHERE name='player_score'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored, "commits * 1");

        // Scores should have changed from the default formula
        assert_ne!(
            scores_before, scores_after,
            "scores should change when formula changes"
        );
    }

    #[tokio::test]
    async fn update_formula_rejects_invalid_expression() {
        let pool = test_pool().await;
        let err = inner_update_formula(&pool, "commits + !!!".into())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("invalid formula") || err.to_string().contains("formula"));
    }

    #[tokio::test]
    async fn update_formula_does_not_persist_on_invalid() {
        let pool = test_pool().await;
        let original: String =
            sqlx::query_scalar("SELECT expression FROM metric_formulas WHERE name='player_score'")
                .fetch_one(&pool)
                .await
                .unwrap();

        let _ = inner_update_formula(&pool, "commits + !!!".into()).await;

        let after: String =
            sqlx::query_scalar("SELECT expression FROM metric_formulas WHERE name='player_score'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(original, after, "formula must not change if validation fails");
    }
}
