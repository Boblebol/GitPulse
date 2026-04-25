use sqlx::SqlitePool;

use crate::alias::{self, AliasError, DeveloperWithAliases};
use crate::AppState;

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub(crate) enum DevError {
    #[error("{0}")]
    Alias(#[from] AliasError),
    #[error("aggregation error: {0}")]
    Agg(#[from] crate::aggregation::AggError),
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Return all developers with their alias lists, ordered by name.
#[tauri::command]
pub async fn list_developers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DeveloperWithAliases>, String> {
    alias::list_developers(&state.db)
        .await
        .map_err(|e| e.to_string())
}

/// Return developers that were auto-created by the scanner and not yet reviewed.
#[tauri::command]
pub async fn list_unreviewed_developers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DeveloperWithAliases>, String> {
    alias::list_unreviewed(&state.db)
        .await
        .map_err(|e| e.to_string())
}

/// Rename a developer's canonical display name.
#[tauri::command]
pub async fn rename_developer(
    state: tauri::State<'_, AppState>,
    developer_id: String,
    new_name: String,
) -> Result<(), String> {
    alias::rename_developer(&state.db, &developer_id, &new_name)
        .await
        .map_err(|e| e.to_string())
}

/// Merge all aliases from `source_id` into `target_id`, then recalculate aggregates.
#[tauri::command]
pub async fn merge_developers(
    state: tauri::State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<(), String> {
    inner_merge_developers(&state.db, source_id, target_id)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_merge_developers(
    pool: &SqlitePool,
    source_id: String,
    target_id: String,
) -> Result<(), DevError> {
    alias::merge_developers(pool, &source_id, &target_id).await?;
    crate::aggregation::recalculate_all(pool).await?;
    Ok(())
}

/// Move an alias to a different developer, then recalculate aggregates.
#[tauri::command]
pub async fn reassign_alias(
    state: tauri::State<'_, AppState>,
    alias_id: String,
    target_developer_id: String,
) -> Result<(), String> {
    inner_reassign_alias(&state.db, alias_id, target_developer_id)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_reassign_alias(
    pool: &SqlitePool,
    alias_id: String,
    target_developer_id: String,
) -> Result<(), DevError> {
    alias::reassign_alias(pool, &alias_id, &target_developer_id).await?;
    crate::aggregation::recalculate_all(pool).await?;
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

    // ── list / rename ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn list_developers_returns_scanned_authors() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        let (_, rid) = seed_workspace_and_repo(&pool, tmp.path()).await;
        crate::git::scan_repo(&pool, &rid, tmp.path(), "main")
            .await
            .unwrap();

        let devs = alias::list_developers(&pool).await.unwrap();
        assert_eq!(devs.len(), 1);
        assert_eq!(devs[0].developer.name, "Alice");
    }

    #[tokio::test]
    async fn rename_developer_command_updates_name() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        let (_, rid) = seed_workspace_and_repo(&pool, tmp.path()).await;
        crate::git::scan_repo(&pool, &rid, tmp.path(), "main")
            .await
            .unwrap();

        let devs = alias::list_developers(&pool).await.unwrap();
        let dev_id = &devs[0].developer.id;

        alias::rename_developer(&pool, dev_id, "Alicia")
            .await
            .unwrap();
        let devs = alias::list_developers(&pool).await.unwrap();
        assert_eq!(devs[0].developer.name, "Alicia");
    }

    #[tokio::test]
    async fn list_unreviewed_shows_auto_created_only() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        let (_, rid) = seed_workspace_and_repo(&pool, tmp.path()).await;
        crate::git::scan_repo(&pool, &rid, tmp.path(), "main")
            .await
            .unwrap();

        let unreviewed = alias::list_unreviewed(&pool).await.unwrap();
        assert_eq!(unreviewed.len(), 1, "alice is auto-created");

        // After rename, it's no longer considered auto-created
        let dev_id = &unreviewed[0].developer.id.clone();
        alias::rename_developer(&pool, dev_id, "Alice Renamed")
            .await
            .unwrap();
        let unreviewed2 = alias::list_unreviewed(&pool).await.unwrap();
        assert!(unreviewed2.is_empty(), "renamed → not auto-created anymore");
    }

    // ── merge (E2E) ───────────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn merge_developers_combines_stats_after_recalc() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "alice",
            "alice@work.com",
            &[("a.txt", "1")],
            D1,
        );
        commit_at(
            &repo,
            "c2",
            "Alice W.",
            "alice@personal.com",
            &[("b.txt", "2")],
            D2,
        );

        let (_, rid) = seed_workspace_and_repo(&pool, tmp.path()).await;
        crate::git::scan_repo(&pool, &rid, tmp.path(), "main")
            .await
            .unwrap();

        let devs = alias::list_developers(&pool).await.unwrap();
        assert_eq!(devs.len(), 2, "two separate authors before merge");

        let src = devs
            .iter()
            .find(|d| d.aliases[0].git_email == "alice@personal.com")
            .unwrap();
        let tgt = devs
            .iter()
            .find(|d| d.aliases[0].git_email == "alice@work.com")
            .unwrap();

        inner_merge_developers(&pool, src.developer.id.clone(), tgt.developer.id.clone())
            .await
            .unwrap();

        let after = alias::list_developers(&pool).await.unwrap();
        assert_eq!(after.len(), 1, "one developer after merge");

        // Aggregate must have been recalculated: combined total_commits = 2.
        let total: i64 = sqlx::query_scalar("SELECT total_commits FROM stats_developer_global")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(total, 2);
    }

    // ── reassign alias ────────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn reassign_alias_triggers_recalc() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Bob", "b@x.com", &[("b.txt", "2")], D2);

        let (_, rid) = seed_workspace_and_repo(&pool, tmp.path()).await;
        crate::git::scan_repo(&pool, &rid, tmp.path(), "main")
            .await
            .unwrap();
        crate::aggregation::recalculate_all(&pool).await.unwrap();

        let devs = alias::list_developers(&pool).await.unwrap();
        let alice = devs.iter().find(|d| d.developer.name == "Alice").unwrap();
        let bob = devs.iter().find(|d| d.developer.name == "Bob").unwrap();
        let bob_alias_id = bob.aliases[0].id.clone();

        // Reassign Bob's alias to Alice → Bob's developer should be deleted
        inner_reassign_alias(&pool, bob_alias_id, alice.developer.id.clone())
            .await
            .unwrap();

        let after = alias::list_developers(&pool).await.unwrap();
        assert_eq!(after.len(), 1, "bob deleted after alias reassignment");

        // Aggregate recalculated: Alice now has 2 commits
        let total: i64 = sqlx::query_scalar("SELECT total_commits FROM stats_developer_global")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(total, 2);
    }
}
