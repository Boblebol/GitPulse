use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::models::stats::{StatsDailyDeveloper, StatsDirectoryGlobal};
use crate::AppState;

// ── Enriched response types ───────────────────────────────────────────────────

/// Global developer stats enriched with the developer's display name.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct DeveloperGlobalRow {
    pub developer_id: String,
    pub developer_name: String,
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

/// Per-file global stats enriched with the file's current path.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct FileGlobalRow {
    pub file_id: String,
    pub file_path: String,
    pub commit_count: i64,
    pub total_insertions: i64,
    pub total_deletions: i64,
    pub unique_authors: i64,
    pub churn_score: f64,
    pub co_touch_score: f64,
    pub first_seen_at: Option<String>,
    pub last_seen_at: Option<String>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// All-time developer stats across every repo, with developer names.
#[tauri::command]
pub async fn get_developer_global_stats(
    state: tauri::State<'_, AppState>,
    repo_id: Option<String>,
    workspace_id: Option<String>,
) -> Result<Vec<DeveloperGlobalRow>, String> {
    inner_get_developer_global_stats(&state.db, repo_id.as_deref(), workspace_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_developer_global_stats(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
) -> Result<Vec<DeveloperGlobalRow>, sqlx::Error> {
    match (repo_id, workspace_id) {
        (Some(repo_id), _) => get_developer_stats_for_repo(pool, repo_id).await,
        (None, Some(workspace_id)) => get_developer_stats_for_workspace(pool, workspace_id).await,
        (None, None) => get_developer_stats_global(pool).await,
    }
}

async fn get_developer_stats_global(
    pool: &SqlitePool,
) -> Result<Vec<DeveloperGlobalRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT sdg.developer_id,
                d.name          AS developer_name,
                sdg.total_commits,
                sdg.total_insertions,
                sdg.total_deletions,
                sdg.files_touched,
                sdg.active_days,
                sdg.longest_streak,
                sdg.avg_commit_size,
                sdg.first_commit_at,
                sdg.last_commit_at
         FROM stats_developer_global sdg
         JOIN developers d ON d.id = sdg.developer_id
         ORDER BY sdg.total_commits DESC",
    )
    .fetch_all(pool)
    .await
}

async fn get_developer_stats_for_repo(
    pool: &SqlitePool,
    repo_id: &str,
) -> Result<Vec<DeveloperGlobalRow>, sqlx::Error> {
    sqlx::query_as(
        "WITH daily_agg AS (
             SELECT developer_id,
                    SUM(commits)         AS total_commits,
                    SUM(insertions)      AS total_insertions,
                    SUM(deletions)       AS total_deletions,
                    COUNT(DISTINCT date) AS active_days,
                    MAX(streak)          AS longest_streak,
                    MIN(date)            AS first_commit_at,
                    MAX(date)            AS last_commit_at
             FROM stats_daily_developer
             WHERE commits > 0 AND repo_id = ?
             GROUP BY developer_id
         ),
         unique_files AS (
             SELECT a.developer_id,
                    COUNT(DISTINCT cfc.file_id) AS files_touched
             FROM commit_file_changes cfc
             JOIN commits c ON cfc.commit_id = c.id
             JOIN aliases a ON c.author_alias_id = a.id
             WHERE c.repo_id = ?
             GROUP BY a.developer_id
         )
         SELECT d.developer_id,
                dev.name AS developer_name,
                d.total_commits,
                d.total_insertions,
                d.total_deletions,
                COALESCE(f.files_touched, 0) AS files_touched,
                d.active_days,
                d.longest_streak,
                CAST(d.total_insertions + d.total_deletions AS REAL)
                    / NULLIF(d.total_commits, 0) AS avg_commit_size,
                d.first_commit_at,
                d.last_commit_at
         FROM daily_agg d
         JOIN developers dev ON dev.id = d.developer_id
         LEFT JOIN unique_files f ON f.developer_id = d.developer_id
         ORDER BY d.total_commits DESC",
    )
    .bind(repo_id)
    .bind(repo_id)
    .fetch_all(pool)
    .await
}

