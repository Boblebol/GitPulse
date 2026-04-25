use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
pub struct DirtyAggregateScope {
    pub repo_id: String,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DirtyAggregateScopeRef {
    pub repo_id: String,
    pub date: String,
}

impl From<&DirtyAggregateScope> for DirtyAggregateScopeRef {
    fn from(scope: &DirtyAggregateScope) -> Self {
        Self {
            repo_id: scope.repo_id.clone(),
            date: scope.date.clone(),
        }
    }
}

pub async fn mark_dirty_scope(
    pool: &SqlitePool,
    repo_id: &str,
    date: &str,
) -> Result<DirtyAggregateScope, sqlx::Error> {
    let now = Utc::now().to_rfc3339();

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
    .execute(pool)
    .await?;

    sqlx::query_as(
        "SELECT repo_id, date, created_at, updated_at
         FROM dirty_aggregate_scopes
         WHERE repo_id = ? AND date = ?",
    )
    .bind(repo_id)
    .bind(date)
    .fetch_one(pool)
    .await
}

pub async fn mark_dirty_scopes(
    pool: &SqlitePool,
    repo_id: &str,
    dates: &[&str],
) -> Result<(), sqlx::Error> {
    for date in dates {
        mark_dirty_scope(pool, repo_id, date).await?;
    }

    Ok(())
}

pub async fn list_dirty_scopes(pool: &SqlitePool) -> Result<Vec<DirtyAggregateScope>, sqlx::Error> {
    sqlx::query_as(
        "SELECT repo_id, date, created_at, updated_at
         FROM dirty_aggregate_scopes
         ORDER BY repo_id ASC, date ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn clear_dirty_scopes(
    pool: &SqlitePool,
    scopes: &[DirtyAggregateScopeRef],
) -> Result<(), sqlx::Error> {
    for scope in scopes {
        sqlx::query(
            "DELETE FROM dirty_aggregate_scopes
             WHERE repo_id = ? AND date = ?",
        )
        .bind(&scope.repo_id)
        .bind(&scope.date)
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::test_utils::seed_workspace_and_repo;
    use tempfile::TempDir;

    #[tokio::test]
    async fn mark_dirty_scope_inserts_and_updates_one_scope_per_repo_date() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;

        mark_dirty_scope(&pool, &repo_id, "2024-03-14")
            .await
            .unwrap();
        let first = list_dirty_scopes(&pool).await.unwrap();

        mark_dirty_scope(&pool, &repo_id, "2024-03-14")
            .await
            .unwrap();
        let second = list_dirty_scopes(&pool).await.unwrap();

        assert_eq!(second.len(), 1);
        assert_eq!(second[0].repo_id, repo_id);
        assert_eq!(second[0].date, "2024-03-14");
        assert!(!second[0].created_at.is_empty());
        assert!(!second[0].updated_at.is_empty());
        assert_eq!(second[0].created_at, first[0].created_at);
    }

    #[tokio::test]
    async fn mark_dirty_scopes_lists_in_repo_date_order_and_deduplicates_dates() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;

        mark_dirty_scopes(&pool, &repo_id, &["2024-03-15", "2024-03-14", "2024-03-15"])
            .await
            .unwrap();

        let scopes = list_dirty_scopes(&pool).await.unwrap();

        assert_eq!(
            scopes
                .iter()
                .map(|scope| scope.date.as_str())
                .collect::<Vec<_>>(),
            ["2024-03-14", "2024-03-15"]
        );
    }

    #[tokio::test]
    async fn clear_dirty_scopes_deletes_only_requested_scopes() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;

        mark_dirty_scopes(&pool, &repo_id, &["2024-03-14", "2024-03-15"])
            .await
            .unwrap();

        clear_dirty_scopes(
            &pool,
            &[DirtyAggregateScopeRef {
                repo_id: repo_id.clone(),
                date: "2024-03-14".to_string(),
            }],
        )
        .await
        .unwrap();

        let scopes = list_dirty_scopes(&pool).await.unwrap();

        assert_eq!(scopes.len(), 1);
        assert_eq!(scopes[0].date, "2024-03-15");
    }
}
