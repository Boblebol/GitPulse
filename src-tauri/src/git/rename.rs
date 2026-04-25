use std::collections::HashMap;

use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use super::scanner::GitError;

/// Resolve or create the canonical `file_id` for a path in a given repo.
///
/// Handles renames: when `old_path` is provided (i.e. the delta was a rename),
/// the existing file record is updated to the new path and a history entry is
/// inserted. The in-process `cache` maps `current_path → file_id` to avoid
/// redundant DB round-trips within a single scan.
pub async fn upsert_file(
    pool: &SqlitePool,
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    repo_id: &str,
    new_path: &str,
    old_path: Option<&str>,
    committed_at: &str,
    cache: &mut HashMap<String, String>,
) -> Result<String, GitError> {
    // ── Rename path ──────────────────────────────────────────────────────────
    if let Some(old) = old_path {
        // Look up the old path in cache first, then DB.
        let file_id = if let Some(id) = cache.get(old).cloned() {
            id
        } else {
            let row: Option<String> =
                sqlx::query_scalar("SELECT id FROM files WHERE repo_id = ? AND current_path = ?")
                    .bind(repo_id)
                    .bind(old)
                    .fetch_optional(&mut **tx)
                    .await
                    .map_err(GitError::Db)?;

            match row {
                Some(id) => id,
                // Old path unknown — fall through to normal upsert below.
                None => return upsert_new_or_existing(pool, tx, repo_id, new_path, cache).await,
            }
        };

        // Update current_path in files.
        sqlx::query("UPDATE files SET current_path = ? WHERE id = ?")
            .bind(new_path)
            .bind(&file_id)
            .execute(&mut **tx)
            .await
            .map_err(GitError::Db)?;

        // Record the rename in file_name_history.
        let hist_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO file_name_history (id, file_id, old_path, new_path, changed_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&hist_id)
        .bind(&file_id)
        .bind(old)
        .bind(new_path)
        .bind(committed_at)
        .execute(&mut **tx)
        .await
        .map_err(GitError::Db)?;

        cache.remove(old);
        cache.insert(new_path.to_string(), file_id.clone());
        return Ok(file_id);
    }

    // ── Normal path ──────────────────────────────────────────────────────────
    upsert_new_or_existing(pool, tx, repo_id, new_path, cache).await
}

async fn upsert_new_or_existing(
    _pool: &SqlitePool,
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    repo_id: &str,
    path: &str,
    cache: &mut HashMap<String, String>,
) -> Result<String, GitError> {
    if let Some(id) = cache.get(path) {
        return Ok(id.clone());
    }

    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM files WHERE repo_id = ? AND current_path = ?")
            .bind(repo_id)
            .bind(path)
            .fetch_optional(&mut **tx)
            .await
            .map_err(GitError::Db)?;

    if let Some(id) = existing {
        cache.insert(path.to_string(), id.clone());
        return Ok(id);
    }

    let file_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO files (id, repo_id, current_path, created_at) VALUES (?, ?, ?, ?)")
        .bind(&file_id)
        .bind(repo_id)
        .bind(path)
        .bind(&now)
        .execute(&mut **tx)
        .await
        .map_err(GitError::Db)?;

    cache.insert(path.to_string(), file_id.clone());
    Ok(file_id)
}