async fn get_developer_stats_for_workspace(
    pool: &SqlitePool,
    workspace_id: &str,
) -> Result<Vec<DeveloperGlobalRow>, sqlx::Error> {
    sqlx::query_as(
        "WITH daily_agg AS (
             SELECT sdd.developer_id,
                    SUM(sdd.commits)         AS total_commits,
                    SUM(sdd.insertions)      AS total_insertions,
                    SUM(sdd.deletions)       AS total_deletions,
                    COUNT(DISTINCT sdd.date) AS active_days,
                    MAX(sdd.streak)          AS longest_streak,
                    MIN(sdd.date)            AS first_commit_at,
                    MAX(sdd.date)            AS last_commit_at
             FROM stats_daily_developer sdd
             JOIN repos r ON r.id = sdd.repo_id
             WHERE sdd.commits > 0 AND r.workspace_id = ?
             GROUP BY sdd.developer_id
         ),
         unique_files AS (
             SELECT a.developer_id,
                    COUNT(DISTINCT cfc.file_id) AS files_touched
             FROM commit_file_changes cfc
             JOIN commits c ON cfc.commit_id = c.id
             JOIN repos r ON r.id = c.repo_id
             JOIN aliases a ON c.author_alias_id = a.id
             WHERE r.workspace_id = ?
             GROUP BY a.developer_id
         )
         SELECT d.developer_id,
                dev.name AS developer_name,
                d.total_commits,
                d.total_insertions,
                d.total_deletions,
                COALESCE(f.files_touched, 0) AS files_touched,
                d.active_days,
                d.longest_streak,
                CAST(d.total_insertions + d.total_deletions AS REAL)
                    / NULLIF(d.total_commits, 0) AS avg_commit_size,
                d.first_commit_at,
                d.last_commit_at
         FROM daily_agg d
         JOIN developers dev ON dev.id = d.developer_id
         LEFT JOIN unique_files f ON f.developer_id = d.developer_id
         ORDER BY d.total_commits DESC",
    )
    .bind(workspace_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await
}

/// Daily stats for one developer in one repo, filtered by an inclusive date range.
/// `from_date` and `to_date` are `YYYY-MM-DD` strings.
#[tauri::command]
pub async fn get_daily_stats(
    state: tauri::State<'_, AppState>,
    developer_id: String,
    repo_id: String,
    from_date: String,
    to_date: String,
) -> Result<Vec<StatsDailyDeveloper>, String> {
    inner_get_daily_stats(&state.db, &developer_id, &repo_id, &from_date, &to_date)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_daily_stats(
    pool: &SqlitePool,
    developer_id: &str,
    repo_id: &str,
    from_date: &str,
    to_date: &str,
) -> Result<Vec<StatsDailyDeveloper>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, developer_id, repo_id, date,
                commits, insertions, deletions, files_touched,
                streak, player_score, top_file_id
         FROM stats_daily_developer
         WHERE developer_id = ?
           AND repo_id      = ?
           AND date BETWEEN ? AND ?
         ORDER BY date",
    )
    .bind(developer_id)
    .bind(repo_id)
    .bind(from_date)
    .bind(to_date)
    .fetch_all(pool)
    .await
}

/// All-time per-file stats for a given repo, with current file paths.
#[tauri::command]
pub async fn get_file_stats(
    state: tauri::State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<FileGlobalRow>, String> {
    inner_get_file_stats(&state.db, &repo_id)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_file_stats(
    pool: &SqlitePool,
    repo_id: &str,
) -> Result<Vec<FileGlobalRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT sfg.file_id,
                f.current_path  AS file_path,
                sfg.commit_count,
                sfg.total_insertions,
                sfg.total_deletions,
                sfg.unique_authors,
                sfg.churn_score,
                sfg.co_touch_score,
                sfg.first_seen_at,
                sfg.last_seen_at
         FROM stats_file_global sfg
         JOIN files f ON f.id = sfg.file_id
         WHERE f.repo_id = ?
         ORDER BY sfg.commit_count DESC",
    )
    .bind(repo_id)
    .fetch_all(pool)
    .await
}

