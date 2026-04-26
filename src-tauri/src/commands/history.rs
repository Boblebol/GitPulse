use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use crate::AppState;

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PeriodLeaderboardEntry {
    pub rank: i64,
    pub developer_id: String,
    pub developer_name: String,
    pub total_commits: i64,
    pub total_insertions: i64,
    pub total_deletions: i64,
    pub files_touched: i64,
    pub active_days: i64,
    pub best_streak: i64,
    pub total_player_score: f64,
    pub avg_player_score: f64,
    pub adder_rank: i64,
    pub remover_rank: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodAward {
    pub award_key: String,
    pub title: String,
    pub winner_developer_id: String,
    pub winner_developer_name: String,
    pub metric_value: f64,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct HistoricalRecord {
    pub record_key: String,
    pub title: String,
    pub holder_id: Option<String>,
    pub holder_name: Option<String>,
    pub value: f64,
    pub date: Option<String>,
    pub period_key: Option<String>,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HallOfFameEntry {
    pub category_key: String,
    pub title: String,
    pub developer_id: String,
    pub developer_name: String,
    pub value: f64,
    pub highlight: String,
}

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub(crate) enum HistoryError {
    #[error("invalid period: {0}")]
    InvalidPeriod(String),
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
}

// ── Period parsing ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
enum PeriodBounds {
    Range { from_date: String, to_date: String },
    AllTime,
}

fn parse_period(period_type: &str, period_key: &str) -> Result<PeriodBounds, HistoryError> {
    match period_type {
        "month" => parse_month(period_key),
        "quarter" => parse_quarter(period_key),
        "calendar_year" => parse_year_like(period_type, period_key),
        "season" => parse_year_like(period_type, period_key),
        "all_time" => {
            if period_key == "all" {
                Ok(PeriodBounds::AllTime)
            } else {
                Err(HistoryError::InvalidPeriod(
                    "all_time period key must be 'all'".into(),
                ))
            }
        }
        other => Err(HistoryError::InvalidPeriod(format!(
            "unsupported period type '{other}'"
        ))),
    }
}

fn parse_month(period_key: &str) -> Result<PeriodBounds, HistoryError> {
    let (year, month) = period_key
        .split_once('-')
        .ok_or_else(|| HistoryError::InvalidPeriod("month period key must use YYYY-MM".into()))?;
    if month.len() != 2 {
        return Err(HistoryError::InvalidPeriod(
            "month period key must use YYYY-MM".into(),
        ));
    }
    let year = parse_year(year, "month")?;
    let month = month
        .parse::<u32>()
        .map_err(|_| HistoryError::InvalidPeriod("month period key must use YYYY-MM".into()))?;

    let from = NaiveDate::from_ymd_opt(year, month, 1).ok_or_else(|| {
        HistoryError::InvalidPeriod("month period key contains an invalid month".into())
    })?;
    let next_month = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .expect("validated month must produce a next month");
    let to = next_month
        .pred_opt()
        .expect("next month must have previous day");

    Ok(range(from, to))
}

fn parse_quarter(period_key: &str) -> Result<PeriodBounds, HistoryError> {
    let (year, quarter) = period_key
        .split_once("-Q")
        .ok_or_else(|| HistoryError::InvalidPeriod("quarter period key must use YYYY-QN".into()))?;
    let year = parse_year(year, "quarter")?;
    let quarter = quarter
        .parse::<u32>()
        .map_err(|_| HistoryError::InvalidPeriod("quarter period key must use YYYY-QN".into()))?;
    if !(1..=4).contains(&quarter) {
        return Err(HistoryError::InvalidPeriod(
            "quarter period key must use quarter 1 through 4".into(),
        ));
    }

    let start_month = ((quarter - 1) * 3) + 1;
    let from = NaiveDate::from_ymd_opt(year, start_month, 1).unwrap();
    let next = if quarter == 4 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, start_month + 3, 1)
    }
    .unwrap();

    Ok(range(from, next.pred_opt().unwrap()))
}

fn parse_year_like(period_type: &str, period_key: &str) -> Result<PeriodBounds, HistoryError> {
    let year = parse_year(period_key, period_type)?;
    let from = NaiveDate::from_ymd_opt(year, 1, 1).unwrap();
    let to = NaiveDate::from_ymd_opt(year, 12, 31).unwrap();
    Ok(range(from, to))
}

fn parse_year(year: &str, period_type: &str) -> Result<i32, HistoryError> {
    if year.len() != 4 || !year.chars().all(|c| c.is_ascii_digit()) {
        return Err(HistoryError::InvalidPeriod(format!(
            "{period_type} period key must start with a four-digit year"
        )));
    }
    year.parse::<i32>().map_err(|_| {
        HistoryError::InvalidPeriod(format!("{period_type} period key contains an invalid year"))
    })
}

fn range(from: NaiveDate, to: NaiveDate) -> PeriodBounds {
    PeriodBounds::Range {
        from_date: from.format("%Y-%m-%d").to_string(),
        to_date: to.format("%Y-%m-%d").to_string(),
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_period_leaderboard(
    state: tauri::State<'_, AppState>,
    repo_id: Option<String>,
    workspace_id: Option<String>,
    period_type: String,
    period_key: String,
) -> Result<Vec<PeriodLeaderboardEntry>, String> {
    inner_get_period_leaderboard(
        &state.db,
        repo_id.as_deref(),
        workspace_id.as_deref(),
        &period_type,
        &period_key,
    )
    .await
    .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_period_leaderboard(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<PeriodLeaderboardEntry>, HistoryError> {
    let period = parse_period(period_type, period_key)?;

    let mut qb = QueryBuilder::<Sqlite>::new(
        "WITH agg AS (
             SELECT sdd.developer_id,
                    d.name AS developer_name,
                    SUM(sdd.commits) AS total_commits,
                    SUM(sdd.insertions) AS total_insertions,
                    SUM(sdd.deletions) AS total_deletions,
                    SUM(sdd.files_touched) AS files_touched,
                    COUNT(DISTINCT sdd.date) AS active_days,
                    MAX(sdd.streak) AS best_streak,
                    SUM(sdd.player_score) AS total_player_score,
                    AVG(sdd.player_score) AS avg_player_score
             FROM stats_daily_developer sdd
             JOIN developers d ON d.id = sdd.developer_id",
    );

    if repo_id.is_none() && workspace_id.is_some() {
        qb.push(" JOIN repos r ON r.id = sdd.repo_id");
    }

    qb.push(" WHERE sdd.commits > 0");
    apply_scope_and_period(
        &mut qb,
        repo_id,
        workspace_id,
        &period,
        "sdd.repo_id",
        "sdd.date",
    );
    qb.push(
        " GROUP BY sdd.developer_id, d.name
         )
         SELECT ROW_NUMBER() OVER (
                    ORDER BY total_player_score DESC, total_commits DESC, developer_name ASC, developer_id ASC
                ) AS rank,
                developer_id,
                developer_name,
                total_commits,
                total_insertions,
                total_deletions,
                files_touched,
                active_days,
                best_streak,
                total_player_score,
                avg_player_score,
                RANK() OVER (ORDER BY total_insertions DESC, developer_name ASC, developer_id ASC) AS adder_rank,
                RANK() OVER (ORDER BY total_deletions DESC, developer_name ASC, developer_id ASC) AS remover_rank
         FROM agg
         ORDER BY rank",
    );

    qb.build_query_as()
        .fetch_all(pool)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_period_awards(
    state: tauri::State<'_, AppState>,
    repo_id: Option<String>,
    workspace_id: Option<String>,
    period_type: String,
    period_key: String,
) -> Result<Vec<PeriodAward>, String> {
    inner_get_period_awards(
        &state.db,
        repo_id.as_deref(),
        workspace_id.as_deref(),
        &period_type,
        &period_key,
    )
    .await
    .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_period_awards(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<PeriodAward>, HistoryError> {
    let board =
        inner_get_period_leaderboard(pool, repo_id, workspace_id, period_type, period_key).await?;
    if board.is_empty() {
        return Ok(Vec::new());
    }

    let mut awards = Vec::new();
    if let Some(row) = board.first() {
        awards.push(award(
            "mvp",
            "MVP",
            row,
            row.total_player_score,
            "Highest total player score in the selected period.",
        ));
    }
    if let Some(row) = board.iter().min_by(|a, b| {
        a.adder_rank
            .cmp(&b.adder_rank)
            .then_with(|| a.developer_name.cmp(&b.developer_name))
            .then_with(|| a.developer_id.cmp(&b.developer_id))
    }) {
        awards.push(award(
            "best_adder",
            "Best Adder",
            row,
            row.total_insertions as f64,
            "Most insertions in the selected period.",
        ));
    }
    if let Some(row) = board.iter().min_by(|a, b| {
        a.remover_rank
            .cmp(&b.remover_rank)
            .then_with(|| a.developer_name.cmp(&b.developer_name))
            .then_with(|| a.developer_id.cmp(&b.developer_id))
    }) {
        awards.push(award(
            "best_remover",
            "Best Remover",
            row,
            row.total_deletions as f64,
            "Most deletions in the selected period.",
        ));
    }
    if let Some(row) = board.iter().max_by(|a, b| {
        a.total_commits
            .cmp(&b.total_commits)
            .then(a.active_days.cmp(&b.active_days))
            .then_with(|| b.developer_name.cmp(&a.developer_name))
            .then_with(|| b.developer_id.cmp(&a.developer_id))
    }) {
        awards.push(award(
            "most_active",
            "Most Active",
            row,
            row.total_commits as f64,
            "Most commits, with active days as the tie-breaker.",
        ));
    }
    if let Some(row) = board.iter().max_by(|a, b| {
        a.active_days
            .cmp(&b.active_days)
            .then(a.best_streak.cmp(&b.best_streak))
            .then_with(|| b.developer_name.cmp(&a.developer_name))
            .then_with(|| b.developer_id.cmp(&a.developer_id))
    }) {
        awards.push(award(
            "iron_man",
            "Iron Man",
            row,
            row.active_days as f64,
            "Most active days, with best streak as the tie-breaker.",
        ));
    }
    if let Some(row) =
        get_hotspot_hero(pool, repo_id, workspace_id, period_type, period_key).await?
    {
        awards.push(row);
    }

    Ok(awards)
}

#[tauri::command]
pub async fn get_historical_records(
    state: tauri::State<'_, AppState>,
    repo_id: Option<String>,
    workspace_id: Option<String>,
    period_type: String,
    period_key: String,
) -> Result<Vec<HistoricalRecord>, String> {
    inner_get_historical_records(
        &state.db,
        repo_id.as_deref(),
        workspace_id.as_deref(),
        &period_type,
        &period_key,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_hall_of_fame(
    state: tauri::State<'_, AppState>,
    repo_id: Option<String>,
    workspace_id: Option<String>,
) -> Result<Vec<HallOfFameEntry>, String> {
    inner_get_hall_of_fame(&state.db, repo_id.as_deref(), workspace_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn inner_get_hall_of_fame(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
) -> Result<Vec<HallOfFameEntry>, HistoryError> {
    let board =
        inner_get_period_leaderboard(pool, repo_id, workspace_id, "all_time", "all").await?;
    if board.is_empty() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    if let Some(row) = board.first() {
        entries.push(hof_entry(
            "career_mvp",
            "Career MVP",
            row,
            row.total_player_score,
            "Highest all-time player score.",
        ));
    }
    if let Some(row) = board.iter().max_by(|a, b| {
        a.avg_player_score
            .total_cmp(&b.avg_player_score)
            .then_with(|| b.developer_name.cmp(&a.developer_name))
            .then_with(|| b.developer_id.cmp(&a.developer_id))
    }) {
        entries.push(hof_entry(
            "scoring_champion",
            "Scoring Champion",
            row,
            row.avg_player_score,
            "Best average daily player score.",
        ));
    }
    if let Some(row) = board.iter().max_by(|a, b| {
        a.total_insertions
            .cmp(&b.total_insertions)
            .then_with(|| b.developer_name.cmp(&a.developer_name))
            .then_with(|| b.developer_id.cmp(&a.developer_id))
    }) {
        entries.push(hof_entry(
            "best_adder_career",
            "Best Adder Career",
            row,
            row.total_insertions as f64,
            "Most all-time insertions.",
        ));
    }
    if let Some(row) = board.iter().max_by(|a, b| {
        a.total_deletions
            .cmp(&b.total_deletions)
            .then_with(|| b.developer_name.cmp(&a.developer_name))
            .then_with(|| b.developer_id.cmp(&a.developer_id))
    }) {
        entries.push(hof_entry(
            "best_remover_career",
            "Best Remover Career",
            row,
            row.total_deletions as f64,
            "Most all-time deletions.",
        ));
    }
    if let Some(row) = board.iter().max_by(|a, b| {
        a.active_days
            .cmp(&b.active_days)
            .then(a.best_streak.cmp(&b.best_streak))
            .then_with(|| b.developer_name.cmp(&a.developer_name))
            .then_with(|| b.developer_id.cmp(&a.developer_id))
    }) {
        entries.push(hof_entry(
            "iron_legend",
            "Iron Legend",
            row,
            row.active_days as f64,
            "Most all-time active days.",
        ));
    }
    if let Some(row) = board.iter().max_by(|a, b| {
        a.best_streak
            .cmp(&b.best_streak)
            .then_with(|| b.developer_name.cmp(&a.developer_name))
            .then_with(|| b.developer_id.cmp(&a.developer_id))
    }) {
        entries.push(hof_entry(
            "streak_legend",
            "Streak Legend",
            row,
            row.best_streak as f64,
            "Longest all-time streak.",
        ));
    }
    if let Some(row) = board.iter().max_by(|a, b| {
        a.files_touched
            .cmp(&b.files_touched)
            .then_with(|| b.developer_name.cmp(&a.developer_name))
            .then_with(|| b.developer_id.cmp(&a.developer_id))
    }) {
        entries.push(hof_entry(
            "range_legend",
            "Range Legend",
            row,
            row.files_touched as f64,
            "Most all-time files touched.",
        ));
    }

    Ok(entries)
}

pub(crate) async fn inner_get_historical_records(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    period_type: &str,
    period_key: &str,
) -> Result<Vec<HistoricalRecord>, HistoryError> {
    let period = parse_period(period_type, period_key)?;
    let mut records = Vec::new();

    push_optional(
        &mut records,
        top_developer_day_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "most_commits_day",
                title: "Most Commits In A Day",
                metric_expression: "sdd.commits",
                explanation: "Most commits by one developer on one day.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        top_developer_day_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "most_insertions_day",
                title: "Most Insertions In A Day",
                metric_expression: "sdd.insertions",
                explanation: "Most insertions by one developer on one day.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        top_developer_day_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "most_deletions_day",
                title: "Most Deletions In A Day",
                metric_expression: "sdd.deletions",
                explanation: "Most deletions by one developer on one day.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        top_developer_day_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "most_files_touched_day",
                title: "Most Files Touched In A Day",
                metric_expression: "sdd.files_touched",
                explanation: "Most files touched by one developer on one day.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        top_developer_day_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "best_player_score_day",
                title: "Best Player Score Day",
                metric_expression: "sdd.player_score",
                explanation: "Highest player score by one developer on one day.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        top_developer_day_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "longest_streak",
                title: "Longest Streak",
                metric_expression: "sdd.streak",
                explanation: "Longest developer streak reached during the selected period.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        grouped_developer_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "biggest_month",
                title: "Biggest Month",
                metric_expression: "substr(sdd.date, 1, 7)",
                explanation: "Most commits by one developer in one calendar month.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        grouped_developer_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "biggest_year",
                title: "Biggest Year",
                metric_expression: "substr(sdd.date, 1, 4)",
                explanation: "Most commits by one developer in one calendar year.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        top_file_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "most_active_file",
                title: "Most Active File",
                metric_expression: "SUM(sdf.commits)",
                explanation: "Most commits touching one file.",
            },
        )
        .await?,
    );
    push_optional(
        &mut records,
        top_file_record(
            pool,
            repo_id,
            workspace_id,
            &period,
            RecordSpec {
                record_key: "hottest_file",
                title: "Hottest File",
                metric_expression: "SUM(sdf.churn_score)",
                explanation: "Highest summed churn score for one file.",
            },
        )
        .await?,
    );

    Ok(records)
}

// ── Query helpers ─────────────────────────────────────────────────────────────

fn apply_scope_and_period<'a>(
    qb: &mut QueryBuilder<'a, Sqlite>,
    repo_id: Option<&'a str>,
    workspace_id: Option<&'a str>,
    period: &'a PeriodBounds,
    repo_column: &str,
    date_column: &str,
) {
    if let Some(repo_id) = repo_id {
        qb.push(" AND ");
        qb.push(repo_column);
        qb.push(" = ");
        qb.push_bind(repo_id);
    } else if let Some(workspace_id) = workspace_id {
        qb.push(" AND r.workspace_id = ");
        qb.push_bind(workspace_id);
    }

    if let PeriodBounds::Range { from_date, to_date } = period {
        qb.push(" AND ");
        qb.push(date_column);
        qb.push(" BETWEEN ");
        qb.push_bind(from_date);
        qb.push(" AND ");
        qb.push_bind(to_date);
    }
}

fn award(
    award_key: &str,
    title: &str,
    row: &PeriodLeaderboardEntry,
    metric_value: f64,
    explanation: &str,
) -> PeriodAward {
    PeriodAward {
        award_key: award_key.into(),
        title: title.into(),
        winner_developer_id: row.developer_id.clone(),
        winner_developer_name: row.developer_name.clone(),
        metric_value,
        explanation: explanation.into(),
    }
}

fn hof_entry(
    category_key: &str,
    title: &str,
    row: &PeriodLeaderboardEntry,
    value: f64,
    highlight: &str,
) -> HallOfFameEntry {
    HallOfFameEntry {
        category_key: category_key.into(),
        title: title.into(),
        developer_id: row.developer_id.clone(),
        developer_name: row.developer_name.clone(),
        value,
        highlight: highlight.into(),
    }
}

async fn get_hotspot_hero(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    period_type: &str,
    period_key: &str,
) -> Result<Option<PeriodAward>, HistoryError> {
    let period = parse_period(period_type, period_key)?;
    let mut qb = QueryBuilder::<Sqlite>::new(
        "SELECT a.developer_id,
                d.name AS developer_name,
                CAST(SUM(cfc.insertions + cfc.deletions) AS REAL) AS metric_value
         FROM commit_file_changes cfc
         JOIN commits c ON c.id = cfc.commit_id
         JOIN aliases a ON a.id = c.author_alias_id
         JOIN developers d ON d.id = a.developer_id",
    );

    if repo_id.is_none() && workspace_id.is_some() {
        qb.push(" JOIN repos r ON r.id = c.repo_id");
    }

    qb.push(" WHERE 1 = 1");
    apply_scope_and_period(
        &mut qb,
        repo_id,
        workspace_id,
        &period,
        "c.repo_id",
        "date(c.committed_at)",
    );
    qb.push(
        " GROUP BY a.developer_id, d.name
          HAVING metric_value > 0
          ORDER BY metric_value DESC, developer_name ASC, a.developer_id ASC
          LIMIT 1",
    );

    #[derive(sqlx::FromRow)]
    struct HotspotHeroRow {
        developer_id: String,
        developer_name: String,
        metric_value: f64,
    }

    let row: Option<HotspotHeroRow> = qb.build_query_as().fetch_optional(pool).await?;
    Ok(row.map(|row| PeriodAward {
        award_key: "hotspot_hero".into(),
        title: "Hotspot Hero".into(),
        winner_developer_id: row.developer_id,
        winner_developer_name: row.developer_name,
        metric_value: row.metric_value,
        explanation: "Highest touched-file churn, measured as insertions plus deletions.".into(),
    }))
}

fn push_optional(records: &mut Vec<HistoricalRecord>, record: Option<HistoricalRecord>) {
    if let Some(record) = record {
        records.push(record);
    }
}

#[derive(Clone, Copy)]
struct RecordSpec<'a> {
    record_key: &'a str,
    title: &'a str,
    metric_expression: &'a str,
    explanation: &'a str,
}

async fn top_developer_day_record(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    period: &PeriodBounds,
    spec: RecordSpec<'_>,
) -> Result<Option<HistoricalRecord>, HistoryError> {
    let mut qb = QueryBuilder::<Sqlite>::new("SELECT ");
    qb.push_bind(spec.record_key);
    qb.push(" AS record_key, ");
    qb.push_bind(spec.title);
    qb.push(
        " AS title,
           sdd.developer_id AS holder_id,
           d.name AS holder_name,",
    );
    qb.push("CAST(");
    qb.push(spec.metric_expression);
    qb.push(" AS REAL)");
    qb.push(
        " AS value,
           sdd.date AS date,
           NULL AS period_key,",
    );
    qb.push_bind(spec.explanation);
    qb.push(
        " AS explanation
         FROM stats_daily_developer sdd
         JOIN developers d ON d.id = sdd.developer_id",
    );
    if repo_id.is_none() && workspace_id.is_some() {
        qb.push(" JOIN repos r ON r.id = sdd.repo_id");
    }
    qb.push(" WHERE ");
    qb.push(spec.metric_expression);
    qb.push(" > 0");
    apply_scope_and_period(
        &mut qb,
        repo_id,
        workspace_id,
        period,
        "sdd.repo_id",
        "sdd.date",
    );
    qb.push(" ORDER BY value DESC, sdd.date ASC, holder_name ASC, holder_id ASC LIMIT 1");

    qb.build_query_as()
        .fetch_optional(pool)
        .await
        .map_err(Into::into)
}

async fn grouped_developer_record(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    period: &PeriodBounds,
    spec: RecordSpec<'_>,
) -> Result<Option<HistoricalRecord>, HistoryError> {
    let mut qb = QueryBuilder::<Sqlite>::new(
        "WITH grouped AS (
             SELECT sdd.developer_id AS holder_id,
                    d.name AS holder_name,",
    );
    qb.push(spec.metric_expression);
    qb.push(
        " AS group_key,
                 SUM(sdd.commits) AS value
          FROM stats_daily_developer sdd
          JOIN developers d ON d.id = sdd.developer_id",
    );
    if repo_id.is_none() && workspace_id.is_some() {
        qb.push(" JOIN repos r ON r.id = sdd.repo_id");
    }
    qb.push(" WHERE sdd.commits > 0");
    apply_scope_and_period(
        &mut qb,
        repo_id,
        workspace_id,
        period,
        "sdd.repo_id",
        "sdd.date",
    );
    qb.push(" GROUP BY sdd.developer_id, d.name, group_key)");

    qb.push(" SELECT ");
    qb.push_bind(spec.record_key);
    qb.push(" AS record_key, ");
    qb.push_bind(spec.title);
    qb.push(
        " AS title,
           holder_id,
           holder_name,
           CAST(value AS REAL) AS value,
           NULL AS date,
           group_key AS period_key,",
    );
    qb.push_bind(spec.explanation);
    qb.push(
        " AS explanation
         FROM grouped
         ORDER BY value DESC, group_key ASC, holder_name ASC, holder_id ASC
         LIMIT 1",
    );

    qb.build_query_as()
        .fetch_optional(pool)
        .await
        .map_err(Into::into)
}

async fn top_file_record(
    pool: &SqlitePool,
    repo_id: Option<&str>,
    workspace_id: Option<&str>,
    period: &PeriodBounds,
    spec: RecordSpec<'_>,
) -> Result<Option<HistoricalRecord>, HistoryError> {
    let mut qb = QueryBuilder::<Sqlite>::new("SELECT ");
    qb.push_bind(spec.record_key);
    qb.push(" AS record_key, ");
    qb.push_bind(spec.title);
    qb.push(
        " AS title,
           f.id AS holder_id,
           f.current_path AS holder_name,",
    );
    qb.push("CAST(");
    qb.push(spec.metric_expression);
    qb.push(" AS REAL)");
    qb.push(
        " AS value,
           NULL AS date,
           NULL AS period_key,",
    );
    qb.push_bind(spec.explanation);
    qb.push(
        " AS explanation
         FROM stats_daily_file sdf
         JOIN files f ON f.id = sdf.file_id",
    );
    if repo_id.is_none() && workspace_id.is_some() {
        qb.push(" JOIN repos r ON r.id = f.repo_id");
    }
    qb.push(" WHERE 1 = 1");
    apply_scope_and_period(
        &mut qb,
        repo_id,
        workspace_id,
        period,
        "f.repo_id",
        "sdf.date",
    );
    qb.push(
        " GROUP BY f.id, f.current_path
          HAVING value > 0
          ORDER BY value DESC, holder_name ASC, holder_id ASC
          LIMIT 1",
    );

    qb.build_query_as()
        .fetch_optional(pool)
        .await
        .map_err(Into::into)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aggregation::recalculate_all;
    use crate::db::test_pool;
    use crate::test_utils::{commit_at, init_repo, seed_workspace_and_repo};
    use tempfile::TempDir;

    const JAN_1: i64 = 1704067200; // 2024-01-01
    const JAN_2: i64 = 1704153600; // 2024-01-02
    const APR_1: i64 = 1711929600; // 2024-04-01

    async fn scan_and_recalculate(tmp: &TempDir, pool: &SqlitePool) -> (String, String) {
        let ids = seed_workspace_and_repo(pool, tmp.path()).await;
        crate::git::scan_repo(pool, &ids.1, tmp.path(), "main")
            .await
            .unwrap();
        recalculate_all(pool).await.unwrap();
        ids
    }

    #[test]
    fn parses_supported_periods() {
        assert_eq!(
            parse_period("month", "2024-02").unwrap(),
            PeriodBounds::Range {
                from_date: "2024-02-01".into(),
                to_date: "2024-02-29".into()
            }
        );
        assert_eq!(
            parse_period("quarter", "2024-Q2").unwrap(),
            PeriodBounds::Range {
                from_date: "2024-04-01".into(),
                to_date: "2024-06-30".into()
            }
        );
        assert_eq!(
            parse_period("calendar_year", "2024").unwrap(),
            PeriodBounds::Range {
                from_date: "2024-01-01".into(),
                to_date: "2024-12-31".into()
            }
        );
        assert_eq!(
            parse_period("season", "2024").unwrap(),
            parse_period("calendar_year", "2024").unwrap()
        );
        assert_eq!(
            parse_period("all_time", "all").unwrap(),
            PeriodBounds::AllTime
        );
    }

    #[test]
    fn rejects_invalid_period_keys() {
        assert!(parse_period("month", "2024-13")
            .unwrap_err()
            .to_string()
            .contains("invalid month"));
        assert!(parse_period("quarter", "2024-Q5")
            .unwrap_err()
            .to_string()
            .contains("quarter 1 through 4"));
        assert!(parse_period("all_time", "2024")
            .unwrap_err()
            .to_string()
            .contains("must be 'all'"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn period_leaderboard_ranks_developers_deterministically() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "a1", "Alice", "a@x.com", &[("a.txt", "a")], JAN_1);
        commit_at(&repo, "a2", "Alice", "a@x.com", &[("b.txt", "b")], JAN_2);
        commit_at(&repo, "b1", "Bob", "b@x.com", &[("c.txt", "c")], JAN_1);
        let (_, repo_id) = scan_and_recalculate(&tmp, &pool).await;

        let board = inner_get_period_leaderboard(&pool, Some(&repo_id), None, "month", "2024-01")
            .await
            .unwrap();

        assert_eq!(board.len(), 2);
        assert_eq!(board[0].rank, 1);
        assert_eq!(board[0].developer_name, "Alice");
        assert_eq!(board[0].total_commits, 2);
        assert_eq!(board[0].active_days, 2);
        assert!(board[0].total_player_score >= board[1].total_player_score);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn period_leaderboard_empty_for_empty_dataset() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "a1", "Alice", "a@x.com", &[("a.txt", "a")], JAN_1);
        let (_, repo_id) = scan_and_recalculate(&tmp, &pool).await;

        let board = inner_get_period_leaderboard(&pool, Some(&repo_id), None, "month", "2025-01")
            .await
            .unwrap();

        assert!(board.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn period_awards_return_expected_award_keys() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "a1", "Alice", "a@x.com", &[("a.txt", "a")], JAN_1);
        commit_at(
            &repo,
            "b1",
            "Bob",
            "b@x.com",
            &[("b.txt", "b\nb\nb")],
            JAN_2,
        );
        let (workspace_id, repo_id) = scan_and_recalculate(&tmp, &pool).await;

        let awards = inner_get_period_awards(
            &pool,
            Some(&repo_id),
            Some(&workspace_id),
            "calendar_year",
            "2024",
        )
        .await
        .unwrap();
        let keys: Vec<&str> = awards.iter().map(|a| a.award_key.as_str()).collect();

        assert!(keys.contains(&"mvp"));
        assert!(keys.contains(&"best_adder"));
        assert!(keys.contains(&"best_remover"));
        assert!(keys.contains(&"most_active"));
        assert!(keys.contains(&"iron_man"));
        assert!(keys.contains(&"hotspot_hero"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn historical_records_include_developer_and_file_records() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "a1", "Alice", "a@x.com", &[("a.txt", "a")], JAN_1);
        commit_at(
            &repo,
            "a2",
            "Alice",
            "a@x.com",
            &[("a.txt", "a\nb\nc")],
            JAN_2,
        );
        commit_at(&repo, "b1", "Bob", "b@x.com", &[("b.txt", "b")], APR_1);
        let (_, repo_id) = scan_and_recalculate(&tmp, &pool).await;

        let records = inner_get_historical_records(&pool, Some(&repo_id), None, "all_time", "all")
            .await
            .unwrap();
        let keys: Vec<&str> = records.iter().map(|r| r.record_key.as_str()).collect();

        assert!(keys.contains(&"most_commits_day"));
        assert!(keys.contains(&"biggest_month"));
        assert!(keys.contains(&"biggest_year"));
        assert!(keys.contains(&"most_active_file"));
        assert!(keys.contains(&"hottest_file"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn hall_of_fame_returns_career_categories() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "a1", "Alice", "a@x.com", &[("a.txt", "a")], JAN_1);
        commit_at(&repo, "a2", "Alice", "a@x.com", &[("b.txt", "b")], JAN_2);
        commit_at(&repo, "b1", "Bob", "b@x.com", &[("c.txt", "c")], APR_1);
        let (_, repo_id) = scan_and_recalculate(&tmp, &pool).await;

        let entries = inner_get_hall_of_fame(&pool, Some(&repo_id), None)
            .await
            .unwrap();
        let keys: Vec<&str> = entries
            .iter()
            .map(|entry| entry.category_key.as_str())
            .collect();

        assert!(keys.contains(&"career_mvp"));
        assert!(keys.contains(&"scoring_champion"));
        assert!(keys.contains(&"best_adder_career"));
        assert!(keys.contains(&"best_remover_career"));
        assert!(keys.contains(&"iron_legend"));
        assert!(keys.contains(&"streak_legend"));
        assert!(keys.contains(&"range_legend"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn invalid_period_reaches_inner_functions_as_clear_error() {
        let pool = test_pool().await;
        let err = inner_get_period_leaderboard(&pool, None, None, "quarter", "2024-Q9")
            .await
            .unwrap_err();

        assert!(err.to_string().contains("quarter 1 through 4"));
    }
}
