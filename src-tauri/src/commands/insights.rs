use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, sqlx::FromRow)]
pub struct InsightRow {
    pub insight_key: String,
    pub category: String,
    pub severity: String,
    pub title: String,
    pub summary: String,
    pub entity_label: String,
    pub metric_value: f64,
    pub action_label: String,
    pub route: String,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum InsightError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, sqlx::FromRow)]
struct FileSignal {
    file_path: String,
    commit_count: i64,
    unique_authors: i64,
    churn_score: f64,
    co_touch_score: f64,
}

#[derive(Debug, sqlx::FromRow)]
struct CommitSignal {
    sha: String,
    message: String,
    files_changed: i64,
    insertions: i64,
    deletions: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct ActivitySignal {
    commits: i64,
    insertions: i64,
    deletions: i64,
    active_days: i64,
}

#[tauri::command]
pub async fn get_insights(
    state: tauri::State<'_, AppState>,
    repo_id: Option<String>,
    workspace_id: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<Vec<InsightRow>, String> {
    inner_get_insights(
        &state.db,
        repo_id.as_deref(),
        workspace_id.as_deref(),
        from_date.as_deref(),
        to_date.as_deref(),
    )
    .await
    .map_err(|error| error.to_string())
}

pub(crate) async fn inner_get_insights(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> Result<Vec<InsightRow>, InsightError> {
    if repo_id.is_none() && workspace_id.is_none() {
        return Ok(Vec::new());
    }

    let effective_workspace_id = if repo_id.is_some() {
        None
    } else {
        workspace_id
    };
    let mut insights = Vec::new();

    if let Some(file) =
        top_file_signal(pool, repo_id, effective_workspace_id, from_date, to_date).await?
    {
        insights.push(InsightRow {
            insight_key: "top_hotspot".into(),
            category: "hotspot".into(),
            severity: severity_from_score(file.churn_score + file.co_touch_score),
            title: "Highest activity file".into(),
            summary: format!(
                "{} has {} commits, {:.1} churn and {:.1} co-touch.",
                file.file_path, file.commit_count, file.churn_score, file.co_touch_score
            ),
            entity_label: file.file_path,
            metric_value: file.churn_score + file.co_touch_score,
            action_label: "Review file health".into(),
            route: "/health".into(),
        });
    }

    if let Some(file) =
        top_silo_signal(pool, repo_id, effective_workspace_id, from_date, to_date).await?
    {
        insights.push(InsightRow {
            insight_key: "knowledge_silo".into(),
            category: "knowledge_silo".into(),
            severity: if file.commit_count >= 3 {
                "high"
            } else {
                "medium"
            }
            .into(),
            title: "Knowledge silo risk".into(),
            summary: format!(
                "{} has activity from only {} author(s) across {} commits.",
                file.file_path, file.unique_authors, file.commit_count
            ),
            entity_label: file.file_path,
            metric_value: file.commit_count as f64,
            action_label: "Spread ownership".into(),
            route: "/health".into(),
        });
    }

    if let Some(commit) =
        top_review_risk(pool, repo_id, effective_workspace_id, from_date, to_date).await?
    {
        let churn = commit.insertions + commit.deletions;
        insights.push(InsightRow {
            insight_key: "review_risk".into(),
            category: "review_risk".into(),
            severity: if commit.files_changed >= 5 || churn >= 500 {
                "high"
            } else {
                "medium"
            }
            .into(),
            title: "Commit worth reviewing".into(),
            summary: format!(
                "{} touched {} files with +{} / -{}.",
                short_commit_label(&commit),
                commit.files_changed,
                commit.insertions,
                commit.deletions
            ),
            entity_label: short_commit_label(&commit),
            metric_value: (commit.files_changed * 25 + churn) as f64,
            action_label: "Inspect broad change".into(),
            route: "/health".into(),
        });
    }

    if let Some(file) =
        top_coupling_signal(pool, repo_id, effective_workspace_id, from_date, to_date).await?
    {
        insights.push(InsightRow {
            insight_key: "coupling".into(),
            category: "coupling".into(),
            severity: severity_from_score(file.co_touch_score),
            title: "Coupling signal".into(),
            summary: format!(
                "{} has a {:.1} co-touch score, so it often changes with other files.",
                file.file_path, file.co_touch_score
            ),
            entity_label: file.file_path,
            metric_value: file.co_touch_score,
            action_label: "Check coupling graph".into(),
            route: "/health".into(),
        });
    }

    if let Some(activity) =
        activity_signal(pool, repo_id, effective_workspace_id, from_date, to_date).await?
    {
        if activity.commits > 0 {
            insights.push(InsightRow {
                insight_key: "activity_summary".into(),
                category: "activity".into(),
                severity: if activity.commits >= 20 {
                    "medium"
                } else {
                    "info"
                }
                .into(),
                title: "Scoped activity summary".into(),
                summary: format!(
                    "{} commits across {} active day(s), with +{} / -{}.",
                    activity.commits, activity.active_days, activity.insertions, activity.deletions
                ),
                entity_label: "Selected scope".into(),
                metric_value: activity.commits as f64,
                action_label: "Open dashboard".into(),
                route: "/".into(),
            });
        }
    }

    Ok(insights)
}

async fn top_file_signal(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> Result<Option<FileSignal>, sqlx::Error> {
    sqlx::query_as(
        "WITH file_rows AS (
             SELECT f.current_path AS file_path,
                    SUM(sdf.commits) AS commit_count,
                    COALESCE(sfg.unique_authors, 0) AS unique_authors,
                    SUM(sdf.churn_score) AS churn_score,
                    COALESCE(sfg.co_touch_score, 0) AS co_touch_score
             FROM stats_daily_file sdf
             JOIN files f ON f.id = sdf.file_id
             JOIN repos r ON r.id = f.repo_id
             LEFT JOIN stats_file_global sfg ON sfg.file_id = f.id
             WHERE (? IS NULL OR r.id = ?)
               AND (? IS NULL OR r.workspace_id = ?)
               AND (? IS NULL OR sdf.date >= ?)
               AND (? IS NULL OR sdf.date <= ?)
             GROUP BY f.id, f.current_path, sfg.unique_authors, sfg.co_touch_score
         )
         SELECT file_path, commit_count, unique_authors, churn_score, co_touch_score
         FROM file_rows
         ORDER BY (churn_score + co_touch_score) DESC, commit_count DESC, file_path ASC
         LIMIT 1",
    )
    .bind(repo_id)
    .bind(repo_id)
    .bind(workspace_id)
    .bind(workspace_id)
    .bind(from_date)
    .bind(from_date)
    .bind(to_date)
    .bind(to_date)
    .fetch_optional(pool)
    .await
}

async fn top_silo_signal(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> Result<Option<FileSignal>, sqlx::Error> {
    sqlx::query_as(
        "WITH file_rows AS (
             SELECT f.current_path AS file_path,
                    SUM(sdf.commits) AS commit_count,
                    COALESCE(sfg.unique_authors, 0) AS unique_authors,
                    SUM(sdf.churn_score) AS churn_score,
                    COALESCE(sfg.co_touch_score, 0) AS co_touch_score
             FROM stats_daily_file sdf
             JOIN files f ON f.id = sdf.file_id
             JOIN repos r ON r.id = f.repo_id
             LEFT JOIN stats_file_global sfg ON sfg.file_id = f.id
             WHERE (? IS NULL OR r.id = ?)
               AND (? IS NULL OR r.workspace_id = ?)
               AND (? IS NULL OR sdf.date >= ?)
               AND (? IS NULL OR sdf.date <= ?)
             GROUP BY f.id, f.current_path, sfg.unique_authors, sfg.co_touch_score
         )
         SELECT file_path, commit_count, unique_authors, churn_score, co_touch_score
         FROM file_rows
         WHERE unique_authors <= 1 AND commit_count >= 2
         ORDER BY commit_count DESC, churn_score DESC, file_path ASC
         LIMIT 1",
    )
    .bind(repo_id)
    .bind(repo_id)
    .bind(workspace_id)
    .bind(workspace_id)
    .bind(from_date)
    .bind(from_date)
    .bind(to_date)
    .bind(to_date)
    .fetch_optional(pool)
    .await
}

async fn top_coupling_signal(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> Result<Option<FileSignal>, sqlx::Error> {
    sqlx::query_as(
        "WITH file_rows AS (
             SELECT f.current_path AS file_path,
                    SUM(sdf.commits) AS commit_count,
                    COALESCE(sfg.unique_authors, 0) AS unique_authors,
                    SUM(sdf.churn_score) AS churn_score,
                    COALESCE(sfg.co_touch_score, 0) AS co_touch_score
             FROM stats_daily_file sdf
             JOIN files f ON f.id = sdf.file_id
             JOIN repos r ON r.id = f.repo_id
             LEFT JOIN stats_file_global sfg ON sfg.file_id = f.id
             WHERE (? IS NULL OR r.id = ?)
               AND (? IS NULL OR r.workspace_id = ?)
               AND (? IS NULL OR sdf.date >= ?)
               AND (? IS NULL OR sdf.date <= ?)
             GROUP BY f.id, f.current_path, sfg.unique_authors, sfg.co_touch_score
         )
         SELECT file_path, commit_count, unique_authors, churn_score, co_touch_score
         FROM file_rows
         WHERE co_touch_score > 0
         ORDER BY co_touch_score DESC, commit_count DESC, file_path ASC
         LIMIT 1",
    )
    .bind(repo_id)
    .bind(repo_id)
    .bind(workspace_id)
    .bind(workspace_id)
    .bind(from_date)
    .bind(from_date)
    .bind(to_date)
    .bind(to_date)
    .fetch_optional(pool)
    .await
}

async fn top_review_risk(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> Result<Option<CommitSignal>, sqlx::Error> {
    sqlx::query_as(
        "SELECT c.sha,
                c.message,
                c.files_changed,
                c.insertions,
                c.deletions
         FROM commits c
         JOIN repos r ON r.id = c.repo_id
         WHERE (? IS NULL OR r.id = ?)
           AND (? IS NULL OR r.workspace_id = ?)
           AND (? IS NULL OR date(c.committed_at) >= ?)
           AND (? IS NULL OR date(c.committed_at) <= ?)
         ORDER BY (c.files_changed * 25 + c.insertions + c.deletions) DESC,
                  c.committed_at DESC,
                  c.sha ASC
         LIMIT 1",
    )
    .bind(repo_id)
    .bind(repo_id)
    .bind(workspace_id)
    .bind(workspace_id)
    .bind(from_date)
    .bind(from_date)
    .bind(to_date)
    .bind(to_date)
    .fetch_optional(pool)
    .await
}

async fn activity_signal(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> Result<Option<ActivitySignal>, sqlx::Error> {
    sqlx::query_as(
        "SELECT COALESCE(SUM(sdd.commits), 0) AS commits,
                COALESCE(SUM(sdd.insertions), 0) AS insertions,
                COALESCE(SUM(sdd.deletions), 0) AS deletions,
                COUNT(DISTINCT sdd.date) AS active_days
         FROM stats_daily_developer sdd
         JOIN repos r ON r.id = sdd.repo_id
         WHERE (? IS NULL OR r.id = ?)
           AND (? IS NULL OR r.workspace_id = ?)
           AND (? IS NULL OR sdd.date >= ?)
           AND (? IS NULL OR sdd.date <= ?)",
    )
    .bind(repo_id)
    .bind(repo_id)
    .bind(workspace_id)
    .bind(workspace_id)
    .bind(from_date)
    .bind(from_date)
    .bind(to_date)
    .bind(to_date)
    .fetch_optional(pool)
    .await
}

fn severity_from_score(score: f64) -> String {
    if score >= 75.0 {
        "high".into()
    } else if score >= 25.0 {
        "medium".into()
    } else {
        "info".into()
    }
}

fn short_commit_label(commit: &CommitSignal) -> String {
    if commit.message.trim().is_empty() {
        commit.sha.chars().take(8).collect()
    } else {
        commit.message.clone()
    }
}

#[cfg(test)]
mod tests {
    use crate::aggregation::recalculate_all;
    use crate::db::test_pool;
    use crate::test_utils::{commit_at, init_repo, seed_workspace_and_repo};
    use tempfile::TempDir;

    use super::*;

    const D1: i64 = 1704067200; // 2024-01-01
    const D2: i64 = 1704153600; // 2024-01-02
    const D3: i64 = 1704240000; // 2024-01-03

    #[tokio::test(flavor = "multi_thread")]
    async fn insights_return_actionable_repo_signals() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());

        commit_at(
            &repo,
            "wide risky change",
            "Alice",
            "a@x.com",
            &[
                ("src/hot.rs", "1"),
                ("src/peer.rs", "1"),
                ("tests/hot_test.rs", "1"),
            ],
            D1,
        );
        commit_at(
            &repo,
            "focused hot change",
            "Alice",
            "a@x.com",
            &[("src/hot.rs", "2")],
            D2,
        );
        commit_at(
            &repo,
            "docs",
            "Bob",
            "b@x.com",
            &[("docs/readme.md", "1")],
            D3,
        );

        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;
        crate::git::scan_repo(&pool, &repo_id, tmp.path(), "main")
            .await
            .unwrap();
        recalculate_all(&pool).await.unwrap();

        let rows = inner_get_insights(&pool, Some(&repo_id), None, None, None)
            .await
            .unwrap();
        let categories = rows
            .iter()
            .map(|row| row.category.as_str())
            .collect::<Vec<_>>();

        assert!(categories.contains(&"hotspot"));
        assert!(categories.contains(&"knowledge_silo"));
        assert!(categories.contains(&"review_risk"));
        assert!(categories.contains(&"coupling"));
        assert!(categories.contains(&"activity"));
        assert!(rows.iter().all(|row| !row.title.is_empty()));
        assert!(rows.iter().all(|row| !row.summary.is_empty()));
        assert!(rows.iter().all(|row| row.metric_value >= 0.0));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn insights_return_empty_without_scope() {
        let pool = test_pool().await;

        let rows = inner_get_insights(&pool, None, None, None, None)
            .await
            .unwrap();

        assert!(rows.is_empty());
    }
}