/// All-time per-directory stats for a given repo.
#[tauri::command]
pub async fn get_directory_stats(
    state: tauri::State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<StatsDirectoryGlobal>, String> {
    inner_get_directory_stats(&state.db, &repo_id)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_directory_stats(
    pool: &SqlitePool,
    repo_id: &str,
) -> Result<Vec<StatsDirectoryGlobal>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, repo_id, directory_path,
                commit_count, total_insertions, total_deletions,
                files_touched, unique_authors, churn_score
         FROM stats_directory_global
         WHERE repo_id = ?
         ORDER BY commit_count DESC",
    )
    .bind(repo_id)
    .fetch_all(pool)
    .await
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aggregation::recalculate_all;
    use crate::db::test_pool;
    use crate::models::repo::{Repo, Workspace};
    use crate::test_utils::{commit_at, init_repo, seed_workspace_and_repo};
    use tempfile::TempDir;

    const D1: i64 = 1704067200; // 2024-01-01
    const D2: i64 = 1704153600; // 2024-01-02
    const D3: i64 = 1704240000; // 2024-01-03

    /// Full scan + recalc helper; returns repo_id.
    async fn setup(tmp: &TempDir, pool: &SqlitePool) -> String {
        let (_, rid) = seed_workspace_and_repo(pool, tmp.path()).await;
        crate::git::scan_repo(pool, &rid, tmp.path(), "main")
            .await
            .unwrap();
        recalculate_all(pool).await.unwrap();
        rid
    }

    async fn seed_workspace(pool: &SqlitePool, name: &str) -> String {
        let ws = Workspace::new(name);
        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
            .bind(&ws.id)
            .bind(&ws.name)
            .bind(&ws.created_at)
            .execute(pool)
            .await
            .unwrap();
        ws.id
    }

    async fn seed_repo(
        pool: &SqlitePool,
        workspace_id: &str,
        path: &std::path::Path,
        name: &str,
    ) -> String {
        let repo = Repo::new(workspace_id, name, path.to_string_lossy());
        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&repo.id)
        .bind(&repo.workspace_id)
        .bind(&repo.name)
        .bind(&repo.path)
        .bind(&repo.active_branch)
        .bind(&repo.created_at)
        .execute(pool)
        .await
        .unwrap();
        repo.id
    }

    // ── developer global stats ────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn global_stats_includes_developer_name() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);
        setup(&tmp, &pool).await;

        let rows = inner_get_developer_global_stats(&pool, None, None)
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].developer_name, "Alice");
        assert_eq!(rows[0].total_commits, 2);
        assert_eq!(rows[0].active_days, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn global_stats_ordered_by_commits_desc() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        // Bob: 1 commit, Alice: 2 commits → Alice should come first
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "v1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("a.txt", "v2")], D2);
        commit_at(&repo, "c3", "Bob", "b@x.com", &[("b.txt", "1")], D3);
        setup(&tmp, &pool).await;

        let rows = inner_get_developer_global_stats(&pool, None, None)
            .await
            .unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].developer_name, "Alice");
        assert_eq!(rows[1].developer_name, "Bob");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn global_stats_can_be_scoped_to_one_repo() {
        let pool = test_pool().await;
        let workspace_id = seed_workspace(&pool, "W").await;
        let tmp1 = TempDir::new().unwrap();
        let repo1 = init_repo(tmp1.path());
        commit_at(&repo1, "r1-c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        let repo1_id = seed_repo(&pool, &workspace_id, tmp1.path(), "repo1").await;
        crate::git::scan_repo(&pool, &repo1_id, tmp1.path(), "main")
            .await
            .unwrap();

        let tmp2 = TempDir::new().unwrap();
        let repo2 = init_repo(tmp2.path());
        commit_at(&repo2, "r2-c1", "Bob", "b@x.com", &[("b.txt", "1")], D1);
        commit_at(&repo2, "r2-c2", "Bob", "b@x.com", &[("b.txt", "2")], D2);
        let repo2_id = seed_repo(&pool, &workspace_id, tmp2.path(), "repo2").await;
        crate::git::scan_repo(&pool, &repo2_id, tmp2.path(), "main")
            .await
            .unwrap();

        recalculate_all(&pool).await.unwrap();

        let rows = inner_get_developer_global_stats(&pool, Some(&repo1_id), None)
            .await
            .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].developer_name, "Alice");
        assert_eq!(rows[0].total_commits, 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn global_stats_can_be_scoped_to_one_workspace() {
        let pool = test_pool().await;
        let workspace_one = seed_workspace(&pool, "W1").await;
        let workspace_two = seed_workspace(&pool, "W2").await;

        let tmp1 = TempDir::new().unwrap();
        let repo1 = init_repo(tmp1.path());
        commit_at(
            &repo1,
            "w1-r1-c1",
            "Alice",
            "a@x.com",
            &[("a.txt", "1")],
            D1,
        );
        let repo1_id = seed_repo(&pool, &workspace_one, tmp1.path(), "repo1").await;
        crate::git::scan_repo(&pool, &repo1_id, tmp1.path(), "main")
            .await
            .unwrap();

        let tmp2 = TempDir::new().unwrap();
        let repo2 = init_repo(tmp2.path());
        commit_at(
            &repo2,
            "w1-r2-c1",
            "Alice",
            "a@x.com",
            &[("b.txt", "1")],
            D2,
        );
        let repo2_id = seed_repo(&pool, &workspace_one, tmp2.path(), "repo2").await;
        crate::git::scan_repo(&pool, &repo2_id, tmp2.path(), "main")
            .await
            .unwrap();

        let tmp3 = TempDir::new().unwrap();
        let repo3 = init_repo(tmp3.path());
        commit_at(&repo3, "w2-r1-c1", "Bob", "b@x.com", &[("c.txt", "1")], D3);
        let repo3_id = seed_repo(&pool, &workspace_two, tmp3.path(), "repo3").await;
        crate::git::scan_repo(&pool, &repo3_id, tmp3.path(), "main")
            .await
            .unwrap();

        recalculate_all(&pool).await.unwrap();

        let rows = inner_get_developer_global_stats(&pool, None, Some(&workspace_one))
            .await
            .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].developer_name, "Alice");
        assert_eq!(rows[0].total_commits, 2);
    }

    // ── daily stats ───────────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn daily_stats_filters_by_date_range() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);
        commit_at(&repo, "c3", "Alice", "a@x.com", &[("c.txt", "3")], D3);
        let rid = setup(&tmp, &pool).await;

        let dev_id: String = sqlx::query_scalar("SELECT id FROM developers LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();

        // Query only D1–D2 → should return 2 rows, not 3.
        let rows = inner_get_daily_stats(&pool, &dev_id, &rid, "2024-01-01", "2024-01-02")
            .await
            .unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].date, "2024-01-01");
        assert_eq!(rows[1].date, "2024-01-02");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn daily_stats_empty_for_unknown_developer() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        let rid = setup(&tmp, &pool).await;

        let rows = inner_get_daily_stats(&pool, "no-such-dev", &rid, "2024-01-01", "2024-12-31")
            .await
            .unwrap();
        assert!(rows.is_empty());
    }

    // ── file stats ────────────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn file_stats_includes_file_path() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[("src/main.rs", "fn main(){}")],
            D1,
        );
        let rid = setup(&tmp, &pool).await;

        let rows = inner_get_file_stats(&pool, &rid).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].file_path, "src/main.rs");
        assert_eq!(rows[0].commit_count, 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn file_stats_empty_for_unknown_repo() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        setup(&tmp, &pool).await;

        let rows = inner_get_file_stats(&pool, "no-such-repo").await.unwrap();
        assert!(rows.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn file_stats_single_file_commit_has_zero_co_touch_score() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        let rid = setup(&tmp, &pool).await;

        let rows = inner_get_file_stats(&pool, &rid).await.unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].co_touch_score, 0.0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn file_stats_exposes_positive_co_touch_score_for_files_changed_together() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[("a.txt", "1"), ("b.txt", "2")],
            D1,
        );
        let rid = setup(&tmp, &pool).await;

        let rows = inner_get_file_stats(&pool, &rid).await.unwrap();

        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|row| row.co_touch_score > 0.0));
    }

    // ── directory stats ───────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn directory_stats_returns_subdirectory() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[
                ("src/lib.rs", "pub fn lib(){}"),
                ("src/main.rs", "fn main(){}"),
            ],
            D1,
        );
        let rid = setup(&tmp, &pool).await;

        let rows = inner_get_directory_stats(&pool, &rid).await.unwrap();
        assert!(!rows.is_empty());
        let src_row = rows.iter().find(|r| r.directory_path == "src");
        assert!(src_row.is_some(), "expected a row for 'src' directory");
        assert_eq!(src_row.unwrap().files_touched, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn directory_stats_returns_parent_and_child_directories_for_nested_file() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[("src/app/main.rs", "fn main(){}")],
            D1,
        );
        let rid = setup(&tmp, &pool).await;

        let rows = inner_get_directory_stats(&pool, &rid).await.unwrap();
        let paths = rows
            .iter()
            .map(|row| row.directory_path.as_str())
            .collect::<Vec<_>>();

        assert!(
            paths.contains(&"src"),
            "expected parent directory: {paths:?}"
        );
        assert!(
            paths.contains(&"src/app"),
            "expected child directory: {paths:?}"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn directory_stats_empty_for_unknown_repo() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.rs", "1")], D1);
        setup(&tmp, &pool).await;

        let rows = inner_get_directory_stats(&pool, "no-such-repo")
            .await
            .unwrap();
        assert!(rows.is_empty());
    }
}
