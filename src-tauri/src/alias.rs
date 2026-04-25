use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::models::developer::{Alias, Developer};

// ── Error type ────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum AliasError {
    #[error("developer not found: {id}")]
    DeveloperNotFound { id: String },
    #[error("alias not found: {id}")]
    AliasNotFound { id: String },
    #[error("source and target developer are the same")]
    SameDeveloper,
    #[error("cannot delete developer with active aliases")]
    HasAliases,
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
}

// ── Response types ────────────────────────────────────────────────────────────

/// A developer together with all their git aliases.
/// `is_auto_created` is true when the developer was created automatically by
/// the scanner (single alias, canonical name == git_name) and has never been
/// manually reviewed / merged. The UI shows these prominently.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperWithAliases {
    #[serde(flatten)]
    pub developer: Developer,
    pub aliases: Vec<Alias>,
    pub is_auto_created: bool,
}

// ── Queries ───────────────────────────────────────────────────────────────────

/// Return all developers ordered by name, each with their full alias list.
pub async fn list_developers(pool: &SqlitePool) -> Result<Vec<DeveloperWithAliases>, AliasError> {
    let developers: Vec<Developer> =
        sqlx::query_as("SELECT id, name, created_at FROM developers ORDER BY name COLLATE NOCASE")
            .fetch_all(pool)
            .await
            .map_err(AliasError::Db)?;

    let aliases: Vec<Alias> = sqlx::query_as(
        "SELECT id, developer_id, git_name, git_email, created_at
         FROM aliases
         ORDER BY git_name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await
    .map_err(AliasError::Db)?;

    // Group aliases by developer_id in memory.
    let mut by_dev: HashMap<String, Vec<Alias>> = HashMap::new();
    for alias in aliases {
        by_dev
            .entry(alias.developer_id.clone())
            .or_default()
            .push(alias);
    }

    let result = developers
        .into_iter()
        .map(|dev| {
            let dev_aliases = by_dev.remove(&dev.id).unwrap_or_default();
            // Auto-created = only one alias and developer name matches git_name.
            let is_auto_created = dev_aliases.len() == 1 && dev_aliases[0].git_name == dev.name;
            DeveloperWithAliases {
                developer: dev,
                aliases: dev_aliases,
                is_auto_created,
            }
        })
        .collect();

    Ok(result)
}

/// Return only auto-created (unreviewed) developers.
pub async fn list_unreviewed(pool: &SqlitePool) -> Result<Vec<DeveloperWithAliases>, AliasError> {
    let all = list_developers(pool).await?;
    Ok(all.into_iter().filter(|d| d.is_auto_created).collect())
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/// Move all aliases from `source_id` to `target_id`, then delete `source_id`.
///
/// This is the primary merge operation. Because `commits.author_alias_id`
/// references `aliases.id` (not `developers.id`), no commit rows are touched —
/// aggregate recalculation is the only follow-up needed.
pub async fn merge_developers(
    pool: &SqlitePool,
    source_id: &str,
    target_id: &str,
) -> Result<(), AliasError> {
    if source_id == target_id {
        return Err(AliasError::SameDeveloper);
    }

    // Verify both exist.
    ensure_developer_exists(pool, source_id).await?;
    ensure_developer_exists(pool, target_id).await?;

    let mut tx = pool.begin().await.map_err(AliasError::Db)?;

    // Re-point every alias of the source developer to the target.
    sqlx::query("UPDATE aliases SET developer_id = ? WHERE developer_id = ?")
        .bind(target_id)
        .bind(source_id)
        .execute(&mut *tx)
        .await
        .map_err(AliasError::Db)?;

    // The source developer now has no aliases — safe to delete.
    sqlx::query("DELETE FROM developers WHERE id = ?")
        .bind(source_id)
        .execute(&mut *tx)
        .await
        .map_err(AliasError::Db)?;

    tx.commit().await.map_err(AliasError::Db)?;

    Ok(())
}

/// Move a single alias to a different developer.
///
/// If the alias's current developer is left with no aliases, it is deleted
/// automatically (it was auto-created and is now empty).
pub async fn reassign_alias(
    pool: &SqlitePool,
    alias_id: &str,
    new_developer_id: &str,
) -> Result<(), AliasError> {
    ensure_developer_exists(pool, new_developer_id).await?;

    // Fetch the alias to know its current developer.
    let current_dev_id: Option<String> =
        sqlx::query_scalar("SELECT developer_id FROM aliases WHERE id = ?")
            .bind(alias_id)
            .fetch_optional(pool)
            .await
            .map_err(AliasError::Db)?;

    let current_dev_id = current_dev_id.ok_or_else(|| AliasError::AliasNotFound {
        id: alias_id.to_string(),
    })?;

    if current_dev_id == new_developer_id {
        return Ok(()); // nothing to do
    }

    let mut tx = pool.begin().await.map_err(AliasError::Db)?;

    sqlx::query("UPDATE aliases SET developer_id = ? WHERE id = ?")
        .bind(new_developer_id)
        .bind(alias_id)
        .execute(&mut *tx)
        .await
        .map_err(AliasError::Db)?;

    // Delete the old developer if it is now empty.
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM aliases WHERE developer_id = ?")
        .bind(&current_dev_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(AliasError::Db)?;

    if remaining == 0 {
        sqlx::query("DELETE FROM developers WHERE id = ?")
            .bind(&current_dev_id)
            .execute(&mut *tx)
            .await
            .map_err(AliasError::Db)?;
    }

    tx.commit().await.map_err(AliasError::Db)?;

    Ok(())
}

/// Update the canonical display name of a developer.
pub async fn rename_developer(
    pool: &SqlitePool,
    developer_id: &str,
    new_name: &str,
) -> Result<(), AliasError> {
    ensure_developer_exists(pool, developer_id).await?;

    sqlx::query("UPDATE developers SET name = ? WHERE id = ?")
        .bind(new_name)
        .bind(developer_id)
        .execute(pool)
        .await
        .map_err(AliasError::Db)?;

    Ok(())
}

/// Create a new developer with no aliases (for manual alias assignment).
pub async fn create_developer(pool: &SqlitePool, name: &str) -> Result<Developer, AliasError> {
    let developer = Developer::new(name);

    sqlx::query("INSERT INTO developers (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&developer.id)
        .bind(&developer.name)
        .bind(&developer.created_at)
        .execute(pool)
        .await
        .map_err(AliasError::Db)?;

    Ok(developer)
}

/// Delete a developer only if they have no aliases remaining.
/// Returns `true` if deleted, `false` if skipped (still has aliases).
pub async fn delete_developer_if_empty(
    pool: &SqlitePool,
    developer_id: &str,
) -> Result<bool, AliasError> {
    ensure_developer_exists(pool, developer_id).await?;

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM aliases WHERE developer_id = ?")
        .bind(developer_id)
        .fetch_one(pool)
        .await
        .map_err(AliasError::Db)?;

    if count > 0 {
        return Ok(false);
    }

    sqlx::query("DELETE FROM developers WHERE id = ?")
        .bind(developer_id)
        .execute(pool)
        .await
        .map_err(AliasError::Db)?;

    Ok(true)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

pub(crate) async fn ensure_developer_exists(
    pool: &SqlitePool,
    developer_id: &str,
) -> Result<(), AliasError> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM developers WHERE id = ?)")
        .bind(developer_id)
        .fetch_one(pool)
        .await
        .map_err(AliasError::Db)?;

    if !exists {
        return Err(AliasError::DeveloperNotFound {
            id: developer_id.to_string(),
        });
    }

    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use chrono::Utc;
    use uuid::Uuid;

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Insert a developer + alias pair, simulating what the scanner produces.
    async fn seed(pool: &SqlitePool, git_name: &str, git_email: &str) -> (String, String) {
        let now = Utc::now().to_rfc3339();
        let dev_id = Uuid::new_v4().to_string();
        let alias_id = Uuid::new_v4().to_string();

        sqlx::query("INSERT INTO developers (id, name, created_at) VALUES (?,?,?)")
            .bind(&dev_id)
            .bind(git_name)
            .bind(&now)
            .execute(pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO aliases (id, developer_id, git_name, git_email, created_at)
             VALUES (?,?,?,?,?)",
        )
        .bind(&alias_id)
        .bind(&dev_id)
        .bind(git_name)
        .bind(git_email)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();

        (dev_id, alias_id)
    }

    // ── create_developer ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn create_developer_persists_and_returns() {
        let pool = test_pool().await;
        let dev = create_developer(&pool, "Alice").await.unwrap();

        assert_eq!(dev.name, "Alice");

        let found: String = sqlx::query_scalar("SELECT name FROM developers WHERE id=?")
            .bind(&dev.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(found, "Alice");
    }

    // ── list_developers ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn list_developers_empty_db() {
        let pool = test_pool().await;
        let devs = list_developers(&pool).await.unwrap();
        assert!(devs.is_empty());
    }

    #[tokio::test]
    async fn list_developers_returns_aliases() {
        let pool = test_pool().await;
        let (dev_id, _) = seed(&pool, "Alice", "alice@example.com").await;

        let devs = list_developers(&pool).await.unwrap();
        assert_eq!(devs.len(), 1);
        assert_eq!(devs[0].developer.id, dev_id);
        assert_eq!(devs[0].aliases.len(), 1);
        assert_eq!(devs[0].aliases[0].git_email, "alice@example.com");
    }

    #[tokio::test]
    async fn is_auto_created_true_for_single_matching_alias() {
        let pool = test_pool().await;
        seed(&pool, "Alice", "alice@example.com").await;

        let devs = list_developers(&pool).await.unwrap();
        assert!(devs[0].is_auto_created);
    }

    #[tokio::test]
    async fn is_auto_created_false_after_rename() {
        let pool = test_pool().await;
        let (dev_id, _) = seed(&pool, "Alice", "alice@example.com").await;
        rename_developer(&pool, &dev_id, "Alice Smith")
            .await
            .unwrap();

        let devs = list_developers(&pool).await.unwrap();
        assert!(!devs[0].is_auto_created);
    }

    #[tokio::test]
    async fn is_auto_created_false_for_multiple_aliases() {
        let pool = test_pool().await;
        let (dev_id, _) = seed(&pool, "Alice", "alice@work.com").await;

        sqlx::query(
            "INSERT INTO aliases (id, developer_id, git_name, git_email, created_at)
             VALUES (?,?,?,?,?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&dev_id)
        .bind("Alice")
        .bind("alice@personal.com")
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();

        let devs = list_developers(&pool).await.unwrap();
        assert!(!devs[0].is_auto_created);
    }

    #[tokio::test]
    async fn list_unreviewed_filters_auto_created() {
        let pool = test_pool().await;
        let (dev_id, _) = seed(&pool, "Alice", "alice@example.com").await;
        seed(&pool, "Bob", "bob@example.com").await;

        rename_developer(&pool, &dev_id, "Alice Smith")
            .await
            .unwrap();

        let unreviewed = list_unreviewed(&pool).await.unwrap();
        assert_eq!(unreviewed.len(), 1);
        assert_eq!(unreviewed[0].developer.name, "Bob");
    }

    // ── merge_developers ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn merge_moves_all_aliases_to_target() {
        let pool = test_pool().await;
        let (src_id, _) = seed(&pool, "jd", "jd@work.com").await;
        let (tgt_id, _) = seed(&pool, "John Doe", "john@personal.com").await;

        merge_developers(&pool, &src_id, &tgt_id).await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM aliases WHERE developer_id=?")
            .bind(&tgt_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn merge_deletes_source_developer() {
        let pool = test_pool().await;
        let (src_id, _) = seed(&pool, "jd", "jd@work.com").await;
        let (tgt_id, _) = seed(&pool, "John Doe", "john@personal.com").await;

        merge_developers(&pool, &src_id, &tgt_id).await.unwrap();

        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM developers WHERE id=?)")
            .bind(&src_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(!exists);
    }

    #[tokio::test]
    async fn merge_same_developer_fails() {
        let pool = test_pool().await;
        let (dev_id, _) = seed(&pool, "Alice", "alice@example.com").await;

        let err = merge_developers(&pool, &dev_id, &dev_id).await.unwrap_err();
        assert!(matches!(err, AliasError::SameDeveloper));
    }

    #[tokio::test]
    async fn merge_nonexistent_source_fails() {
        let pool = test_pool().await;
        let (tgt_id, _) = seed(&pool, "Alice", "alice@example.com").await;

        let err = merge_developers(&pool, "ghost", &tgt_id).await.unwrap_err();
        assert!(matches!(err, AliasError::DeveloperNotFound { .. }));
    }

    // ── reassign_alias ───────────────────────────────────────────────────────

    #[tokio::test]
    async fn reassign_alias_changes_developer() {
        let pool = test_pool().await;
        let (_, alias_id) = seed(&pool, "jd", "jd@work.com").await;
        let (tgt_id, _) = seed(&pool, "John Doe", "john@personal.com").await;

        reassign_alias(&pool, &alias_id, &tgt_id).await.unwrap();

        let new_dev: String = sqlx::query_scalar("SELECT developer_id FROM aliases WHERE id=?")
            .bind(&alias_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(new_dev, tgt_id);
    }

    #[tokio::test]
    async fn reassign_alias_deletes_empty_source() {
        let pool = test_pool().await;
        let (src_id, alias_id) = seed(&pool, "jd", "jd@work.com").await;
        let (tgt_id, _) = seed(&pool, "John Doe", "john@personal.com").await;

        reassign_alias(&pool, &alias_id, &tgt_id).await.unwrap();

        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM developers WHERE id=?)")
            .bind(&src_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(!exists);
    }

    #[tokio::test]
    async fn reassign_alias_noop_when_same_developer() {
        let pool = test_pool().await;
        let (dev_id, alias_id) = seed(&pool, "Alice", "alice@example.com").await;

        reassign_alias(&pool, &alias_id, &dev_id).await.unwrap();

        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM developers WHERE id=?)")
            .bind(&dev_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(exists);
    }

    #[tokio::test]
    async fn reassign_nonexistent_alias_fails() {
        let pool = test_pool().await;
        let (dev_id, _) = seed(&pool, "Alice", "alice@example.com").await;

        let err = reassign_alias(&pool, "ghost", &dev_id).await.unwrap_err();
        assert!(matches!(err, AliasError::AliasNotFound { .. }));
    }

    // ── rename_developer ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn rename_developer_updates_name() {
        let pool = test_pool().await;
        let (dev_id, _) = seed(&pool, "alice", "alice@example.com").await;

        rename_developer(&pool, &dev_id, "Alice Dupont")
            .await
            .unwrap();

        let name: String = sqlx::query_scalar("SELECT name FROM developers WHERE id=?")
            .bind(&dev_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(name, "Alice Dupont");
    }

    #[tokio::test]
    async fn rename_nonexistent_developer_fails() {
        let pool = test_pool().await;
        let err = rename_developer(&pool, "ghost", "X").await.unwrap_err();
        assert!(matches!(err, AliasError::DeveloperNotFound { .. }));
    }

    // ── delete_developer_if_empty ─────────────────────────────────────────────

    #[tokio::test]
    async fn delete_empty_developer_returns_true() {
        let pool = test_pool().await;
        let dev = create_developer(&pool, "Empty Dev").await.unwrap();

        let deleted = delete_developer_if_empty(&pool, &dev.id).await.unwrap();
        assert!(deleted);

        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM developers WHERE id=?)")
            .bind(&dev.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(!exists);
    }

    #[tokio::test]
    async fn delete_developer_with_aliases_returns_false() {
        let pool = test_pool().await;
        let (dev_id, _) = seed(&pool, "Alice", "alice@example.com").await;

        let deleted = delete_developer_if_empty(&pool, &dev_id).await.unwrap();
        assert!(!deleted);
    }

    #[tokio::test]
    async fn delete_nonexistent_developer_fails() {
        let pool = test_pool().await;
        let err = delete_developer_if_empty(&pool, "ghost").await.unwrap_err();
        assert!(matches!(err, AliasError::DeveloperNotFound { .. }));
    }
}
