use chrono::{Duration, NaiveDate};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::commands::{insights, stats};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct WeeklyRecap {
    pub week_start: String,
    pub week_end: String,
    pub scope_label: String,
    pub commits: i64,
    pub insertions: i64,
    pub deletions: i64,
    pub active_days: i64,
    pub top_developer_name: Option<String>,
    pub top_developer_commits: i64,
    pub top_file_path: Option<String>,
    pub top_file_commits: i64,
    pub top_insight_title: Option<String>,
    pub top_insight_severity: Option<String>,
    pub markdown: String,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum RecapError {
    #[error("week_start must be YYYY-MM-DD")]
    InvalidWeekStart,
    #[error("select a repository or workspace")]
    MissingScope,
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("insight error: {0}")]
    Insight(#[from] insights::InsightError),
}

#[derive(Debug, sqlx::FromRow)]
struct TopFileRow {
    file_path: String,
    commit_count: i64,
}

#[tauri::command]
pub async fn get_weekly_recap(
    state: tauri::State<'_, AppState>,
    repo_id: Option<String>,
    workspace_id: Option<String>,
    week_start: String,
) -> Result<WeeklyRecap, String> {
    inner_get_weekly_recap(
        &state.db,
        repo_id.as_deref(),
        workspace_id.as_deref(),
        &week_start,
    )
    .await
    .map_err(|error| error.to_string())
}

pub(crate) async fn inner_get_weekly_recap(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    week_start: &str,
) -> Result<WeeklyRecap, RecapError> {
    let week_start_date = parse_week_start(week_start)?;
    if repo_id.is_none() && workspace_id.is_none() {
        return Err(RecapError::MissingScope);
    }

    let week_end_date = week_start_date + Duration::days(6);
    let from_date = format_date(week_start_date);
    let to_date = format_date(week_end_date);
    let scoped_workspace_id = if repo_id.is_some() {
        None
    } else {
        workspace_id
    };

    let activity = stats::inner_get_activity_timeline(
        pool,
        repo_id,
        scoped_workspace_id,
        Some(&from_date),
        Some(&to_date),
    )
    .await?;
    let developers = stats::inner_get_developer_global_stats(
        pool,
        repo_id,
        scoped_workspace_id,
        Some(&from_date),
        Some(&to_date),
    )
    .await?;
    let top_file =
        top_file_for_scope(pool, repo_id, scoped_workspace_id, &from_date, &to_date).await?;
    let top_insight = insights::inner_get_insights(
        pool,
        repo_id,
        scoped_workspace_id,
        Some(&from_date),
        Some(&to_date),
    )
    .await?
    .into_iter()
    .next();

    let commits = activity.iter().map(|row| row.commits).sum();
    let insertions = activity.iter().map(|row| row.insertions).sum();
    let deletions = activity.iter().map(|row| row.deletions).sum();
    let active_days = activity.iter().filter(|row| row.commits > 0).count() as i64;
    let top_developer = developers.first();
    let top_developer_name = top_developer.map(|developer| developer.developer_name.clone());
    let top_developer_commits = top_developer.map_or(0, |developer| developer.total_commits);
    let top_file_path = top_file.as_ref().map(|file| file.file_path.clone());
    let top_file_commits = top_file.as_ref().map_or(0, |file| file.commit_count);
    let top_insight_title = top_insight.as_ref().map(|insight| insight.title.clone());
    let top_insight_severity = top_insight.as_ref().map(|insight| insight.severity.clone());
    let scope_label = if repo_id.is_some() {
        "Repository".to_string()
    } else {
        "Workspace".to_string()
    };

    let markdown = build_markdown(WeeklyRecapDraft {
        week_start: &from_date,
        week_end: &to_date,
        scope_label: &scope_label,
        commits,
        insertions,
        deletions,
        active_days,
        top_developer_name: top_developer_name.as_deref(),
        top_developer_commits,
        top_file_path: top_file_path.as_deref(),
        top_file_commits,
        top_insight_title: top_insight_title.as_deref(),
        top_insight_severity: top_insight_severity.as_deref(),
    });

    Ok(WeeklyRecap {
        week_start: from_date,
        week_end: to_date,
        scope_label,
        commits,
        insertions,
        deletions,
        active_days,
        top_developer_name,
        top_developer_commits,
        top_file_path,
        top_file_commits,
        top_insight_title,
        top_insight_severity,
        markdown,
    })
}

async fn top_file_for_scope(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    from_date: &str,
    to_date: &str,
) -> Result<Option<TopFileRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT f.current_path AS file_path,
                COUNT(DISTINCT cfc.commit_id) AS commit_count
         FROM commit_file_changes cfc
         JOIN commits c ON c.id = cfc.commit_id
         JOIN files f ON f.id = cfc.file_id
         JOIN repos r ON r.id = c.repo_id
         WHERE (? IS NULL OR c.repo_id = ?)
           AND (? IS NULL OR r.workspace_id = ?)
           AND date(c.committed_at) >= ?
           AND date(c.committed_at) <= ?
         GROUP BY f.id, f.current_path
         ORDER BY commit_count DESC,
                  SUM(cfc.insertions + cfc.deletions) DESC,
                  f.current_path ASC
         LIMIT 1",
    )
    .bind(repo_id)
    .bind(repo_id)
    .bind(workspace_id)
    .bind(workspace_id)
    .bind(from_date)
    .bind(to_date)
    .fetch_optional(pool)
    .await
}

