use std::collections::{BTreeSet, HashMap};
use std::path::Path;
use std::sync::Arc;

use chrono::{TimeZone, Utc};
use git2::{DiffFindOptions, DiffOptions, Repository};
use serde::Serialize;
use sqlx::SqlitePool;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::models::commit::ChangeType;
use crate::models::repo_branch_cursor::{fetch_repo_branch_cursor, upsert_repo_branch_cursor};
use crate::models::scan::{
    complete_scan_run, create_scan_run, fail_scan_run, fetch_scan_run, update_scan_run_progress,
    ScanRunError, ScanRunStatus,
};

use super::incremental::setup_revwalk;
use super::rename::upsert_file;

// ── Error type ────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("repository not found at {path}")]
    NotFound { path: String },
    #[error("git error: {0}")]
    Git2(#[from] git2::Error),
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("scan run error: {0}")]
    ScanRun(#[from] ScanRunError),
    #[error("join error: {0}")]
    Join(String),
    #[cfg(test)]
    #[error("injected scan failure after {0} batch(es)")]
    InjectedFailure(usize),
}

const DEFAULT_SCAN_BATCH_SIZE: usize = 500;
pub const SCAN_PROGRESS_EVENT: &str = "scan_progress";

pub type ScanProgressCallback = Arc<dyn Fn(ScanProgressPayload) + Send + Sync + 'static>;

#[derive(Debug, Clone, Copy)]
struct ScanOptions {
    batch_size: usize,
    #[cfg(test)]
    fail_after_batches: Option<usize>,
    #[cfg(test)]
    pause_after_batches: Option<usize>,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            batch_size: DEFAULT_SCAN_BATCH_SIZE,
            #[cfg(test)]
            fail_after_batches: None,
            #[cfg(test)]
            pause_after_batches: None,
        }
    }
}

// ── Public result ─────────────────────────────────────────────────────────────

