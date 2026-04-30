use std::path::{Path, PathBuf};
use std::sync::Arc;

use sqlx::SqlitePool;
use tauri::Emitter;
use tracing::warn;

use crate::models::repo::{Repo, Workspace};
use crate::models::scan::ScanRun;
use crate::AppState;

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub(crate) enum RepoError {
    #[error("path does not exist: {0}")]
    PathNotFound(String),
    #[error("not a git repository: {0}")]
    NotARepo(String),
    #[error("workspace not found: {0}")]
    WorkspaceNotFound(String),
    #[error("repo not found: {0}")]
    RepoNotFound(String),
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("scan error: {0}")]
    Scan(#[from] crate::git::GitError),
    #[error("scan run error: {0}")]
    ScanRun(#[from] crate::models::scan::ScanRunError),
    #[error("aggregation error: {0}")]
    Agg(#[from] crate::aggregation::AggError),
}

// ── Workspaces ────────────────────────────────────────────────────────────────

/// List all workspaces ordered by name.
#[tauri::command]
pub async fn list_workspaces(state: tauri::State<'_, AppState>) -> Result<Vec<Workspace>, String> {
    inner_list_workspaces(&state.db)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_list_workspaces(pool: &SqlitePool) -> Result<Vec<Workspace>, RepoError> {
    Ok(
        sqlx::query_as("SELECT id, name, created_at FROM workspaces ORDER BY name COLLATE NOCASE")
            .fetch_all(pool)
            .await?,
    )
}

/// Create a new workspace.
#[tauri::command]
pub async fn create_workspace(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<Workspace, String> {
    inner_create_workspace(&state.db, name)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_create_workspace(
    pool: &SqlitePool,
    name: String,
) -> Result<Workspace, RepoError> {
    let ws = Workspace::new(name);
    sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&ws.id)
        .bind(&ws.name)
        .bind(&ws.created_at)
        .execute(pool)
        .await?;
    Ok(ws)
}

/// Delete a workspace (cascades to all repos and raw data).
#[tauri::command]
pub async fn delete_workspace(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    inner_delete_workspace(&state.db, &workspace_id)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_delete_workspace(
    pool: &SqlitePool,
    workspace_id: &str,
) -> Result<(), RepoError> {
    let affected = sqlx::query("DELETE FROM workspaces WHERE id = ?")
        .bind(workspace_id)
        .execute(pool)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(RepoError::WorkspaceNotFound(workspace_id.to_string()));
    }
    Ok(())
}

// ── Repos ─────────────────────────────────────────────────────────────────────

/// List all repositories belonging to a workspace.
#[tauri::command]
pub async fn list_repos(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<Repo>, String> {
    inner_list_repos(&state.db, &workspace_id)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_list_repos(
    pool: &SqlitePool,
    workspace_id: &str,
) -> Result<Vec<Repo>, RepoError> {
    Ok(sqlx::query_as(
        "SELECT id, workspace_id, name, path, active_branch,
                last_indexed_commit_sha, created_at
         FROM repos WHERE workspace_id = ? ORDER BY name COLLATE NOCASE",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?)
}

/// List all branches available in a git repository.
#[tauri::command]
pub async fn list_repo_branches(path: String) -> Result<Vec<String>, String> {
    inner_list_branches(&path).map_err(|e| e.to_string())
}

fn inner_list_branches(path: &str) -> Result<Vec<String>, RepoError> {
    let repo = git2::Repository::open(path).map_err(|_| RepoError::NotARepo(path.to_string()))?;

    let mut branches = Vec::new();
    let branch_iter = repo
        .branches(None)
        .map_err(|_| RepoError::NotARepo(path.to_string()))?;

    for (branch, _) in branch_iter.flatten() {
        if let Ok(Some(branch_name)) = branch.name() {
            branches.push(branch_name.to_string());
        }
    }

    branches.sort();
    Ok(branches)
}

/// Add a repository to a workspace.
/// Validates the path exists and is a git repository; detects the active branch.
/// If no branch is provided, uses the current HEAD or defaults to "main" or "master".
#[tauri::command]
pub async fn add_repo(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
    path: String,
    name: String,
    branch: Option<String>,
) -> Result<Repo, String> {
    inner_add_repo(&state.db, workspace_id, path, name, branch)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_add_repo(
    pool: &SqlitePool,
    workspace_id: String,
    path: String,
    name: String,
    provided_branch: Option<String>,
) -> Result<Repo, RepoError> {
    if !Path::new(&path).exists() {
        return Err(RepoError::PathNotFound(path));
    }

    let branch = if let Some(b) = provided_branch {
        b
    } else {
        // Auto-detect: try current HEAD, then check for "main" or "master"
        let git_repo =
            git2::Repository::open(&path).map_err(|_| RepoError::NotARepo(path.clone()))?;

        let current_branch = git_repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()));

        if let Some(b) = current_branch {
            b
        } else {
            // Fallback: check for "main" or "master" branches
            match inner_list_branches(&path) {
                Ok(branches) => {
                    if branches.contains(&"main".to_string()) {
                        "main".to_string()
                    } else if branches.contains(&"master".to_string()) {
                        "master".to_string()
                    } else if !branches.is_empty() {
                        branches[0].clone()
                    } else {
                        "main".to_string()
                    }
                }
                Err(_) => "main".to_string(),
            }
        }
    };

    let mut repo = Repo::new(workspace_id, name, &path);
    repo.active_branch = branch;

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
    .await?;

    Ok(repo)
}

/// Change the active branch for a repository.
#[tauri::command]
pub async fn set_repo_branch(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    branch: String,
) -> Result<Repo, String> {
    inner_set_repo_branch(&state.db, &repo_id, &branch)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_set_repo_branch(
    pool: &SqlitePool,
    repo_id: &str,
    branch: &str,
) -> Result<Repo, RepoError> {
    sqlx::query("UPDATE repos SET active_branch = ? WHERE id = ?")
        .bind(branch)
        .bind(repo_id)
        .execute(pool)
        .await?;

    let repo: Repo = sqlx::query_as(
        "SELECT id, workspace_id, name, path, active_branch, last_indexed_commit_sha, created_at
         FROM repos WHERE id = ?",
    )
    .bind(repo_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| RepoError::RepoNotFound(repo_id.to_string()))?;

    Ok(repo)
}

/// Remove a repository and all its associated raw + aggregate data (cascade).
#[tauri::command]
pub async fn remove_repo(state: tauri::State<'_, AppState>, repo_id: String) -> Result<(), String> {
    inner_remove_repo(&state.db, &repo_id)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_remove_repo(pool: &SqlitePool, repo_id: &str) -> Result<(), RepoError> {
    let affected = sqlx::query("DELETE FROM repos WHERE id = ?")
        .bind(repo_id)
        .execute(pool)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(RepoError::RepoNotFound(repo_id.to_string()));
    }
    Ok(())
}

/// Trigger a git scan for a repository and rebuild dirty aggregate scopes.
#[tauri::command]
pub async fn trigger_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    repo_id: String,
) -> Result<crate::git::ScanResult, String> {
    let worktree_root = analysis_worktree_root(&state.config_dir);
    inner_trigger_scan_with_progress(
        &state.db,
        &repo_id,
        Some(scan_progress_emitter(app)),
        Some(worktree_root.as_path()),
    )
    .await
    .map_err(|e| e.to_string())
}

/// Pause a running scan. The scanner observes this between persisted batches.
#[tauri::command]
pub async fn pause_scan(
    state: tauri::State<'_, AppState>,
    scan_run_id: String,
) -> Result<(), String> {
    inner_pause_scan(&state.db, &scan_run_id)
        .await
        .map_err(|e| e.to_string())
}

/// Resume scanning a repository from its durable branch cursor.
#[tauri::command]
pub async fn resume_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    repo_id: String,
) -> Result<crate::git::ScanResult, String> {
    let worktree_root = analysis_worktree_root(&state.config_dir);
    inner_resume_scan_with_progress(
        &state.db,
        &repo_id,
        Some(scan_progress_emitter(app)),
        Some(worktree_root.as_path()),
    )
    .await
    .map_err(|e| e.to_string())
}

/// Return the latest scan run status for a repository.
#[tauri::command]
pub async fn get_scan_status(
    state: tauri::State<'_, AppState>,
    repo_id: String,
) -> Result<Option<ScanRun>, String> {
    inner_get_scan_status(&state.db, &repo_id)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
pub(crate) async fn inner_trigger_scan(
    pool: &SqlitePool,
    repo_id: &str,
) -> Result<crate::git::ScanResult, RepoError> {
    inner_trigger_scan_with_progress(pool, repo_id, None, None).await
}

pub(crate) async fn inner_pause_scan(
    pool: &SqlitePool,
    scan_run_id: &str,
) -> Result<(), RepoError> {
    crate::models::scan::pause_scan_run(pool, scan_run_id).await?;
    Ok(())
}

#[cfg(test)]
pub(crate) async fn inner_resume_scan(
    pool: &SqlitePool,
    repo_id: &str,
) -> Result<crate::git::ScanResult, RepoError> {
    inner_resume_scan_with_progress(pool, repo_id, None, None).await
}

async fn inner_resume_scan_with_progress(
    pool: &SqlitePool,
    repo_id: &str,
    progress_callback: Option<crate::git::ScanProgressCallback>,
    worktree_root: Option<&Path>,
) -> Result<crate::git::ScanResult, RepoError> {
    inner_trigger_scan_with_progress(pool, repo_id, progress_callback, worktree_root).await
}

pub(crate) async fn inner_get_scan_status(
    pool: &SqlitePool,
    repo_id: &str,
) -> Result<Option<ScanRun>, RepoError> {
    Ok(crate::models::scan::fetch_latest_scan_run_for_repo(pool, repo_id).await?)
}

async fn inner_trigger_scan_with_progress(
    pool: &SqlitePool,
    repo_id: &str,
    progress_callback: Option<crate::git::ScanProgressCallback>,
    worktree_root: Option<&Path>,
) -> Result<crate::git::ScanResult, RepoError> {
    let (path, active_branch): (String, String) =
        sqlx::query_as("SELECT path, active_branch FROM repos WHERE id = ?")
            .bind(repo_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| RepoError::RepoNotFound(repo_id.to_string()))?;

    crate::models::scan::ensure_no_running_scan(pool).await?;

    let repo_path = Path::new(&path);
    let result = if let Some(callback) = progress_callback {
        if let Some(root) = worktree_root {
            crate::git::scan_repo_with_progress_and_worktree_root(
                pool,
                repo_id,
                repo_path,
                &active_branch,
                callback,
                root,
            )
            .await?
        } else {
            crate::git::scan_repo_with_progress(pool, repo_id, repo_path, &active_branch, callback)
                .await?
        }
    } else {
        crate::git::scan_repo(pool, repo_id, repo_path, &active_branch).await?
    };
    recalculate_after_scan(pool).await?;
    Ok(result)
}

async fn recalculate_after_scan(pool: &SqlitePool) -> Result<(), RepoError> {
    let dirty_scopes = crate::models::dirty_scope::list_dirty_scopes(pool).await?;
    if dirty_scopes.is_empty() {
        return Ok(());
    }

    let aggregate_scopes = dirty_scopes
        .iter()
        .map(|scope| (scope.repo_id.clone(), scope.date.clone()))
        .collect::<Vec<_>>();
    crate::aggregation::recalculate_repo_dates(pool, &aggregate_scopes).await?;

    let scope_refs = dirty_scopes
        .iter()
        .map(crate::models::dirty_scope::DirtyAggregateScopeRef::from)
        .collect::<Vec<_>>();
    crate::models::dirty_scope::clear_dirty_scopes(pool, &scope_refs).await?;
    Ok(())
}

fn scan_progress_emitter(app: tauri::AppHandle) -> crate::git::ScanProgressCallback {
    Arc::new(move |payload| {
        if let Err(error) = app.emit(crate::git::SCAN_PROGRESS_EVENT, payload) {
            warn!(%error, "failed to emit scan progress event");
        }
    })
}

fn analysis_worktree_root(config_dir: &Path) -> PathBuf {
    config_dir.join("analysis-worktrees")
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::test_utils::{commit_at, init_repo};
    use tempfile::TempDir;

    const D1: i64 = 1704067200; // 2024-01-01
    const D2: i64 = 1704153600; // 2024-01-02

    // ── workspaces ────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn create_and_list_workspace() {
        let pool = test_pool().await;
        let ws = inner_create_workspace(&pool, "MyWS".into()).await.unwrap();
        assert_eq!(ws.name, "MyWS");

        let all = inner_list_workspaces(&pool).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, ws.id);
    }

    #[tokio::test]
    async fn delete_workspace_removes_record() {
        let pool = test_pool().await;
        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        inner_delete_workspace(&pool, &ws.id).await.unwrap();
        let all = inner_list_workspaces(&pool).await.unwrap();
        assert!(all.is_empty());
    }

    #[tokio::test]
    async fn delete_nonexistent_workspace_fails() {
        let pool = test_pool().await;
        let err = inner_delete_workspace(&pool, "no-such-id")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("workspace not found"));
    }

    // ── repos ─────────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn add_repo_with_valid_git_path() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "A", "a@x.com", &[("a.txt", "hi")], D1);

        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let r = inner_add_repo(
            &pool,
            ws.id.clone(),
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None,
        )
        .await
        .unwrap();

        assert_eq!(r.workspace_id, ws.id);
        assert_eq!(r.path, tmp.path().to_str().unwrap());
        // branch should have been detected (master or main)
        assert!(!r.active_branch.is_empty());
    }

    #[tokio::test]
    async fn add_repo_nonexistent_path_fails() {
        let pool = test_pool().await;
        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let err = inner_add_repo(&pool, ws.id, "/no/such/path".into(), "r".into(), None)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("does not exist"));
    }

    #[tokio::test]
    async fn add_repo_non_git_directory_fails() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap(); // plain directory, not a git repo
        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let err = inner_add_repo(
            &pool,
            ws.id,
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None,
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("not a git repository"));
    }

    #[tokio::test]
    async fn list_repos_filters_by_workspace() {
        let pool = test_pool().await;
        let tmp1 = TempDir::new().unwrap();
        let tmp2 = TempDir::new().unwrap();
        init_repo(tmp1.path());
        init_repo(tmp2.path());

        // Two separate workspaces, each with one repo
        // We need at least one commit so git2::Repository::open doesn't fail
        // Actually add_repo just opens, doesn't require commits
        // But we need an initial commit for HEAD to exist
        // Let's just use empty repos and init without committing
        // Actually git2::Repository::open works on empty repos

        let ws1 = inner_create_workspace(&pool, "WS1".into()).await.unwrap();
        let ws2 = inner_create_workspace(&pool, "WS2".into()).await.unwrap();
        inner_add_repo(
            &pool,
            ws1.id.clone(),
            tmp1.path().to_str().unwrap().into(),
            "r1".into(),
            None,
        )
        .await
        .unwrap();
        inner_add_repo(
            &pool,
            ws2.id.clone(),
            tmp2.path().to_str().unwrap().into(),
            "r2".into(),
            None,
        )
        .await
        .unwrap();

        let repos_ws1 = inner_list_repos(&pool, &ws1.id).await.unwrap();
        let repos_ws2 = inner_list_repos(&pool, &ws2.id).await.unwrap();
        assert_eq!(repos_ws1.len(), 1);
        assert_eq!(repos_ws2.len(), 1);
        assert_eq!(repos_ws1[0].name, "r1");
        assert_eq!(repos_ws2[0].name, "r2");
    }

    #[tokio::test]
    async fn remove_repo_deletes_it() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        init_repo(tmp.path());
        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let r = inner_add_repo(
            &pool,
            ws.id.clone(),
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None,
        )
        .await
        .unwrap();
        inner_remove_repo(&pool, &r.id).await.unwrap();
        let all = inner_list_repos(&pool, &ws.id).await.unwrap();
        assert!(all.is_empty());
    }

    #[tokio::test]
    async fn remove_nonexistent_repo_fails() {
        let pool = test_pool().await;
        let err = inner_remove_repo(&pool, "no-such-id").await.unwrap_err();
        assert!(err.to_string().contains("repo not found"));
    }

    // ── trigger_scan E2E ──────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn trigger_scan_populates_daily_and_global_stats() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let git_repo = init_repo(tmp.path());
        commit_at(&git_repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&git_repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);

        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let r = inner_add_repo(
            &pool,
            ws.id,
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None,
        )
        .await
        .unwrap();

        let result = inner_trigger_scan(&pool, &r.id).await.unwrap();
        assert_eq!(result.commits_added, 2);

        // Daily stats must have been populated.
        let daily: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stats_daily_developer")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(daily, 2);

        // Global stats must exist.
        let global: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stats_developer_global")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(global, 1);

        let dirty: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dirty_aggregate_scopes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            dirty, 0,
            "dirty scopes should be cleared after recalculation"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn trigger_scan_nonexistent_repo_fails() {
        let pool = test_pool().await;
        let err = inner_trigger_scan(&pool, "no-such-id").await.unwrap_err();
        assert!(err.to_string().contains("repo not found"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn trigger_scan_rejects_when_a_scan_is_already_running() {
        let pool = test_pool().await;
        let first_tmp = TempDir::new().unwrap();
        let second_tmp = TempDir::new().unwrap();
        let first_repo = init_repo(first_tmp.path());
        let second_repo = init_repo(second_tmp.path());
        commit_at(&first_repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&second_repo, "c1", "Bob", "b@x.com", &[("b.txt", "1")], D1);

        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let first = inner_add_repo(
            &pool,
            ws.id.clone(),
            first_tmp.path().to_str().unwrap().into(),
            "first".into(),
            None,
        )
        .await
        .unwrap();
        let second = inner_add_repo(
            &pool,
            ws.id,
            second_tmp.path().to_str().unwrap().into(),
            "second".into(),
            None,
        )
        .await
        .unwrap();

        crate::models::scan::create_scan_run(&pool, &first.id, "main", "head-a")
            .await
            .unwrap();

        let err = inner_trigger_scan(&pool, &second.id).await.unwrap_err();

        assert!(
            err.to_string().contains("scan already running"),
            "unexpected error: {err}"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn trigger_scan_is_incremental_on_second_call() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let git_repo = init_repo(tmp.path());
        commit_at(&git_repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);

        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let r = inner_add_repo(
            &pool,
            ws.id,
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None,
        )
        .await
        .unwrap();

        let r1 = inner_trigger_scan(&pool, &r.id).await.unwrap();
        assert_eq!(r1.commits_added, 1);

        // Add a second commit, scan again.
        commit_at(&git_repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);
        let r2 = inner_trigger_scan(&pool, &r.id).await.unwrap();
        assert_eq!(r2.commits_added, 1, "only the new commit should be scanned");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn trigger_scan_populates_recursive_directory_and_co_touch_metrics() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let git_repo = init_repo(tmp.path());
        commit_at(
            &git_repo,
            "c1",
            "Alice",
            "a@x.com",
            &[
                ("src/app/main.rs", "fn main(){}"),
                ("src/app/lib.rs", "pub fn lib(){}"),
            ],
            D1,
        );

        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let r = inner_add_repo(
            &pool,
            ws.id,
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None,
        )
        .await
        .unwrap();

        let result = inner_trigger_scan(&pool, &r.id).await.unwrap();
        assert_eq!(result.commits_added, 1);

        let directories: Vec<String> = sqlx::query_scalar(
            "SELECT directory_path
             FROM stats_directory_global
             WHERE repo_id = ?
             ORDER BY directory_path",
        )
        .bind(&r.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(directories, vec!["src".to_string(), "src/app".to_string()]);

        let co_touch_scores: Vec<f64> = sqlx::query_scalar(
            "SELECT sfg.co_touch_score
             FROM stats_file_global sfg
             JOIN files f ON f.id = sfg.file_id
             WHERE f.repo_id = ?
             ORDER BY f.current_path",
        )
        .bind(&r.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(co_touch_scores, vec![1.0, 1.0]);
    }

    #[tokio::test]
    async fn pause_scan_marks_scan_run_paused() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = crate::test_utils::seed_workspace_and_repo(&pool, tmp.path()).await;
        let run = crate::models::scan::create_scan_run(&pool, &repo_id, "main", "head-sha")
            .await
            .unwrap();

        inner_pause_scan(&pool, &run.id).await.unwrap();

        let paused = crate::models::scan::fetch_scan_run(&pool, &run.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(paused.status, crate::models::scan::ScanRunStatus::Paused);
    }

    #[tokio::test]
    async fn get_scan_status_returns_latest_repo_scan_run() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = crate::test_utils::seed_workspace_and_repo(&pool, tmp.path()).await;
        let first = crate::models::scan::create_scan_run(&pool, &repo_id, "main", "head-1")
            .await
            .unwrap();
        crate::models::scan::complete_scan_run(&pool, &first.id)
            .await
            .unwrap();
        let latest = crate::models::scan::create_scan_run(&pool, &repo_id, "main", "head-2")
            .await
            .unwrap();

        let status = inner_get_scan_status(&pool, &repo_id)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(status.id, latest.id);
        assert_eq!(status.status, crate::models::scan::ScanRunStatus::Running);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn resume_scan_creates_new_run_after_paused_run() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let git_repo = init_repo(tmp.path());
        commit_at(&git_repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&git_repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);

        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let r = inner_add_repo(
            &pool,
            ws.id,
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None,
        )
        .await
        .unwrap();
        let paused_run =
            crate::models::scan::create_scan_run(&pool, &r.id, &r.active_branch, "old-head")
                .await
                .unwrap();
        crate::models::scan::pause_scan_run(&pool, &paused_run.id)
            .await
            .unwrap();

        let result = inner_resume_scan(&pool, &r.id).await.unwrap();

        assert_eq!(result.commits_added, 2);
        let runs: Vec<(String, String)> = sqlx::query_as(
            "SELECT id, status
             FROM scan_runs
             WHERE repo_id = ?
             ORDER BY started_at ASC, id ASC",
        )
        .bind(&r.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].0, paused_run.id);
        assert_eq!(runs[0].1, "paused");
        assert_eq!(runs[1].1, "completed");
    }

    // ── branches ──────────────────────────────────────────────────────────

    #[test]
    fn list_repo_branches_finds_branches() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());

        // Create initial commit
        commit_at(&repo, "c1", "A", "a@x.com", &[("a.txt", "hi")], D1);

        let branches = inner_list_branches(tmp.path().to_str().unwrap()).unwrap();
        assert!(!branches.is_empty());
        assert!(branches.iter().any(|b| b == "master" || b == "main"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn set_repo_branch_updates_active_branch() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let git_repo = init_repo(tmp.path());
        commit_at(&git_repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);

        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let r = inner_add_repo(
            &pool,
            ws.id.clone(),
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None,
        )
        .await
        .unwrap();

        // Change branch
        let updated = inner_set_repo_branch(&pool, &r.id, "main").await.unwrap();
        assert_eq!(updated.active_branch, "main");

        // Verify it persists
        let repos = inner_list_repos(&pool, &ws.id).await.unwrap();
        let repo_after = repos.iter().find(|r| r.id == updated.id).unwrap();
        assert_eq!(repo_after.active_branch, "main");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn add_repo_auto_detects_main_or_master() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let git_repo = init_repo(tmp.path());
        commit_at(&git_repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);

        let ws = inner_create_workspace(&pool, "W".into()).await.unwrap();
        let r = inner_add_repo(
            &pool,
            ws.id,
            tmp.path().to_str().unwrap().into(),
            "r".into(),
            None, // no explicit branch
        )
        .await
        .unwrap();

        // Should auto-detect a valid branch (main or master)
        assert!(!r.active_branch.is_empty());
        assert!(r.active_branch == "main" || r.active_branch == "master");
    }
}