struct WeeklyRecapDraft<'a> {
    week_start: &'a str,
    week_end: &'a str,
    scope_label: &'a str,
    commits: i64,
    insertions: i64,
    deletions: i64,
    active_days: i64,
    top_developer_name: Option<&'a str>,
    top_developer_commits: i64,
    top_file_path: Option<&'a str>,
    top_file_commits: i64,
    top_insight_title: Option<&'a str>,
    top_insight_severity: Option<&'a str>,
}

fn build_markdown(draft: WeeklyRecapDraft<'_>) -> String {
    let top_developer = draft
        .top_developer_name
        .map(|name| format!("{name} ({} commits)", draft.top_developer_commits))
        .unwrap_or_else(|| "No activity".to_string());
    let top_file = draft
        .top_file_path
        .map(|path| format!("{path} ({} commits)", draft.top_file_commits))
        .unwrap_or_else(|| "No files touched".to_string());
    let top_insight = match (draft.top_insight_title, draft.top_insight_severity) {
        (Some(title), Some(severity)) => format!("{title} ({severity})"),
        (Some(title), None) => title.to_string(),
        _ => "No insight signals".to_string(),
    };

    format!(
        "# GitPulse Weekly Recap\n\n\
         Week: {} to {}\n\
         Scope: {}\n\n\
         ## Activity\n\
         - Commits: {}\n\
         - Insertions: {}\n\
         - Deletions: {}\n\
         - Active days: {}\n\n\
         ## Standouts\n\
         - Top developer: {}\n\
         - Top file: {}\n\
         - Top insight: {}\n",
        draft.week_start,
        draft.week_end,
        draft.scope_label,
        draft.commits,
        draft.insertions,
        draft.deletions,
        draft.active_days,
        top_developer,
        top_file,
        top_insight
    )
}

fn parse_week_start(week_start: &str) -> Result<NaiveDate, RecapError> {
    if week_start.len() != 10 {
        return Err(RecapError::InvalidWeekStart);
    }

    NaiveDate::parse_from_str(week_start, "%Y-%m-%d").map_err(|_| RecapError::InvalidWeekStart)
}

fn format_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
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
    const D9: i64 = 1704758400; // 2024-01-09

    #[tokio::test(flavor = "multi_thread")]
    async fn weekly_recap_uses_inclusive_week_bounds_and_markdown() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());

        commit_at(
            &repo,
            "hot start",
            "Alice",
            "a@example.com",
            &[("src/hot.rs", "1")],
            D1,
        );
        commit_at(
            &repo,
            "hot followup",
            "Alice",
            "a@example.com",
            &[("src/hot.rs", "2")],
            D2,
        );
        commit_at(
            &repo,
            "outside week",
            "Bob",
            "b@example.com",
            &[("src/cold.rs", "1")],
            D9,
        );

        let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;
        crate::git::scan_repo(&pool, &repo_id, tmp.path(), "main")
            .await
            .unwrap();
        recalculate_all(&pool).await.unwrap();

        let recap = inner_get_weekly_recap(&pool, Some(&repo_id), None, "2024-01-01")
            .await
            .unwrap();

        assert_eq!(recap.week_start, "2024-01-01");
        assert_eq!(recap.week_end, "2024-01-07");
        assert_eq!(recap.commits, 2);
        assert_eq!(recap.active_days, 2);
        assert_eq!(recap.top_developer_name.as_deref(), Some("Alice"));
        assert_eq!(recap.top_developer_commits, 2);
        assert_eq!(recap.top_file_path.as_deref(), Some("src/hot.rs"));
        assert_eq!(recap.top_file_commits, 2);
        assert!(recap.markdown.contains("# GitPulse Weekly Recap"));
        assert!(recap.markdown.contains("2024-01-01 to 2024-01-07"));
        assert!(recap.markdown.contains("Alice"));
        assert!(recap.markdown.contains("src/hot.rs"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn weekly_recap_rejects_invalid_week_start() {
        let pool = test_pool().await;

        let error = inner_get_weekly_recap(&pool, Some("repo1"), None, "not-a-date")
            .await
            .unwrap_err()
            .to_string();

        assert!(error.contains("week_start must be YYYY-MM-DD"));
    }
}