/// Summary returned after a successful scan.
#[derive(Debug, serde::Serialize)]
pub struct ScanResult {
    pub commits_added: usize,
    pub files_processed: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ScanProgressPayload {
    pub repo_id: String,
    pub scan_run_id: String,
    pub status: ScanRunStatus,
    pub commits_indexed: i64,
    pub files_processed: i64,
    pub cursor_sha: Option<String>,
    pub target_head_sha: String,
    pub message: Option<String>,
    pub error: Option<String>,
}

// ── Internal transfer types (git2 → DB layer) ─────────────────────────────────

struct RawCommit {
    sha: String,
    author_name: String,
    author_email: String,
    message: String,
    committed_at_secs: i64,
    insertions: i64,
    deletions: i64,
    file_changes: Vec<RawFileChange>,
}

struct RawFileChange {
    /// `Some(old)` when this delta is a rename/copy.
    old_path: Option<String>,
    new_path: String,
    change_type: ChangeType,
    insertions: i64,
    deletions: i64,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Scan a Git repository and persist raw facts to the database.
///
/// On first call for a repo (`last_indexed_commit_sha = NULL`) this performs a
/// full scan. On subsequent calls it only processes commits that arrived after
/// the previously indexed HEAD.
///
/// `active_branch` should be the branch name to scan (e.g. "main", "master").
pub async fn scan_repo(
    pool: &SqlitePool,
    repo_id: &str,
    repo_path: &Path,
    active_branch: &str,
) -> Result<ScanResult, GitError> {
    scan_repo_with_options(
        pool,
        repo_id,
        repo_path,
        active_branch,
        ScanOptions::default(),
        None,
    )
    .await
}

pub async fn scan_repo_with_progress(
    pool: &SqlitePool,
    repo_id: &str,
    repo_path: &Path,
    active_branch: &str,
    progress_callback: ScanProgressCallback,
) -> Result<ScanResult, GitError> {
    scan_repo_with_options(
        pool,
        repo_id,
        repo_path,
        active_branch,
        ScanOptions::default(),
        Some(progress_callback),
    )
    .await
}

async fn scan_repo_with_options(
    pool: &SqlitePool,
    repo_id: &str,
    repo_path: &Path,
    active_branch: &str,
    options: ScanOptions,
    progress_callback: Option<ScanProgressCallback>,
) -> Result<ScanResult, GitError> {
    // Prefer the branch-specific cursor. The repo-level cursor is kept as a
    // legacy fallback for databases created before per-branch scan state.
    let branch_cursor = fetch_repo_branch_cursor(pool, repo_id, active_branch)
        .await
        .map_err(GitError::Db)?;
    let legacy_last_sha: Option<String> =
        sqlx::query_scalar("SELECT last_indexed_commit_sha FROM repos WHERE id = ?")
            .bind(repo_id)
            .fetch_one(pool)
            .await
            .map_err(GitError::Db)?;
    let last_sha = branch_cursor
        .as_ref()
        .map(|cursor| cursor.last_indexed_commit_sha.clone())
        .or(legacy_last_sha);

    info!(
        repo_id,
        path = %repo_path.display(),
        last_sha = last_sha.as_deref().unwrap_or("none"),
        cursor_source = if branch_cursor.is_some() { "branch" } else { "repo_legacy" },
        "starting git scan"
    );

    let path_owned = repo_path.to_path_buf();
    let branch_owned = active_branch.to_string();
    let target_head_sha =
        tokio::task::spawn_blocking(move || resolve_target_head_sha(&path_owned, &branch_owned))
            .await
            .map_err(|e| GitError::Join(e.to_string()))??;

    let scan_run = create_scan_run(pool, repo_id, active_branch, &target_head_sha).await?;
    emit_scan_progress(
        progress_callback.as_ref(),
        ScanProgressPayload::new(
            repo_id,
            &scan_run.id,
            ScanRunStatus::Running,
            0,
            0,
            None,
            &target_head_sha,
            Some("Scan started".to_string()),
            None,
        ),
    );

    let result = scan_repo_batches(
        ScanBatchContext {
            pool,
            repo_id,
            repo_path,
            active_branch,
            scan_run_id: &scan_run.id,
            target_head_sha: &target_head_sha,
            progress_callback: progress_callback.as_ref(),
        },
        last_sha,
        options,
    )
    .await;

    match result {
        Ok(ScanBatchOutcome::Completed(result)) => {
            complete_scan_run(pool, &scan_run.id).await?;
            let completed_scan_run = fetch_scan_run(pool, &scan_run.id)
                .await?
                .unwrap_or(scan_run);
            emit_scan_progress(
                progress_callback.as_ref(),
                ScanProgressPayload::new(
                    repo_id,
                    &completed_scan_run.id,
                    ScanRunStatus::Completed,
                    completed_scan_run.commits_indexed,
                    completed_scan_run.files_processed,
                    completed_scan_run.cursor_sha,
                    &target_head_sha,
                    Some("Scan completed".to_string()),
                    None,
                ),
            );
            info!(
                repo_id,
                commits_added = result.commits_added,
                files_processed = result.files_processed,
                "scan complete"
            );
            Ok(result)
        }
        Ok(ScanBatchOutcome::Paused(result)) => {
            let paused_scan_run = fetch_scan_run(pool, &scan_run.id)
                .await?
                .unwrap_or(scan_run);
            emit_scan_progress(
                progress_callback.as_ref(),
                ScanProgressPayload::new(
                    repo_id,
                    &paused_scan_run.id,
                    ScanRunStatus::Paused,
                    paused_scan_run.commits_indexed,
                    paused_scan_run.files_processed,
                    paused_scan_run.cursor_sha,
                    &target_head_sha,
                    Some("Scan paused".to_string()),
                    None,
                ),
            );
            info!(
                repo_id,
                commits_added = result.commits_added,
                files_processed = result.files_processed,
                "scan paused"
            );
            Ok(result)
        }
        Err(error) => {
            let error_message = error.to_string();
            fail_scan_run(pool, &scan_run.id, &error_message).await?;
            let failed_scan_run = fetch_scan_run(pool, &scan_run.id)
                .await?
                .unwrap_or(scan_run);
            emit_scan_progress(
                progress_callback.as_ref(),
                ScanProgressPayload::new(
                    repo_id,
                    &failed_scan_run.id,
                    ScanRunStatus::Failed,
                    failed_scan_run.commits_indexed,
                    failed_scan_run.files_processed,
                    failed_scan_run.cursor_sha,
                    &target_head_sha,
                    Some("Scan failed".to_string()),
                    Some(error_message),
                ),
            );
            Err(error)
        }
    }
}

struct ScanBatchContext<'a> {
    pool: &'a SqlitePool,
    repo_id: &'a str,
    repo_path: &'a Path,
    active_branch: &'a str,
    scan_run_id: &'a str,
    target_head_sha: &'a str,
    progress_callback: Option<&'a ScanProgressCallback>,
}

enum ScanBatchOutcome {
    Completed(ScanResult),
    Paused(ScanResult),
}

async fn scan_repo_batches(
    context: ScanBatchContext<'_>,
    last_sha: Option<String>,
    options: ScanOptions,
) -> Result<ScanBatchOutcome, GitError> {
    let ScanBatchContext {
        pool,
        repo_id,
        repo_path,
        active_branch,
        scan_run_id,
        target_head_sha,
        progress_callback,
    } = context;
    let batch_size = options.batch_size.max(1);
    let mut since_sha = last_sha;
    let mut commits_added = 0usize;
    let mut files_processed = 0usize;
    #[cfg(test)]
    let mut batches_completed = 0usize;

    loop {
        let path_owned = repo_path.to_path_buf();
        let branch_owned = active_branch.to_string();
        let since_sha_clone = since_sha.clone();
        let raw_commits = tokio::task::spawn_blocking(move || {
            collect_commits(
                &path_owned,
                &branch_owned,
                since_sha_clone.as_deref(),
                Some(batch_size),
                None,
            )
        })
        .await
        .map_err(|e| GitError::Join(e.to_string()))??;

        if raw_commits.is_empty() {
            if commits_added == 0 {
                info!(repo_id, "no new commits to index");
            }
            return Ok(ScanBatchOutcome::Completed(ScanResult {
                commits_added,
                files_processed,
            }));
        }

        info!(
            repo_id,
            batch_commits = raw_commits.len(),
            commits_added,
            "persisting commit batch"
        );

        let batch_len = raw_commits.len();
        let batch = persist_commit_batch(pool, repo_id, &raw_commits).await?;
        commits_added += batch.commits_inserted;
        files_processed += batch.files_processed;
        since_sha = batch.last_new_sha;
        #[cfg(test)]
        {
            batches_completed += 1;
        }

        update_scan_run_progress(
            pool,
            scan_run_id,
            since_sha.as_deref(),
            commits_added as i64,
            files_processed as i64,
        )
        .await?;

        emit_scan_progress(
            progress_callback,
            ScanProgressPayload::new(
                repo_id,
                scan_run_id,
                ScanRunStatus::Running,
                commits_added as i64,
                files_processed as i64,
                since_sha.clone(),
                target_head_sha,
                Some("Scan batch persisted".to_string()),
                None,
            ),
        );

        if let Some(cursor_sha) = since_sha.as_deref() {
            upsert_repo_branch_cursor(pool, repo_id, active_branch, cursor_sha, Some(scan_run_id))
                .await
                .map_err(GitError::Db)?;
        }

        #[cfg(test)]
        if let Some(limit) = options.pause_after_batches {
            if batches_completed >= limit {
                crate::models::scan::pause_scan_run(pool, scan_run_id).await?;
            }
        }

        if is_scan_run_paused(pool, scan_run_id).await? {
            return Ok(ScanBatchOutcome::Paused(ScanResult {
                commits_added,
                files_processed,
            }));
        }

        #[cfg(test)]
        if let Some(limit) = options.fail_after_batches {
            if batches_completed >= limit {
                return Err(GitError::InjectedFailure(batches_completed));
            }
        }

        if batch_len < batch_size {
            return Ok(ScanBatchOutcome::Completed(ScanResult {
                commits_added,
                files_processed,
            }));
        }
    }
}

async fn is_scan_run_paused(pool: &SqlitePool, scan_run_id: &str) -> Result<bool, ScanRunError> {
    Ok(fetch_scan_run(pool, scan_run_id)
        .await?
        .is_some_and(|run| run.status == ScanRunStatus::Paused))
}

impl ScanProgressPayload {
    #[allow(clippy::too_many_arguments)]
    fn new(
        repo_id: &str,
        scan_run_id: &str,
        status: ScanRunStatus,
        commits_indexed: i64,
        files_processed: i64,
        cursor_sha: Option<String>,
        target_head_sha: &str,
        message: Option<String>,
        error: Option<String>,
    ) -> Self {
        Self {
            repo_id: repo_id.to_string(),
            scan_run_id: scan_run_id.to_string(),
            status,
            commits_indexed,
            files_processed,
            cursor_sha,
            target_head_sha: target_head_sha.to_string(),
            message,
            error,
        }
    }
}

fn emit_scan_progress(
    progress_callback: Option<&ScanProgressCallback>,
    payload: ScanProgressPayload,
) {
    if let Some(callback) = progress_callback {
        callback(payload);
    }
}

struct PersistedBatch {
    last_new_sha: Option<String>,
    commits_inserted: usize,
    files_processed: usize,
    #[cfg(test)]
    dirty_dates: Vec<String>,
}

async fn persist_commit_batch(
    pool: &SqlitePool,
    repo_id: &str,
    raw_commits: &[RawCommit],
) -> Result<PersistedBatch, GitError> {
    let mut tx = pool.begin().await.map_err(GitError::Db)?;

    // Per-batch caches to avoid redundant DB look-ups.
    let mut alias_cache: HashMap<(String, String), String> = HashMap::new();
    let mut file_cache: HashMap<String, String> = HashMap::new();
    let mut commits_inserted = 0usize;
    let mut files_processed = 0usize;
    let mut last_new_sha: Option<String> = None;
    let mut dirty_dates: BTreeSet<String> = BTreeSet::new();

    for raw in raw_commits {
        files_processed += raw.file_changes.len();

        let committed_at = Utc
            .timestamp_opt(raw.committed_at_secs, 0)
            .single()
            .unwrap_or_default()
            .to_rfc3339();

        // Resolve or create alias + developer.
        let key = (raw.author_name.clone(), raw.author_email.clone());
        let alias_id = match alias_cache.get(&key) {
            Some(id) => id.clone(),
            None => {
                let id = upsert_alias(&mut tx, &raw.author_name, &raw.author_email).await?;
                alias_cache.insert(key, id.clone());
                id
            }
        };

        // Insert commit (IGNORE = skip if sha already in DB from a previous scan).
        let commit_id = Uuid::new_v4().to_string();
        let commit_insert = sqlx::query(
            "INSERT OR IGNORE INTO commits
             (id, repo_id, sha, author_alias_id, message, committed_at,
              insertions, deletions, files_changed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&commit_id)
        .bind(repo_id)
        .bind(&raw.sha)
        .bind(&alias_id)
        .bind(&raw.message)
        .bind(&committed_at)
        .bind(raw.insertions)
        .bind(raw.deletions)
        .bind(raw.file_changes.len() as i64)
        .execute(&mut *tx)
        .await
        .map_err(GitError::Db)?;
        let commit_was_inserted = commit_insert.rows_affected() > 0;
        let persisted_commit_id = if commit_was_inserted {
            commits_inserted += 1;
            dirty_dates.insert(commit_date(raw.committed_at_secs));
            commit_id
        } else {
            sqlx::query_scalar::<_, String>("SELECT id FROM commits WHERE repo_id = ? AND sha = ?")
                .bind(repo_id)
                .bind(&raw.sha)
                .fetch_one(&mut *tx)
                .await
                .map_err(GitError::Db)?
        };

        // Insert per-file changes.
        for fc in &raw.file_changes {
            let file_id = upsert_file(
                pool,
                &mut tx,
                repo_id,
                &fc.new_path,
                fc.old_path.as_deref(),
                &committed_at,
                &mut file_cache,
            )
            .await?;

            let change_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT OR IGNORE INTO commit_file_changes
                 (id, commit_id, file_id, change_type, insertions, deletions)
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&change_id)
            .bind(&persisted_commit_id)
            .bind(&file_id)
            .bind(fc.change_type.as_str())
            .bind(fc.insertions)
            .bind(fc.deletions)
            .execute(&mut *tx)
            .await
            .map_err(GitError::Db)?;
        }

        last_new_sha = Some(raw.sha.clone());
    }

    // Update the repo's last indexed SHA.
    if let Some(sha) = &last_new_sha {
        sqlx::query("UPDATE repos SET last_indexed_commit_sha = ? WHERE id = ?")
            .bind(sha)
            .bind(repo_id)
            .execute(&mut *tx)
            .await
            .map_err(GitError::Db)?;
    }

    let dirty_dates = dirty_dates.into_iter().collect::<Vec<_>>();
    mark_dirty_aggregate_scopes(&mut tx, repo_id, &dirty_dates).await?;

    tx.commit().await.map_err(GitError::Db)?;

    Ok(PersistedBatch {
        last_new_sha,
        commits_inserted,
        files_processed,
        #[cfg(test)]
        dirty_dates,
    })
}

async fn mark_dirty_aggregate_scopes(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    repo_id: &str,
    dates: &[String],
) -> Result<(), GitError> {
    if dates.is_empty() {
        return Ok(());
    }

    let now = Utc::now().to_rfc3339();
    for date in dates {
        sqlx::query(
            "INSERT INTO dirty_aggregate_scopes (repo_id, date, created_at, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(repo_id, date) DO UPDATE SET
                 updated_at = excluded.updated_at",
        )
        .bind(repo_id)
        .bind(date)
        .bind(&now)
        .bind(&now)
        .execute(&mut **tx)
        .await
        .map_err(GitError::Db)?;
    }

    debug!(
        repo_id,
        dirty_dates = ?dates,
        "dirty aggregate scopes marked for persisted scan batch"
    );
    Ok(())
}

fn commit_date(committed_at_secs: i64) -> String {
    Utc.timestamp_opt(committed_at_secs, 0)
        .single()
        .unwrap_or_default()
        .date_naive()
        .format("%Y-%m-%d")
        .to_string()
}

// ── Sync git2 helpers (run on spawn_blocking) ─────────────────────────────────

/// Walk the repository's commit history and extract raw data for every new
/// commit. Runs synchronously; must be called from a blocking context.
fn collect_commits(
    repo_path: &Path,
    active_branch: &str,
    since_sha: Option<&str>,
    max_commits: Option<usize>,
    progress_tx: Option<tokio::sync::mpsc::Sender<usize>>,
) -> Result<Vec<RawCommit>, GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotFound {
        path: repo_path.display().to_string(),
    })?;

    ensure_worktree(&repo, repo_path)?;

    info!(
        path = %repo_path.display(),
        branch = active_branch,
        since_sha = since_sha.unwrap_or("none"),
        "setting up revwalk"
    );
    let walk = setup_revwalk(&repo, active_branch, since_sha)?;
    let mut commits = Vec::new();
    let start_time = std::time::Instant::now();
    let mut commit_count = 0;

    for oid_result in walk {
        let oid = oid_result?;
        commit_count += 1;

        if commit_count % 1000 == 0 {
            let elapsed = start_time.elapsed();
            info!(
                commits_processed = commit_count,
                elapsed_secs = elapsed.as_secs_f64(),
                "processing commits..."
            );
            // Send progress update
            if let Some(ref tx) = progress_tx {
                let _ = tx.blocking_send(commit_count);
            }
        }

        let commit = repo.find_commit(oid)?;

        let mut diff_opts = DiffOptions::new();
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
        let tree = commit.tree()?;

        let mut diff =
            repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut diff_opts))?;

        // Enable rename / copy detection.
        let mut find_opts = DiffFindOptions::new();
        find_opts.renames(true).copies(true);
        diff.find_similar(Some(&mut find_opts))?;

        let stats = diff.stats()?;
        let total_insertions = stats.insertions() as i64;
        let total_deletions = stats.deletions() as i64;

        let mut file_changes = Vec::new();
        let n_deltas = diff.deltas().count();

        for i in 0..n_deltas {
            let delta = match diff.get_delta(i) {
                Some(d) => d,
                None => continue,
            };

            let change_type = match delta.status() {
                git2::Delta::Added => ChangeType::A,
                git2::Delta::Deleted => ChangeType::D,
                git2::Delta::Modified => ChangeType::M,
                git2::Delta::Renamed => ChangeType::R,
                git2::Delta::Copied => ChangeType::C,
                other => {
                    debug!("skipping delta status {:?}", other);
                    continue;
                }
            };

            let new_path = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default();

            let old_path = if change_type == ChangeType::R {
                delta
                    .old_file()
                    .path()
                    .map(|p| p.to_string_lossy().into_owned())
            } else {
                None
            };

            // Per-file line counts from the patch.
            let (file_ins, file_del) = match git2::Patch::from_diff(&diff, i) {
                Ok(Some(patch)) => {
                    let (_, ins, del) = patch.line_stats().unwrap_or((0, 0, 0));
                    (ins as i64, del as i64)
                }
                _ => (0i64, 0i64),
            };

            file_changes.push(RawFileChange {
                old_path,
                new_path,
                change_type,
                insertions: file_ins,
                deletions: file_del,
            });
        }

        let author = commit.author();
        commits.push(RawCommit {
            sha: oid.to_string(),
            author_name: author.name().unwrap_or("Unknown").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            message: commit.message().unwrap_or("").trim().to_string(),
            committed_at_secs: commit.time().seconds(),
            insertions: total_insertions,
            deletions: total_deletions,
            file_changes,
        });

        if let Some(max_commits) = max_commits {
            if commits.len() >= max_commits {
                break;
            }
        }
    }

    let elapsed = start_time.elapsed();
    info!(
        commits_collected = commits.len(),
        elapsed_secs = elapsed.as_secs_f64(),
        "collect_commits finished"
    );

    Ok(commits)
}

