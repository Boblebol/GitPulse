use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct FileHealthRow {
    pub file_id: String,
    pub file_path: String,
    pub hotspot_score: f64,
    pub recent_commits: i64,
    pub churn_score: f64,
    pub co_touch_score: f64,
    pub unique_authors: i64,
    pub primary_owner_id: Option<String>,
    pub primary_owner_name: Option<String>,
    pub primary_owner_share: f64,
    pub active_maintainers: i64,
    pub bus_factor: i64,
    pub silo_risk: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct DirectoryHealthRow {
    pub directory_path: String,
    pub directory_health_score: f64,
    pub files_touched: i64,
    pub commit_count: i64,
    pub unique_authors: i64,
    pub hotspot_file_count: i64,
    pub silo_file_count: i64,
    pub churn_score: f64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct DeveloperFocusRow {
    pub developer_id: String,
    pub developer_name: String,
    pub commits: i64,
    pub active_days: i64,
    pub files_touched: i64,
    pub directories_touched: i64,
    pub context_switching_index: f64,
    pub focus_score: f64,
    pub profile_label: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ReviewRiskCommitRow {
    pub commit_id: String,
    pub sha: String,
    pub message: String,
    pub committed_at: String,
    pub developer_id: String,
    pub developer_name: String,
    pub files_changed: i64,
    pub insertions: i64,
    pub deletions: i64,
    pub directories_touched: i64,
    pub max_file_co_touch_score: f64,
    pub risk_score: f64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ActivitySignalRow {
    pub period_bucket: String,
    pub commits: i64,
    pub insertions: i64,
    pub deletions: i64,
    pub files_changed: i64,
    pub refactor_score: f64,
    pub feature_score: f64,
    pub cleanup_score: f64,
    pub maintenance_score: f64,
    pub dominant_signal: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct FileVolatilityRow {
    pub file_id: String,
    pub file_path: String,
    pub active_days: i64,
    pub active_weeks: i64,
    pub commits: i64,
    pub churn: i64,
    pub unique_authors: i64,
    pub volatility_score: f64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct FileCouplingRow {
    pub source_file_id: String,
    pub source_file_path: String,
    pub target_file_id: String,
    pub target_file_path: String,
    pub co_touch_count: i64,
    pub last_touched_at: Option<String>,
    pub coupling_score: f64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PeriodBounds {
    from_date: Option<String>,
    to_date: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum HealthError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("invalid period: {0}")]
    InvalidPeriod(String),
}

#[tauri::command]
pub async fn get_file_health_stats(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    period_type: String,
    period_key: String,
) -> Result<Vec<FileHealthRow>, String> {
    inner_get_file_health_stats(&state.db, &repo_id, &period_type, &period_key)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_file_health_stats(
    pool: &SqlitePool,
    repo_id: &str,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<FileHealthRow>, HealthError> {
    let bounds = parse_period(period_type, period_key)?;

    sqlx::query_as(
        "WITH file_activity AS (
             SELECT sfg.file_id,
                    sfg.commit_count AS recent_commits,
                    sfg.churn_score AS churn_score
             FROM stats_file_global sfg
             JOIN files f ON f.id = sfg.file_id
             WHERE f.repo_id = ?
               AND ? IS NULL
               AND ? IS NULL
             UNION ALL
             SELECT sdf.file_id,
                    SUM(sdf.commits) AS recent_commits,
                    SUM(sdf.churn_score) AS churn_score
             FROM stats_daily_file sdf
             JOIN files f ON f.id = sdf.file_id
             WHERE f.repo_id = ?
               AND (? IS NOT NULL OR ? IS NOT NULL)
               AND (? IS NULL OR sdf.date >= ?)
               AND (? IS NULL OR sdf.date <= ?)
             GROUP BY sdf.file_id
         ),
         scoped_changes AS (
             SELECT cfc.file_id,
                    cfc.commit_id,
                    a.developer_id,
                    d.name AS developer_name
             FROM commit_file_changes cfc
             JOIN commits c ON c.id = cfc.commit_id
             JOIN aliases a ON a.id = c.author_alias_id
             JOIN developers d ON d.id = a.developer_id
             WHERE c.repo_id = ?
               AND (? IS NULL OR date(c.committed_at) >= ?)
               AND (? IS NULL OR date(c.committed_at) <= ?)
         ),
         commit_sizes AS (
             SELECT commit_id, COUNT(DISTINCT file_id) AS file_count
             FROM scoped_changes
             GROUP BY commit_id
         ),
         co_touch AS (
             SELECT sc.file_id,
                    SUM(cs.file_count - 1) AS co_touch_score
             FROM scoped_changes sc
             JOIN commit_sizes cs ON cs.commit_id = sc.commit_id
             GROUP BY sc.file_id
         ),
         author_counts AS (
             SELECT file_id,
                    developer_id,
                    developer_name,
                    COUNT(DISTINCT commit_id) AS owner_commits
             FROM scoped_changes
             GROUP BY file_id, developer_id, developer_name
         ),
         author_summary AS (
             SELECT file_id,
                    COUNT(*) AS unique_authors,
                    COUNT(*) AS active_maintainers
             FROM author_counts
             GROUP BY file_id
         ),
         ranked_owners AS (
             SELECT file_id,
                    developer_id,
                    developer_name,
                    owner_commits,
                    ROW_NUMBER() OVER (
                        PARTITION BY file_id
                        ORDER BY owner_commits DESC, developer_name ASC, developer_id ASC
                    ) AS owner_rank
             FROM author_counts
         ),
         rows AS (
             SELECT df.file_id,
                    f.current_path AS file_path,
                    df.recent_commits,
                    df.churn_score,
                    COALESCE(ct.co_touch_score, 0) AS co_touch_score,
                    COALESCE(auth.unique_authors, 0) AS unique_authors,
                    ro.developer_id AS primary_owner_id,
                    ro.developer_name AS primary_owner_name,
                    COALESCE(
                        CAST(ro.owner_commits AS REAL) / NULLIF(df.recent_commits, 0),
                        0.0
                    ) AS primary_owner_share,
                    COALESCE(auth.active_maintainers, 0) AS active_maintainers
             FROM file_activity df
             JOIN files f ON f.id = df.file_id
             LEFT JOIN co_touch ct ON ct.file_id = df.file_id
             LEFT JOIN author_summary auth ON auth.file_id = df.file_id
             LEFT JOIN ranked_owners ro ON ro.file_id = df.file_id AND ro.owner_rank = 1
         ),
         maxes AS (
             SELECT MAX(recent_commits) AS max_recent_commits,
                    MAX(churn_score) AS max_churn_score,
                    MAX(co_touch_score) AS max_co_touch_score,
                    MAX(unique_authors) AS max_unique_authors
             FROM rows
         )
         SELECT rows.file_id,
                rows.file_path,
                ROUND(
                    (
                        CASE WHEN maxes.max_recent_commits > 0
                             THEN CAST(rows.recent_commits AS REAL) / maxes.max_recent_commits * 100.0
                             ELSE 0.0 END
                    ) * 0.30
                    + (
                        CASE WHEN maxes.max_churn_score > 0
                             THEN rows.churn_score / maxes.max_churn_score * 100.0
                             ELSE 0.0 END
                    ) * 0.25
                    + (
                        CASE WHEN maxes.max_co_touch_score > 0
                             THEN CAST(rows.co_touch_score AS REAL) / maxes.max_co_touch_score * 100.0
                             ELSE 0.0 END
                    ) * 0.25
                    + (
                        CASE WHEN maxes.max_unique_authors > 0
                             THEN CAST(rows.unique_authors AS REAL) / maxes.max_unique_authors * 100.0
                             ELSE 0.0 END
                    ) * 0.20,
                    2
                ) AS hotspot_score,
                rows.recent_commits,
                rows.churn_score,
                CAST(rows.co_touch_score AS REAL) AS co_touch_score,
                rows.unique_authors,
                rows.primary_owner_id,
                rows.primary_owner_name,
                ROUND(rows.primary_owner_share, 4) AS primary_owner_share,
                rows.active_maintainers,
                rows.active_maintainers AS bus_factor,
                CASE
                    WHEN rows.recent_commits > 0
                     AND rows.primary_owner_share >= 0.80
                     AND rows.active_maintainers <= 1
                    THEN 1 ELSE 0
                END AS silo_risk
         FROM rows
         CROSS JOIN maxes
         ORDER BY hotspot_score DESC, rows.recent_commits DESC, rows.file_path ASC",
    )
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .fetch_all(pool)
    .await
    .map_err(HealthError::Db)
}

#[tauri::command]
pub async fn get_directory_health_stats(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    period_type: String,
    period_key: String,
) -> Result<Vec<DirectoryHealthRow>, String> {
    inner_get_directory_health_stats(&state.db, &repo_id, &period_type, &period_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_developer_focus_stats(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    period_type: String,
    period_key: String,
) -> Result<Vec<DeveloperFocusRow>, String> {
    inner_get_developer_focus_stats(&state.db, &repo_id, &period_type, &period_key)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_developer_focus_stats(
    pool: &SqlitePool,
    repo_id: &str,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<DeveloperFocusRow>, HealthError> {
    let bounds = parse_period(period_type, period_key)?;

    sqlx::query_as(
        "WITH scoped_changes AS (
             SELECT c.id AS commit_id,
                    date(c.committed_at) AS commit_date,
                    a.developer_id,
                    d.name AS developer_name,
                    f.id AS file_id,
                    CASE
                        WHEN instr(f.current_path, '/') > 0
                        THEN substr(f.current_path, 1, instr(f.current_path, '/') - 1)
                        ELSE 'root'
                    END AS directory_path
             FROM commits c
             JOIN aliases a ON a.id = c.author_alias_id
             JOIN developers d ON d.id = a.developer_id
             JOIN commit_file_changes cfc ON cfc.commit_id = c.id
             JOIN files f ON f.id = cfc.file_id
             WHERE c.repo_id = ?
               AND (? IS NULL OR date(c.committed_at) >= ?)
               AND (? IS NULL OR date(c.committed_at) <= ?)
         ),
         rows AS (
             SELECT developer_id,
                    developer_name,
                    COUNT(DISTINCT commit_id) AS commits,
                    COUNT(DISTINCT commit_date) AS active_days,
                    COUNT(DISTINCT file_id) AS files_touched,
                    COUNT(DISTINCT directory_path) AS directories_touched
             FROM scoped_changes
             GROUP BY developer_id, developer_name
         ),
         maxes AS (
             SELECT MAX(files_touched) AS max_files,
                    MAX(directories_touched) AS max_dirs,
                    MAX(active_days) AS max_days
             FROM rows
         )
         SELECT rows.developer_id,
                rows.developer_name,
                rows.commits,
                rows.active_days,
                rows.files_touched,
                rows.directories_touched,
                ROUND(MIN(
                    (
                        CASE WHEN maxes.max_files > 0
                             THEN CAST(rows.files_touched AS REAL) / maxes.max_files * 45.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_dirs > 0
                             THEN CAST(rows.directories_touched AS REAL) / maxes.max_dirs * 40.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_days > 0
                             THEN CAST(rows.active_days AS REAL) / maxes.max_days * 15.0
                             ELSE 0.0 END
                    ),
                    100.0
                ), 2) AS context_switching_index,
                ROUND(MAX(
                    100.0 - (
                        (
                            CASE WHEN maxes.max_files > 0
                                 THEN CAST(rows.files_touched AS REAL) / maxes.max_files * 45.0
                                 ELSE 0.0 END
                        ) + (
                            CASE WHEN maxes.max_dirs > 0
                                 THEN CAST(rows.directories_touched AS REAL) / maxes.max_dirs * 40.0
                                 ELSE 0.0 END
                        ) + (
                            CASE WHEN maxes.max_days > 0
                                 THEN CAST(rows.active_days AS REAL) / maxes.max_days * 15.0
                                 ELSE 0.0 END
                        )
                    ),
                    0.0
                ), 2) AS focus_score,
                CASE
                    WHEN rows.directories_touched >= 4 THEN 'Cross-area contributor'
                    WHEN rows.directories_touched <= 1 AND rows.files_touched <= 5 THEN 'Focused specialist'
                    ELSE 'Balanced contributor'
                END AS profile_label
         FROM rows
         CROSS JOIN maxes
         ORDER BY context_switching_index DESC, rows.commits DESC, rows.developer_name ASC",
    )
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .fetch_all(pool)
    .await
    .map_err(HealthError::Db)
}

#[tauri::command]
pub async fn get_review_risk_commits(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    period_type: String,
    period_key: String,
) -> Result<Vec<ReviewRiskCommitRow>, String> {
    inner_get_review_risk_commits(&state.db, &repo_id, &period_type, &period_key)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_review_risk_commits(
    pool: &SqlitePool,
    repo_id: &str,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<ReviewRiskCommitRow>, HealthError> {
    let bounds = parse_period(period_type, period_key)?;

    sqlx::query_as(
        "WITH commit_dirs AS (
             SELECT c.id AS commit_id,
                    COUNT(DISTINCT CASE
                        WHEN instr(f.current_path, '/') > 0
                        THEN substr(f.current_path, 1, instr(f.current_path, '/') - 1)
                        ELSE 'root'
                    END) AS directories_touched,
                    COALESCE(MAX(sfg.co_touch_score), 0.0) AS max_file_co_touch_score
             FROM commits c
             JOIN commit_file_changes cfc ON cfc.commit_id = c.id
             JOIN files f ON f.id = cfc.file_id
             LEFT JOIN stats_file_global sfg ON sfg.file_id = f.id
             WHERE c.repo_id = ?
               AND (? IS NULL OR date(c.committed_at) >= ?)
               AND (? IS NULL OR date(c.committed_at) <= ?)
             GROUP BY c.id
         ),
         rows AS (
             SELECT c.id AS commit_id,
                    c.sha,
                    c.message,
                    c.committed_at,
                    a.developer_id,
                    d.name AS developer_name,
                    c.files_changed,
                    c.insertions,
                    c.deletions,
                    cd.directories_touched,
                    cd.max_file_co_touch_score,
                    c.insertions + c.deletions AS churn
             FROM commits c
             JOIN aliases a ON a.id = c.author_alias_id
             JOIN developers d ON d.id = a.developer_id
             JOIN commit_dirs cd ON cd.commit_id = c.id
             WHERE c.repo_id = ?
               AND (? IS NULL OR date(c.committed_at) >= ?)
               AND (? IS NULL OR date(c.committed_at) <= ?)
         ),
         maxes AS (
             SELECT MAX(files_changed) AS max_files,
                    MAX(churn) AS max_churn,
                    MAX(deletions) AS max_deletions,
                    MAX(directories_touched) AS max_dirs,
                    MAX(max_file_co_touch_score) AS max_co_touch
             FROM rows
         )
         SELECT rows.commit_id,
                rows.sha,
                rows.message,
                rows.committed_at,
                rows.developer_id,
                rows.developer_name,
                rows.files_changed,
                rows.insertions,
                rows.deletions,
                rows.directories_touched,
                rows.max_file_co_touch_score,
                ROUND(
                    (
                        CASE WHEN maxes.max_files > 0
                             THEN CAST(rows.files_changed AS REAL) / maxes.max_files * 30.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_churn > 0
                             THEN CAST(rows.churn AS REAL) / maxes.max_churn * 25.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_deletions > 0
                             THEN CAST(rows.deletions AS REAL) / maxes.max_deletions * 15.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_dirs > 0
                             THEN CAST(rows.directories_touched AS REAL) / maxes.max_dirs * 15.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_co_touch > 0
                             THEN rows.max_file_co_touch_score / maxes.max_co_touch * 15.0
                             ELSE 0.0 END
                    ),
                    2
                ) AS risk_score
         FROM rows
         CROSS JOIN maxes
         ORDER BY risk_score DESC, rows.committed_at DESC
         LIMIT 50",
    )
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .fetch_all(pool)
    .await
    .map_err(HealthError::Db)
}

#[tauri::command]
pub async fn get_activity_signal_stats(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    period_type: String,
    period_key: String,
) -> Result<Vec<ActivitySignalRow>, String> {
    inner_get_activity_signal_stats(&state.db, &repo_id, &period_type, &period_key)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_activity_signal_stats(
    pool: &SqlitePool,
    repo_id: &str,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<ActivitySignalRow>, HealthError> {
    let bounds = parse_period(period_type, period_key)?;

    sqlx::query_as(
        "WITH rows AS (
             SELECT substr(date(c.committed_at), 1, 7) AS period_bucket,
                    COUNT(*) AS commits,
                    SUM(c.insertions) AS insertions,
                    SUM(c.deletions) AS deletions,
                    SUM(c.files_changed) AS files_changed
             FROM commits c
             WHERE c.repo_id = ?
               AND (? IS NULL OR date(c.committed_at) >= ?)
               AND (? IS NULL OR date(c.committed_at) <= ?)
             GROUP BY period_bucket
         ),
         scored AS (
             SELECT period_bucket,
                    commits,
                    insertions,
                    deletions,
                    files_changed,
                    CAST(insertions + deletions AS REAL) AS churn,
                    CASE
                        WHEN insertions + deletions > 0
                        THEN 100.0 - ABS(CAST(insertions - deletions AS REAL)) / (insertions + deletions) * 100.0
                        ELSE 0.0
                    END AS balance_score,
                    CASE WHEN commits > 0 THEN CAST(files_changed AS REAL) / commits ELSE 0.0 END AS files_per_commit
             FROM rows
         )
         SELECT period_bucket,
                commits,
                insertions,
                deletions,
                files_changed,
                ROUND(MIN(balance_score * 0.6 + files_per_commit * 8.0, 100.0), 2) AS refactor_score,
                ROUND(CASE WHEN churn > 0 THEN CAST(insertions AS REAL) / churn * 100.0 ELSE 0.0 END, 2) AS feature_score,
                ROUND(CASE WHEN churn > 0 THEN CAST(deletions AS REAL) / churn * 100.0 ELSE 0.0 END, 2) AS cleanup_score,
                ROUND(MAX(100.0 - MIN(balance_score * 0.6 + files_per_commit * 8.0, 100.0), 0.0), 2) AS maintenance_score,
                CASE
                    WHEN churn > 0 AND CAST(insertions AS REAL) / churn >= 0.65 THEN 'feature'
                    WHEN churn > 0 AND CAST(deletions AS REAL) / churn >= 0.55 THEN 'cleanup'
                    WHEN balance_score >= 55.0 AND files_per_commit >= 2.0 THEN 'refactor'
                    ELSE 'maintenance'
                END AS dominant_signal
         FROM scored
         ORDER BY period_bucket DESC",
    )
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .fetch_all(pool)
    .await
    .map_err(HealthError::Db)
}

#[tauri::command]
pub async fn get_file_volatility_stats(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    period_type: String,
    period_key: String,
) -> Result<Vec<FileVolatilityRow>, String> {
    inner_get_file_volatility_stats(&state.db, &repo_id, &period_type, &period_key)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_file_volatility_stats(
    pool: &SqlitePool,
    repo_id: &str,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<FileVolatilityRow>, HealthError> {
    let bounds = parse_period(period_type, period_key)?;

    sqlx::query_as(
        "WITH rows AS (
             SELECT f.id AS file_id,
                    f.current_path AS file_path,
                    COUNT(DISTINCT date(c.committed_at)) AS active_days,
                    COUNT(DISTINCT strftime('%Y-%W', date(c.committed_at))) AS active_weeks,
                    COUNT(DISTINCT c.id) AS commits,
                    SUM(cfc.insertions + cfc.deletions) AS churn,
                    COUNT(DISTINCT a.developer_id) AS unique_authors
             FROM commit_file_changes cfc
             JOIN commits c ON c.id = cfc.commit_id
             JOIN files f ON f.id = cfc.file_id
             JOIN aliases a ON a.id = c.author_alias_id
             WHERE f.repo_id = ?
               AND (? IS NULL OR date(c.committed_at) >= ?)
               AND (? IS NULL OR date(c.committed_at) <= ?)
             GROUP BY f.id, f.current_path
         ),
         maxes AS (
             SELECT MAX(active_weeks) AS max_weeks,
                    MAX(commits) AS max_commits,
                    MAX(churn) AS max_churn,
                    MAX(unique_authors) AS max_authors
             FROM rows
         )
         SELECT rows.file_id,
                rows.file_path,
                rows.active_days,
                rows.active_weeks,
                rows.commits,
                rows.churn,
                rows.unique_authors,
                ROUND(
                    (
                        CASE WHEN maxes.max_weeks > 0
                             THEN CAST(rows.active_weeks AS REAL) / maxes.max_weeks * 35.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_commits > 0
                             THEN CAST(rows.commits AS REAL) / maxes.max_commits * 25.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_churn > 0
                             THEN CAST(rows.churn AS REAL) / maxes.max_churn * 25.0
                             ELSE 0.0 END
                    ) + (
                        CASE WHEN maxes.max_authors > 0
                             THEN CAST(rows.unique_authors AS REAL) / maxes.max_authors * 15.0
                             ELSE 0.0 END
                    ),
                    2
                ) AS volatility_score
         FROM rows
         CROSS JOIN maxes
         ORDER BY volatility_score DESC, rows.commits DESC, rows.file_path ASC
         LIMIT 50",
    )
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .fetch_all(pool)
    .await
    .map_err(HealthError::Db)
}

#[tauri::command]
pub async fn get_file_coupling_graph(
    state: tauri::State<'_, AppState>,
    repo_id: String,
    period_type: String,
    period_key: String,
) -> Result<Vec<FileCouplingRow>, String> {
    inner_get_file_coupling_graph(&state.db, &repo_id, &period_type, &period_key)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_file_coupling_graph(
    pool: &SqlitePool,
    repo_id: &str,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<FileCouplingRow>, HealthError> {
    let bounds = parse_period(period_type, period_key)?;

    sqlx::query_as(
        "WITH scoped AS (
             SELECT c.id AS commit_id,
                    c.committed_at,
                    cfc.file_id,
                    f.current_path
             FROM commits c
             JOIN commit_file_changes cfc ON cfc.commit_id = c.id
             JOIN files f ON f.id = cfc.file_id
             WHERE c.repo_id = ?
               AND (? IS NULL OR date(c.committed_at) >= ?)
               AND (? IS NULL OR date(c.committed_at) <= ?)
         ),
         pairs AS (
             SELECT left_side.file_id AS source_file_id,
                    left_side.current_path AS source_file_path,
                    right_side.file_id AS target_file_id,
                    right_side.current_path AS target_file_path,
                    COUNT(*) AS co_touch_count,
                    MAX(left_side.committed_at) AS last_touched_at
             FROM scoped left_side
             JOIN scoped right_side
               ON right_side.commit_id = left_side.commit_id
              AND right_side.file_id > left_side.file_id
             GROUP BY left_side.file_id,
                      left_side.current_path,
                      right_side.file_id,
                      right_side.current_path
         ),
         maxes AS (
             SELECT MAX(co_touch_count) AS max_co_touch_count
             FROM pairs
         )
         SELECT pairs.source_file_id,
                pairs.source_file_path,
                pairs.target_file_id,
                pairs.target_file_path,
                pairs.co_touch_count,
                pairs.last_touched_at,
                ROUND(
                    CASE WHEN maxes.max_co_touch_count > 0
                         THEN CAST(pairs.co_touch_count AS REAL) / maxes.max_co_touch_count * 100.0
                         ELSE 0.0 END,
                    2
                ) AS coupling_score
         FROM pairs
         CROSS JOIN maxes
         ORDER BY coupling_score DESC, co_touch_count DESC, source_file_path ASC, target_file_path ASC
         LIMIT 80",
    )
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .fetch_all(pool)
    .await
    .map_err(HealthError::Db)
}

pub(crate) async fn inner_get_directory_health_stats(
    pool: &SqlitePool,
    repo_id: &str,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<DirectoryHealthRow>, HealthError> {
    let bounds = parse_period(period_type, period_key)?;

    sqlx::query_as(
        "WITH directory_agg AS (
             SELECT sdg.directory_path,
                    sdg.commit_count,
                    sdg.files_touched,
                    sdg.churn_score
             FROM stats_directory_global sdg
             WHERE sdg.repo_id = ?
               AND ? IS NULL
               AND ? IS NULL
             UNION ALL
             SELECT sdd.directory_path,
                    SUM(sdd.commits) AS commit_count,
                    SUM(sdd.files_touched) AS files_touched,
                    CAST(SUM(sdd.insertions) + SUM(sdd.deletions) AS REAL) AS churn_score
             FROM stats_daily_directory sdd
             WHERE sdd.repo_id = ?
               AND (? IS NOT NULL OR ? IS NOT NULL)
               AND (? IS NULL OR sdd.date >= ?)
               AND (? IS NULL OR sdd.date <= ?)
             GROUP BY sdd.directory_path
         ),
         scoped_changes AS (
             SELECT cfc.file_id,
                    cfc.commit_id,
                    f.current_path,
                    a.developer_id,
                    d.name AS developer_name
             FROM commit_file_changes cfc
             JOIN commits c ON c.id = cfc.commit_id
             JOIN files f ON f.id = cfc.file_id
             JOIN aliases a ON a.id = c.author_alias_id
             JOIN developers d ON d.id = a.developer_id
             WHERE c.repo_id = ?
               AND (? IS NULL OR date(c.committed_at) >= ?)
               AND (? IS NULL OR date(c.committed_at) <= ?)
         ),
         directory_authors AS (
             SELECT da.directory_path,
                    COUNT(DISTINCT sc.developer_id) AS unique_authors
             FROM directory_agg da
             JOIN scoped_changes sc
               ON (da.directory_path = '' AND instr(sc.current_path, '/') = 0)
               OR (da.directory_path <> ''
                   AND (sc.current_path = da.directory_path
                        OR sc.current_path LIKE da.directory_path || '/%'))
             GROUP BY da.directory_path
         ),
         file_daily AS (
             SELECT sfg.file_id,
                    sfg.commit_count AS recent_commits,
                    sfg.churn_score AS churn_score
             FROM stats_file_global sfg
             JOIN files f ON f.id = sfg.file_id
             WHERE f.repo_id = ?
               AND ? IS NULL
               AND ? IS NULL
             UNION ALL
             SELECT sdf.file_id,
                    SUM(sdf.commits) AS recent_commits,
                    SUM(sdf.churn_score) AS churn_score
             FROM stats_daily_file sdf
             JOIN files f ON f.id = sdf.file_id
             WHERE f.repo_id = ?
               AND (? IS NOT NULL OR ? IS NOT NULL)
               AND (? IS NULL OR sdf.date >= ?)
               AND (? IS NULL OR sdf.date <= ?)
             GROUP BY sdf.file_id
         ),
         commit_sizes AS (
             SELECT commit_id, COUNT(DISTINCT file_id) AS file_count
             FROM scoped_changes
             GROUP BY commit_id
         ),
         co_touch AS (
             SELECT sc.file_id,
                    SUM(cs.file_count - 1) AS co_touch_score
             FROM scoped_changes sc
             JOIN commit_sizes cs ON cs.commit_id = sc.commit_id
             GROUP BY sc.file_id
         ),
         author_counts AS (
             SELECT file_id,
                    developer_id,
                    developer_name,
                    COUNT(DISTINCT commit_id) AS owner_commits
             FROM scoped_changes
             GROUP BY file_id, developer_id, developer_name
         ),
         ranked_owners AS (
             SELECT file_id,
                    owner_commits,
                    ROW_NUMBER() OVER (
                        PARTITION BY file_id
                        ORDER BY owner_commits DESC, developer_name ASC, developer_id ASC
                    ) AS owner_rank
             FROM author_counts
         ),
         file_rows AS (
             SELECT fd.file_id,
                    f.current_path,
                    fd.recent_commits,
                    fd.churn_score,
                    COALESCE(ct.co_touch_score, 0) AS co_touch_score,
                    COUNT(ac.developer_id) AS unique_authors,
                    COALESCE(
                        CAST(ro.owner_commits AS REAL) / NULLIF(fd.recent_commits, 0),
                        0.0
                    ) AS primary_owner_share
             FROM file_daily fd
             JOIN files f ON f.id = fd.file_id
             LEFT JOIN co_touch ct ON ct.file_id = fd.file_id
             LEFT JOIN author_counts ac ON ac.file_id = fd.file_id
             LEFT JOIN ranked_owners ro ON ro.file_id = fd.file_id AND ro.owner_rank = 1
             GROUP BY fd.file_id,
                      f.current_path,
                      fd.recent_commits,
                      fd.churn_score,
                      ct.co_touch_score,
                      ro.owner_commits
         ),
         file_maxes AS (
             SELECT MAX(recent_commits) AS max_recent_commits,
                    MAX(churn_score) AS max_churn_score,
                    MAX(co_touch_score) AS max_co_touch_score,
                    MAX(unique_authors) AS max_unique_authors
             FROM file_rows
         ),
         file_health AS (
             SELECT fr.file_id,
                    fr.current_path,
                    ROUND(
                        (
                            CASE WHEN fm.max_recent_commits > 0
                                 THEN CAST(fr.recent_commits AS REAL) / fm.max_recent_commits * 100.0
                                 ELSE 0.0 END
                        ) * 0.30
                        + (
                            CASE WHEN fm.max_churn_score > 0
                                 THEN fr.churn_score / fm.max_churn_score * 100.0
                                 ELSE 0.0 END
                        ) * 0.25
                        + (
                            CASE WHEN fm.max_co_touch_score > 0
                                 THEN CAST(fr.co_touch_score AS REAL) / fm.max_co_touch_score * 100.0
                                 ELSE 0.0 END
                        ) * 0.25
                        + (
                            CASE WHEN fm.max_unique_authors > 0
                                 THEN CAST(fr.unique_authors AS REAL) / fm.max_unique_authors * 100.0
                                 ELSE 0.0 END
                        ) * 0.20,
                        2
                    ) AS hotspot_score,
                    CASE
                        WHEN fr.recent_commits > 0
                         AND fr.primary_owner_share >= 0.80
                         AND fr.unique_authors <= 1
                        THEN 1 ELSE 0
                    END AS silo_risk,
                    fr.co_touch_score
             FROM file_rows fr
             CROSS JOIN file_maxes fm
         ),
         directory_files AS (
             SELECT da.directory_path,
                    COUNT(DISTINCT fh.file_id) AS period_file_count,
                    SUM(CASE WHEN fh.hotspot_score >= 70.0 THEN 1 ELSE 0 END) AS hotspot_file_count,
                    SUM(fh.silo_risk) AS silo_file_count,
                    AVG(fh.co_touch_score) AS avg_co_touch_score
             FROM directory_agg da
             LEFT JOIN file_health fh
               ON (da.directory_path = '' AND instr(fh.current_path, '/') = 0)
               OR (da.directory_path <> ''
                   AND (fh.current_path = da.directory_path
                        OR fh.current_path LIKE da.directory_path || '/%'))
             GROUP BY da.directory_path
         ),
         maxes AS (
             SELECT MAX(da.commit_count) AS max_commit_count,
                    MAX(da.churn_score) AS max_churn_score,
                    MAX(df.avg_co_touch_score) AS max_avg_co_touch_score
             FROM directory_agg da
             LEFT JOIN directory_files df ON df.directory_path = da.directory_path
         ),
         rows AS (
             SELECT da.directory_path,
                    da.files_touched,
                    da.commit_count,
                    COALESCE(dir_auth.unique_authors, 0) AS unique_authors,
                    COALESCE(df.hotspot_file_count, 0) AS hotspot_file_count,
                    COALESCE(df.silo_file_count, 0) AS silo_file_count,
                    da.churn_score,
                    COALESCE(df.avg_co_touch_score, 0.0) AS avg_co_touch_score,
                    COALESCE(df.period_file_count, 0) AS period_file_count
             FROM directory_agg da
             LEFT JOIN directory_authors dir_auth ON dir_auth.directory_path = da.directory_path
             LEFT JOIN directory_files df ON df.directory_path = da.directory_path
         )
         SELECT rows.directory_path,
                ROUND(
                    (
                        CASE WHEN rows.period_file_count > 0
                             THEN CAST(rows.hotspot_file_count AS REAL) / rows.period_file_count * 100.0
                             ELSE 0.0 END
                    ) * 0.30
                    + (
                        CASE WHEN maxes.max_commit_count > 0
                             THEN CAST(rows.commit_count AS REAL) / maxes.max_commit_count * 100.0
                             ELSE 0.0 END
                    ) * 0.20
                    + (
                        CASE WHEN rows.period_file_count > 0
                             THEN CAST(rows.silo_file_count AS REAL) / rows.period_file_count * 100.0
                             ELSE 0.0 END
                    ) * 0.25
                    + (
                        CASE WHEN maxes.max_avg_co_touch_score > 0
                             THEN rows.avg_co_touch_score / maxes.max_avg_co_touch_score * 100.0
                             ELSE 0.0 END
                    ) * 0.15
                    + (
                        CASE WHEN maxes.max_churn_score > 0
                             THEN rows.churn_score / maxes.max_churn_score * 100.0
                             ELSE 0.0 END
                    ) * 0.10,
                    2
                ) AS directory_health_score,
                rows.files_touched,
                rows.commit_count,
                rows.unique_authors,
                rows.hotspot_file_count,
                rows.silo_file_count,
                rows.churn_score
         FROM rows
         CROSS JOIN maxes
         ORDER BY directory_health_score DESC, rows.commit_count DESC, rows.directory_path ASC",
    )
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(repo_id)
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.from_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .bind(bounds.to_date.as_deref())
    .fetch_all(pool)
    .await
    .map_err(HealthError::Db)
}

fn parse_period(period_type: &str, period_key: &str) -> Result<PeriodBounds, HealthError> {
    match period_type {
        "all_time" => {
            if period_key == "all" {
                Ok(PeriodBounds {
                    from_date: None,
                    to_date: None,
                })
            } else {
                Err(HealthError::InvalidPeriod(
                    "all_time period key must be 'all'".into(),
                ))
            }
        }
        "month" => parse_month(period_key),
        "quarter" => parse_quarter(period_key),
        "calendar_year" | "season" => parse_year(period_key),
        other => Err(HealthError::InvalidPeriod(format!(
            "unsupported period type '{other}'"
        ))),
    }
}

fn parse_month(period_key: &str) -> Result<PeriodBounds, HealthError> {
    let (year, month) = period_key
        .split_once('-')
        .ok_or_else(|| HealthError::InvalidPeriod("month key must be YYYY-MM".into()))?;
    let year = parse_year_number(year)?;
    let month = parse_month_number(month)?;
    bounded_period(year, month, month)
}

fn parse_quarter(period_key: &str) -> Result<PeriodBounds, HealthError> {
    let (year, quarter) = period_key
        .split_once("-Q")
        .ok_or_else(|| HealthError::InvalidPeriod("quarter key must be YYYY-QN".into()))?;
    let year = parse_year_number(year)?;
    let quarter = quarter
        .parse::<u32>()
        .map_err(|_| HealthError::InvalidPeriod("quarter must be 1-4".into()))?;
    if !(1..=4).contains(&quarter) {
        return Err(HealthError::InvalidPeriod("quarter must be 1-4".into()));
    }
    let start_month = ((quarter - 1) * 3) + 1;
    bounded_period(year, start_month, start_month + 2)
}

fn parse_year(period_key: &str) -> Result<PeriodBounds, HealthError> {
    let year = parse_year_number(period_key)?;
    bounded_period(year, 1, 12)
}

fn bounded_period(
    year: i32,
    start_month: u32,
    end_month: u32,
) -> Result<PeriodBounds, HealthError> {
    Ok(PeriodBounds {
        from_date: Some(format!("{year:04}-{start_month:02}-01")),
        to_date: Some(format!(
            "{year:04}-{end_month:02}-{:02}",
            days_in_month(year, end_month)?
        )),
    })
}

fn parse_year_number(value: &str) -> Result<i32, HealthError> {
    if value.len() != 4 || !value.chars().all(|c| c.is_ascii_digit()) {
        return Err(HealthError::InvalidPeriod("year must be YYYY".into()));
    }
    value
        .parse::<i32>()
        .map_err(|_| HealthError::InvalidPeriod("year must be YYYY".into()))
}

fn parse_month_number(value: &str) -> Result<u32, HealthError> {
    if value.len() != 2 || !value.chars().all(|c| c.is_ascii_digit()) {
        return Err(HealthError::InvalidPeriod("month must be 01-12".into()));
    }
    let month = value
        .parse::<u32>()
        .map_err(|_| HealthError::InvalidPeriod("month must be 01-12".into()))?;
    if !(1..=12).contains(&month) {
        return Err(HealthError::InvalidPeriod("month must be 01-12".into()));
    }
    Ok(month)
}

fn days_in_month(year: i32, month: u32) -> Result<u32, HealthError> {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => Ok(31),
        4 | 6 | 9 | 11 => Ok(30),
        2 if is_leap_year(year) => Ok(29),
        2 => Ok(28),
        _ => Err(HealthError::InvalidPeriod("month must be 01-12".into())),
    }
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aggregation::recalculate_all;
    use crate::db::test_pool;
    use crate::test_utils::{commit_at, init_repo, seed_workspace_and_repo};
    use tempfile::TempDir;

    const D1: i64 = 1704067200; // 2024-01-01
    const D2: i64 = 1704153600; // 2024-01-02
    const D3: i64 = 1704240000; // 2024-01-03
    const FEB1: i64 = 1706745600; // 2024-02-01

    async fn setup(tmp: &TempDir, pool: &SqlitePool) -> String {
        let (_, repo_id) = seed_workspace_and_repo(pool, tmp.path()).await;
        crate::git::scan_repo(pool, &repo_id, tmp.path(), "main")
            .await
            .unwrap();
        recalculate_all(pool).await.unwrap();
        repo_id
    }

    #[test]
    fn parse_period_supports_v3_period_keys() {
        assert_eq!(
            parse_period("month", "2024-02").unwrap(),
            PeriodBounds {
                from_date: Some("2024-02-01".into()),
                to_date: Some("2024-02-29".into()),
            }
        );
        assert_eq!(
            parse_period("quarter", "2024-Q2").unwrap(),
            PeriodBounds {
                from_date: Some("2024-04-01".into()),
                to_date: Some("2024-06-30".into()),
            }
        );
        assert_eq!(
            parse_period("season", "2024").unwrap(),
            PeriodBounds {
                from_date: Some("2024-01-01".into()),
                to_date: Some("2024-12-31".into()),
            }
        );
        assert_eq!(
            parse_period("all_time", "all").unwrap(),
            PeriodBounds {
                from_date: None,
                to_date: None,
            }
        );
    }

    #[test]
    fn parse_period_rejects_invalid_keys() {
        assert!(parse_period("month", "2024-13").is_err());
        assert!(parse_period("quarter", "2024-Q5").is_err());
        assert!(parse_period("all_time", "2024").is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn file_health_returns_period_hotspots_and_ownership_risk() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[("src/hot.rs", "1"), ("src/peer.rs", "1")],
            D1,
        );
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("src/hot.rs", "2")], D2);
        commit_at(&repo, "c3", "Bob", "b@x.com", &[("src/peer.rs", "2")], D3);
        let repo_id = setup(&tmp, &pool).await;

        let rows = inner_get_file_health_stats(&pool, &repo_id, "month", "2024-01")
            .await
            .unwrap();

        assert_eq!(rows.len(), 2);
        let hot = rows
            .iter()
            .find(|row| row.file_path == "src/hot.rs")
            .unwrap();
        assert_eq!(hot.recent_commits, 2);
        assert_eq!(hot.unique_authors, 1);
        assert_eq!(hot.primary_owner_name.as_deref(), Some("Alice"));
        assert_eq!(hot.active_maintainers, 1);
        assert_eq!(hot.bus_factor, 1);
        assert!(hot.silo_risk);
        assert!((0.0..=100.0).contains(&hot.hotspot_score));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn file_health_filters_by_period() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.rs", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.rs", "1")], FEB1);
        let repo_id = setup(&tmp, &pool).await;

        let rows = inner_get_file_health_stats(&pool, &repo_id, "month", "2024-01")
            .await
            .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].file_path, "a.rs");
        assert!(rows.iter().all(|row| row.recent_commits == 1));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn file_health_empty_for_unknown_repo() {
        let pool = test_pool().await;
        let rows = inner_get_file_health_stats(&pool, "no-such-repo", "all_time", "all")
            .await
            .unwrap();
        assert!(rows.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn directory_health_summarizes_hotspots_and_silos() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[("src/hot.rs", "1"), ("src/peer.rs", "1")],
            D1,
        );
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("src/hot.rs", "2")], D2);
        commit_at(&repo, "c3", "Bob", "b@x.com", &[("tests/spec.rs", "1")], D3);
        let repo_id = setup(&tmp, &pool).await;

        let rows = inner_get_directory_health_stats(&pool, &repo_id, "all_time", "all")
            .await
            .unwrap();
        let src = rows
            .iter()
            .find(|row| row.directory_path == "src")
            .expect("src directory health row");

        assert_eq!(src.commit_count, 2);
        assert_eq!(src.unique_authors, 1);
        assert!(src.hotspot_file_count >= 1);
        assert!(src.silo_file_count >= 1);
        assert!((0.0..=100.0).contains(&src.directory_health_score));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn directory_health_empty_for_unknown_repo() {
        let pool = test_pool().await;
        let rows = inner_get_directory_health_stats(&pool, "no-such-repo", "all_time", "all")
            .await
            .unwrap();
        assert!(rows.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn advanced_health_metrics_return_expected_rows() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "wide change",
            "Alice",
            "a@x.com",
            &[("src/a.rs", "1"), ("src/b.rs", "1"), ("tests/a.rs", "1")],
            D1,
        );
        commit_at(
            &repo,
            "focused change",
            "Alice",
            "a@x.com",
            &[("src/a.rs", "2")],
            D2,
        );
        commit_at(
            &repo,
            "other area",
            "Bob",
            "b@x.com",
            &[("docs/readme.md", "1")],
            D3,
        );
        let repo_id = setup(&tmp, &pool).await;

        let focus = inner_get_developer_focus_stats(&pool, &repo_id, "month", "2024-01")
            .await
            .unwrap();
        assert_eq!(focus.len(), 2);
        assert!(focus.iter().any(|row| row.developer_name == "Alice"));
        assert!(focus
            .iter()
            .all(|row| (0.0..=100.0).contains(&row.focus_score)));

        let risks = inner_get_review_risk_commits(&pool, &repo_id, "month", "2024-01")
            .await
            .unwrap();
        assert_eq!(risks.len(), 3);
        assert_eq!(risks[0].message, "wide change");
        assert!((0.0..=100.0).contains(&risks[0].risk_score));

        let signals = inner_get_activity_signal_stats(&pool, &repo_id, "month", "2024-01")
            .await
            .unwrap();
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].period_bucket, "2024-01");
        assert!(!signals[0].dominant_signal.is_empty());

        let volatility = inner_get_file_volatility_stats(&pool, &repo_id, "month", "2024-01")
            .await
            .unwrap();
        assert!(volatility.iter().any(|row| row.file_path == "src/a.rs"));
        assert!(volatility
            .iter()
            .all(|row| (0.0..=100.0).contains(&row.volatility_score)));

        let coupling = inner_get_file_coupling_graph(&pool, &repo_id, "month", "2024-01")
            .await
            .unwrap();
        assert!(!coupling.is_empty());
        assert!(coupling
            .iter()
            .any(|row| row.source_file_path == "src/a.rs" || row.target_file_path == "src/a.rs"));
    }
}
