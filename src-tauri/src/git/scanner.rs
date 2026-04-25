use std::collections::HashMap;
use std::path::Path;

use chrono::{TimeZone, Utc};
use git2::{DiffFindOptions, DiffOptions, Repository};
use sqlx::SqlitePool;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::models::commit::ChangeType;

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
    #[error("join error: {0}")]
    Join(String),
}

// ── Public result ─────────────────────────────────────────────────────────────

/// Summary returned after a successful scan.
#[derive(Debug, serde::Serialize)]
pub struct ScanResult {
    pub commits_added: usize,
    pub files_processed: usize,
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
    // Fetch the last indexed SHA to determine incremental range.
    let last_sha: Option<String> = sqlx::query_scalar(
        "SELECT last_indexed_commit_sha FROM repos WHERE id = ?",
    )
    .bind(repo_id)
    .fetch_one(pool)
    .await
    .map_err(GitError::Db)?;

    info!(
        repo_id,
        path = %repo_path.display(),
        last_sha = last_sha.as_deref().unwrap_or("none"),
        "starting git scan"
    );

    // ── Phase 1: collect raw commits (sync, on blocking thread pool) ──────────
    let path_owned = repo_path.to_path_buf();
    let last_sha_clone = last_sha.clone();
    let branch_owned = active_branch.to_string();

    // For now, we're not streaming progress. Just do the full scan.
    let raw_commits =
        tokio::task::spawn_blocking(move || collect_commits(&path_owned, &branch_owned, last_sha_clone.as_deref(), None))
            .await
            .map_err(|e| GitError::Join(e.to_string()))??;

    let commits_added = raw_commits.len();

    if raw_commits.is_empty() {
        info!(repo_id, "no new commits to index");
        return Ok(ScanResult { commits_added: 0, files_processed: 0 });
    }

    info!(repo_id, commits_added, "persisting commits");

    // ── Phase 2: persist to DB inside a single transaction ───────────────────
    let mut tx = pool.begin().await.map_err(GitError::Db)?;

    // Per-scan caches to avoid redundant DB look-ups.
    let mut alias_cache: HashMap<(String, String), String> = HashMap::new();
    let mut file_cache: HashMap<String, String> = HashMap::new();
    let mut files_processed = 0usize;
    let mut last_new_sha: Option<String> = None;

    for raw in &raw_commits {
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
                let id =
                    upsert_alias(&mut tx, &raw.author_name, &raw.author_email).await?;
                alias_cache.insert(key, id.clone());
                id
            }
        };

        // Insert commit (IGNORE = skip if sha already in DB from a previous scan).
        let commit_id = Uuid::new_v4().to_string();
        sqlx::query(
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
            .bind(&commit_id)
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

    tx.commit().await.map_err(GitError::Db)?;

    info!(repo_id, commits_added, files_processed, "scan complete");

    Ok(ScanResult { commits_added, files_processed })
}

// ── Sync git2 helpers (run on spawn_blocking) ─────────────────────────────────

/// Walk the repository's commit history and extract raw data for every new
/// commit. Runs synchronously; must be called from a blocking context.
fn collect_commits(
    repo_path: &Path,
    active_branch: &str,
    since_sha: Option<&str>,
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
            let (file_ins, file_del) =
                match git2::Patch::from_diff(&diff, i) {
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
    }

    let elapsed = start_time.elapsed();
    info!(
        commits_collected = commits.len(),
        elapsed_secs = elapsed.as_secs_f64(),
        "collect_commits finished"
    );

    Ok(commits)
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
    use git2::{Repository, Signature};
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
        add_commit(&repo, "init", "Alice", "alice@example.com", &[("a.txt", "hello")]);
        add_commit(&repo, "second", "Alice", "alice@example.com", &[("b.txt", "world")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        let result = scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

        assert_eq!(result.commits_added, 2);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM commits WHERE repo_id=?")
            .bind(&repo_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn full_scan_creates_developer_and_alias() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(&repo, "init", "Alice", "alice@example.com", &[("a.txt", "hi")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

        let dev_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM developers")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(dev_count, 1);

        let alias_email: String =
            sqlx::query_scalar("SELECT git_email FROM aliases LIMIT 1")
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
        scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

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
        scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

        let file_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM files WHERE repo_id=?")
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
        let sha = add_commit(&repo, "init", "Alice", "alice@example.com", &[("a.txt", "1")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

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
        let r1 = scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();
        assert_eq!(r1.commits_added, 2);

        // Add one more commit.
        add_commit(&repo, "c3", "Alice", "alice@example.com", &[("c.txt", "3")]);

        // Second scan: should only pick up the 1 new commit.
        let r2 = scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();
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
    async fn second_scan_with_no_new_commits_returns_zero() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        add_commit(&repo, "init", "Alice", "alice@example.com", &[("a.txt", "1")]);

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

        let r2 = scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();
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
            &[("old.rs", "fn foo() {}\n// identical content for rename detection")],
        );
        rename_commit(&repo, "rename file", "Alice", "alice@example.com", "old.rs", "new.rs");

        let repo_id = seed_repo_record(&pool, tmp.path()).await;
        scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

        // Exactly 1 file record (stable canonical ID across the rename).
        let file_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM files WHERE repo_id=?")
                .bind(&repo_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(file_count, 1, "canonical file_id must be stable across rename");

        // file_name_history has one entry.
        let hist_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM file_name_history")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(hist_count, 1);

        // The history entry records the right paths.
        let (old_path, new_path): (String, String) = sqlx::query_as(
            "SELECT old_path, new_path FROM file_name_history LIMIT 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(old_path, "old.rs");
        assert_eq!(new_path, "new.rs");

        // The file's current_path is the new name.
        let current: String =
            sqlx::query_scalar("SELECT current_path FROM files WHERE repo_id=?")
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
            &[("old.rs", "fn foo() {}\n// identical content for rename detection")],
        );

        let repo_id = seed_repo_record(&pool, tmp.path()).await;

        // Scan 1: indexes "old.rs", cache is discarded after the scan.
        scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

        // Now rename and scan again — cache starts empty for scan 2.
        rename_commit(&repo, "rename file", "Alice", "alice@example.com", "old.rs", "new.rs");
        scan_repo(&pool, &repo_id, tmp.path(), "master").await.unwrap();

        // Same assertions: 1 file, 1 history entry, correct current_path.
        let file_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM files WHERE repo_id=?")
                .bind(&repo_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(file_count, 1, "canonical file_id must survive an incremental rename");

        let hist_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM file_name_history")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(hist_count, 1);

        let current: String =
            sqlx::query_scalar("SELECT current_path FROM files WHERE repo_id=?")
                .bind(&repo_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(current, "new.rs");
    }
}