fn resolve_target_head_sha(repo_path: &Path, active_branch: &str) -> Result<String, GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotFound {
        path: repo_path.display().to_string(),
    })?;

    let branch_ref = format!("refs/heads/{active_branch}");
    match repo.refname_to_id(&branch_ref) {
        Ok(oid) => Ok(oid.to_string()),
        Err(_) => Ok(repo.head()?.peel_to_commit()?.id().to_string()),
    }
}

/// Create the analysis worktree if it does not already exist.
/// The worktree lives at `<repo_path>/.gitpulse-worktree/`.
fn ensure_worktree(repo: &Repository, repo_path: &Path) -> Result<(), GitError> {
    let worktree_path = repo_path.join(".gitpulse-worktree");

    let worktrees = repo.worktrees()?;
    let already_exists = worktrees.iter().any(|w| w == Some("gitpulse-analysis"));

    if already_exists || worktree_path.exists() {
        return Ok(());
    }

    match repo.worktree("gitpulse-analysis", &worktree_path, None) {
        Ok(_) => {}
        Err(e) => {
            // Non-fatal: if the worktree can't be created (e.g. bare repo,
            // detached HEAD), log a warning and continue — history reads
            // don't require a checked-out tree.
            warn!("could not create worktree: {}", e);
        }
    }

    Ok(())
}

// ── Async DB helpers ──────────────────────────────────────────────────────────

/// Look up an alias by (git_name, git_email). If not found, create a new
/// developer + alias pair using the git identity as the canonical name.
async fn upsert_alias(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    git_name: &str,
    git_email: &str,
) -> Result<String, GitError> {
    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM aliases WHERE git_name = ? AND git_email = ?")
            .bind(git_name)
            .bind(git_email)
            .fetch_optional(&mut **tx)
            .await
            .map_err(GitError::Db)?;

    if let Some(id) = existing {
        return Ok(id);
    }

    let now = Utc::now().to_rfc3339();

    // Create a developer for this identity.
    let dev_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO developers (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&dev_id)
        .bind(git_name)
        .bind(&now)
        .execute(&mut **tx)
        .await
        .map_err(GitError::Db)?;

    // Create the alias linked to that developer.
    let alias_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO aliases (id, developer_id, git_name, git_email, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&alias_id)
    .bind(&dev_id)
    .bind(git_name)
    .bind(git_email)
    .bind(&now)
    .execute(&mut **tx)
    .await
    .map_err(GitError::Db)?;

    Ok(alias_id)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use chrono::Utc;
    use git2::{build::CheckoutBuilder, Repository, Signature};
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;
    use uuid::Uuid;

    // ── Git repo helpers ──────────────────────────────────────────────────────

    fn init_repo(dir: &Path) -> Repository {
        Repository::init(dir).expect("init repo")
    }

    /// Stage `files`, then create a commit authored by `author_name / author_email`.
    /// Returns the commit SHA string.
    fn add_commit(
        repo: &Repository,
        message: &str,
        author_name: &str,
        author_email: &str,
        files: &[(&str, &str)],
    ) -> String {
        let workdir = repo.workdir().unwrap().to_owned();
        for (name, content) in files {
            let path = workdir.join(name);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(path, content).unwrap();
        }

        let mut index = repo.index().unwrap();
        for (name, _) in files {
            index.add_path(std::path::Path::new(name)).unwrap();
        }
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();

        let sig = Signature::now(author_name, author_email).unwrap();
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.as_ref().into_iter().collect();

        let oid = repo
            .commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .unwrap();
        oid.to_string()
    }

    fn checkout_branch(repo: &Repository, branch: &str) {
        repo.set_head(&format!("refs/heads/{branch}")).unwrap();
        repo.checkout_head(Some(CheckoutBuilder::new().force()))
            .unwrap();
    }

    // ── DB seed helper ────────────────────────────────────────────────────────

    /// Insert a minimal workspace + repo record so scan_repo can find it.
    async fn seed_repo_record(pool: &sqlx::SqlitePool, path: &Path) -> String {
        let now = Utc::now().to_rfc3339();
        let ws_id = Uuid::new_v4().to_string();
        let repo_id = Uuid::new_v4().to_string();

        sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES (?,?,?)")
            .bind(&ws_id)
            .bind("test-ws")
            .bind(&now)
            .execute(pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
             VALUES (?,?,?,?,?,?)",
        )
        .bind(&repo_id)
        .bind(&ws_id)
        .bind("test-repo")
        .bind(path.to_str().unwrap())
        .bind("master")
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();

        repo_id
    }

    /// Rename `old_path` → `new_path` in the working tree, stage the change,
    /// and create a commit. git2's similarity detection will flag it as RENAMED.
    fn rename_commit(
        repo: &Repository,
        message: &str,
        author_name: &str,
        author_email: &str,
        old_path: &str,
        new_path: &str,
    ) {
        let workdir = repo.workdir().unwrap().to_owned();
        std::fs::rename(workdir.join(old_path), workdir.join(new_path)).unwrap();

        let mut index = repo.index().unwrap();
        index.remove_path(std::path::Path::new(old_path)).unwrap();
        index.add_path(std::path::Path::new(new_path)).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = Signature::now(author_name, author_email).unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
            .unwrap();
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn full_scan_inserts_commits() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(
            &repo,
            "init",
            "Alice",
            "alice@example.com",
            &[("a.txt", "hello")],
        );
        add_commit(
            &repo,
            "second",
            "Alice",
            "alice@example.com",
            &[("b.txt", "world")],
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        let result = scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        assert_eq!(result.commits_added, 2);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM commits WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn persisted_batch_reports_unique_dirty_dates_for_inserted_commits() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(&repo, "c1", "Alice", "alice@example.com", &[("a.txt", "1")]);
        add_commit(&repo, "c2", "Alice", "alice@example.com", &[("b.txt", "2")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        let raw_commits =
            collect_commits(tmp.path(), "master", None, None, None).expect("collect commits");

        let first_batch = persist_commit_batch(&pool, &repo_id, &raw_commits)
            .await
            .unwrap();
        assert_eq!(first_batch.commits_inserted, 2);
        assert_eq!(first_batch.dirty_dates.len(), 1);
        assert_eq!(first_batch.dirty_dates[0].len(), 10);

        let replayed_batch = persist_commit_batch(&pool, &repo_id, &raw_commits)
            .await
            .unwrap();
        assert_eq!(replayed_batch.commits_inserted, 0);
        assert!(replayed_batch.dirty_dates.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn batched_scan_marks_dirty_scopes_for_persisted_commit_dates() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        crate::test_utils::commit_at(
            &repo,
            "c1",
            "Alice",
            "alice@example.com",
            &[("a.txt", "1")],
            1_704_067_200,
        );
        crate::test_utils::commit_at(
            &repo,
            "c2",
            "Alice",
            "alice@example.com",
            &[("b.txt", "2")],
            1_704_153_600,
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        let result = scan_repo_with_options(
            &pool,
            &repo_id,
            tmp.path(),
            "master",
            ScanOptions {
                batch_size: 1,
                fail_after_batches: None,
                pause_after_batches: None,
            },
            None,
        )
        .await
        .unwrap();

        assert_eq!(result.commits_added, 2);
        let dirty_dates: Vec<String> = sqlx::query_scalar(
            "SELECT date
             FROM dirty_aggregate_scopes
             WHERE repo_id = ?
             ORDER BY date",
        )
        .bind(&repo_id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(dirty_dates, vec!["2024-01-01", "2024-01-02"]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn full_scan_creates_developer_and_alias() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(
            &repo,
            "init",
            "Alice",
            "alice@example.com",
            &[("a.txt", "hi")],
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        let dev_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM developers")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(dev_count, 1);

        let alias_email: String = sqlx::query_scalar("SELECT git_email FROM aliases LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(alias_email, "alice@example.com");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn full_scan_deduplicates_same_author() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(&repo, "c1", "Alice", "alice@example.com", &[("a.txt", "1")]);
        add_commit(&repo, "c2", "Alice", "alice@example.com", &[("b.txt", "2")]);
        add_commit(&repo, "c3", "Alice", "alice@example.com", &[("c.txt", "3")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        // Same author across 3 commits → exactly 1 developer + 1 alias.
        let dev_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM developers")
            .fetch_one(&pool)
            .await
            .unwrap();
        let alias_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM aliases")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(dev_count, 1);
        assert_eq!(alias_count, 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn full_scan_inserts_file_records() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(
            &repo,
            "init",
            "Alice",
            "alice@example.com",
            &[("src/main.rs", "fn main() {}"), ("README.md", "# hi")],
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        let file_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM files WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(file_count, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scan_updates_last_indexed_sha() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        let sha = add_commit(
            &repo,
            "init",
            "Alice",
            "alice@example.com",
            &[("a.txt", "1")],
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        let indexed_sha: String =
            sqlx::query_scalar("SELECT last_indexed_commit_sha FROM repos WHERE id=?")
                .bind(&repo_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(indexed_sha, sha);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn incremental_scan_only_processes_new_commits() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(&repo, "c1", "Alice", "alice@example.com", &[("a.txt", "1")]);
        add_commit(&repo, "c2", "Alice", "alice@example.com", &[("b.txt", "2")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;

        // First scan: 2 commits.
        let r1 = scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();
        assert_eq!(r1.commits_added, 2);

        // Add one more commit.
        add_commit(&repo, "c3", "Alice", "alice@example.com", &[("c.txt", "3")]);

        // Second scan: should only pick up the 1 new commit.
        let r2 = scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();
        assert_eq!(r2.commits_added, 1);

        // Total in DB: 3.
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM commits WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(total, 3);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn full_branch_scan_reuses_existing_shared_commit_records() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());

        let shared_sha = add_commit(
            &repo,
            "shared",
            "Alice",
            "alice@example.com",
            &[("a.txt", "1")],
        );
        let shared_commit = repo
            .find_commit(git2::Oid::from_str(&shared_sha).unwrap())
            .unwrap();
        repo.branch("feature", &shared_commit, false).unwrap();

        let master_sha = add_commit(
            &repo,
            "master-only",
            "Alice",
            "alice@example.com",
            &[("b.txt", "2")],
        );
        checkout_branch(&repo, "feature");
        let feature_sha = add_commit(
            &repo,
            "feature-only",
            "Alice",
            "alice@example.com",
            &[("c.txt", "3")],
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        let master_result = scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();
        assert_eq!(master_result.commits_added, 2);

        // Simulate the first scan for another branch once branch-specific
        // cursors are introduced: the shared base commit already exists.
        sqlx::query("UPDATE repos SET last_indexed_commit_sha = NULL WHERE id = ?")
            .bind(&repo_id)
            .execute(&pool)
            .await
            .unwrap();

        let feature_result = scan_repo(&pool, &repo_id, tmp.path(), "feature")
            .await
            .unwrap();
        assert_eq!(feature_result.commits_added, 1);

        let commit_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM commits WHERE repo_id = ?")
                .bind(&repo_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(commit_count, 3);

        let change_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*)
             FROM commit_file_changes cfc
             JOIN commits c ON c.id = cfc.commit_id
             WHERE c.repo_id = ?",
        )
        .bind(&repo_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(change_count, 3);

        let master_cursor: String = sqlx::query_scalar(
            "SELECT last_indexed_commit_sha
             FROM repo_branch_cursors
             WHERE repo_id = ? AND branch_name = 'master'",
        )
        .bind(&repo_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        let feature_cursor: String = sqlx::query_scalar(
            "SELECT last_indexed_commit_sha
             FROM repo_branch_cursors
             WHERE repo_id = ? AND branch_name = 'feature'",
        )
        .bind(&repo_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(master_cursor, master_sha);
        assert_eq!(feature_cursor, feature_sha);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scan_repo_with_progress_emits_running_and_completed_payloads() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(&repo, "c1", "Alice", "alice@example.com", &[("a.txt", "1")]);
        add_commit(&repo, "c2", "Alice", "alice@example.com", &[("b.txt", "2")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        let events = Arc::new(Mutex::new(Vec::new()));
        let event_sink = Arc::clone(&events);
        let callback: ScanProgressCallback = Arc::new(move |payload| {
            event_sink.lock().unwrap().push(payload);
        });

        let result = scan_repo_with_progress(&pool, &repo_id, tmp.path(), "master", callback)
            .await
            .unwrap();

        assert_eq!(result.commits_added, 2);
        let events = events.lock().unwrap();
        assert_eq!(events.first().unwrap().status, ScanRunStatus::Running);
        assert_eq!(events.first().unwrap().commits_indexed, 0);
        assert_eq!(events.last().unwrap().status, ScanRunStatus::Completed);
        assert_eq!(events.last().unwrap().commits_indexed, 2);
        assert_eq!(events.last().unwrap().files_processed, 2);
        assert_eq!(events.last().unwrap().repo_id, repo_id);
        assert!(events.last().unwrap().cursor_sha.is_some());

        let serialized = serde_json::to_value(events.last().unwrap()).unwrap();
        assert_eq!(serialized["status"], "completed");
        assert_eq!(serialized["scan_run_id"].as_str().unwrap().len(), 36);
        assert!(serialized["target_head_sha"].as_str().unwrap().len() >= 40);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn interrupted_batched_scan_persists_completed_batches() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(&repo, "c1", "Alice", "alice@example.com", &[("a.txt", "1")]);
        add_commit(&repo, "c2", "Alice", "alice@example.com", &[("b.txt", "2")]);
        add_commit(&repo, "c3", "Alice", "alice@example.com", &[("c.txt", "3")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;

        let result = scan_repo_with_options(
            &pool,
            &repo_id,
            tmp.path(),
            "master",
            ScanOptions {
                batch_size: 2,
                fail_after_batches: Some(1),
                pause_after_batches: None,
            },
            None,
        )
        .await;

        assert!(result.is_err());

        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM commits WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(total, 2);

        let indexed_sha: String =
            sqlx::query_scalar("SELECT last_indexed_commit_sha FROM repos WHERE id=?")
                .bind(&repo_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        let (status, commits_indexed, files_processed, cursor_sha): (String, i64, i64, String) =
            sqlx::query_as(
                "SELECT status, commits_indexed, files_processed, cursor_sha
                 FROM scan_runs
                 WHERE repo_id = ?",
            )
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(status, "failed");
        assert_eq!(commits_indexed, 2);
        assert_eq!(files_processed, 2);
        assert_eq!(cursor_sha, indexed_sha);

        let indexed_commit_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM commits WHERE repo_id = ? AND sha = ?)",
        )
        .bind(&repo_id)
        .bind(&indexed_sha)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(indexed_commit_exists);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn paused_batched_scan_stops_without_completing_or_failing() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(&repo, "c1", "Alice", "alice@example.com", &[("a.txt", "1")]);
        add_commit(&repo, "c2", "Alice", "alice@example.com", &[("b.txt", "2")]);
        add_commit(&repo, "c3", "Alice", "alice@example.com", &[("c.txt", "3")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        let events = Arc::new(Mutex::new(Vec::new()));
        let event_sink = Arc::clone(&events);
        let callback: ScanProgressCallback = Arc::new(move |payload| {
            event_sink.lock().unwrap().push(payload);
        });

        let result = scan_repo_with_options(
            &pool,
            &repo_id,
            tmp.path(),
            "master",
            ScanOptions {
                batch_size: 2,
                fail_after_batches: None,
                pause_after_batches: Some(1),
            },
            Some(callback),
        )
        .await
        .unwrap();

        assert_eq!(result.commits_added, 2);

        let (status, commits_indexed, cursor_sha, completed_at): (
            String,
            i64,
            String,
            Option<String>,
        ) = sqlx::query_as(
            "SELECT status, commits_indexed, cursor_sha, completed_at
             FROM scan_runs
             WHERE repo_id = ?",
        )
        .bind(&repo_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(status, "paused");
        assert_eq!(commits_indexed, 2);
        assert!(completed_at.is_none());

        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM commits WHERE repo_id = ?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(total, 2);

        let branch_cursor: String = sqlx::query_scalar(
            "SELECT last_indexed_commit_sha
             FROM repo_branch_cursors
             WHERE repo_id = ? AND branch_name = 'master'",
        )
        .bind(&repo_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(branch_cursor, cursor_sha);

        let events = events.lock().unwrap();
        assert_eq!(events.last().unwrap().status, ScanRunStatus::Paused);
        assert_eq!(events.last().unwrap().commits_indexed, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn second_scan_with_no_new_commits_returns_zero() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(
            &repo,
            "init",
            "Alice",
            "alice@example.com",
            &[("a.txt", "1")],
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        let r2 = scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();
        assert_eq!(r2.commits_added, 0);
    }

    /// Rename within a single scan: both commits are processed in one pass,
    /// so the old path comes from the in-memory cache (not the DB).
    #[tokio::test(flavor = "multi_thread")]
    async fn rename_within_single_scan_tracked_via_cache() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());

        add_commit(
            &repo,
            "add file",
            "Alice",
            "alice@example.com",
            &[(
                "old.rs",
                "fn foo() {}\n// identical content for rename detection",
            )],
        );
        rename_commit(
            &repo,
            "rename file",
            "Alice",
            "alice@example.com",
            "old.rs",
            "new.rs",
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        // Exactly 1 file record (stable canonical ID across the rename).
        let file_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM files WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            file_count, 1,
            "canonical file_id must be stable across rename"
        );

        // file_name_history has one entry.
        let hist_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM file_name_history")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(hist_count, 1);

        // The history entry records the right paths.
        let (old_path, new_path): (String, String) =
            sqlx::query_as("SELECT old_path, new_path FROM file_name_history LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(old_path, "old.rs");
        assert_eq!(new_path, "new.rs");

        // The file's current_path is the new name.
        let current: String = sqlx::query_scalar("SELECT current_path FROM files WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(current, "new.rs");
    }

    /// Rename across two scans: the old path is already in the DB when the
    /// second scan runs, so `upsert_file` must look it up via SQL (not cache).
    #[tokio::test(flavor = "multi_thread")]
    async fn rename_across_incremental_scans_tracked_via_db() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());

        add_commit(
            &repo,
            "add file",
            "Alice",
            "alice@example.com",
            &[(
                "old.rs",
                "fn foo() {}\n// identical content for rename detection",
            )],
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;

        // Scan 1: indexes "old.rs", cache is discarded after the scan.
        scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        // Now rename and scan again — cache starts empty for scan 2.
        rename_commit(
            &repo,
            "rename file",
            "Alice",
            "alice@example.com",
            "old.rs",
            "new.rs",
        );
        scan_repo(&pool, &repo_id, tmp.path(), "master")
            .await
            .unwrap();

        // Same assertions: 1 file, 1 history entry, correct current_path.
        let file_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM files WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            file_count, 1,
            "canonical file_id must survive an incremental rename"
        );

        let hist_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM file_name_history")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(hist_count, 1);

        let current: String = sqlx::query_scalar("SELECT current_path FROM files WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(current, "new.rs");
    }
}
