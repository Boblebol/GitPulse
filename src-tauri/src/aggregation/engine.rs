use std::collections::{HashMap, HashSet};

use sqlx::SqlitePool;
use thiserror::Error;
use tracing::info;

use super::formulas::{evaluate_raw_score, percentile_scores, FormulaError};

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum AggError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("formula error: {0}")]
    Formula(#[from] FormulaError),
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Rebuild every aggregate table from the raw facts (Layer 1 → Layer 3).
///
/// Safe to call at any time; drops and regenerates all stats in a transaction.
/// Triggers: new scan completed, alias merge, formula change.
pub async fn recalculate_all(pool: &SqlitePool) -> Result<(), AggError> {
    info!("starting full aggregate recalculation");

    let mut tx = pool.begin().await?;
    clear_aggregates(&mut tx).await?;
    insert_daily_developer(&mut tx).await?;
    update_streaks(&mut tx).await?;
    update_top_file(&mut tx).await?;
    insert_daily_file(&mut tx).await?;
    insert_daily_directory(&mut tx).await?;
    insert_global_developer(&mut tx).await?;
    insert_global_file(&mut tx).await?;
    insert_global_directory(&mut tx).await?;
    tx.commit().await?;

    // Player scores use evalexpr and require a second pass outside the main tx.
    update_player_scores(pool).await?;

    info!("aggregate recalculation complete");
    Ok(())
}

/// Rebuild daily aggregates for the provided `(repo_id, YYYY-MM-DD)` scopes.
///
/// This is intentionally scoped to daily rows matching the dirty scopes. Global
/// tables for affected repos/developers/files are refreshed from the resulting
/// daily/raw data. `recalculate_all` remains the fallback for formula changes,
/// alias merges, and other operations that can invalidate every aggregate.
pub async fn recalculate_repo_dates(
    pool: &SqlitePool,
    scopes: &[(String, String)],
) -> Result<(), AggError> {
    let scopes = normalize_scopes(scopes);
    if scopes.is_empty() {
        return Ok(());
    }

    info!(
        scope_count = scopes.len(),
        "starting scoped aggregate recalculation"
    );

    let mut tx = pool.begin().await?;
    let affected_repos = affected_repos(&scopes);
    let affected_developers = collect_affected_developers(&mut tx, &scopes).await?;
    let affected_files = collect_affected_files(&mut tx, &scopes).await?;

    clear_daily_scopes(&mut tx, &scopes).await?;
    insert_daily_developer_scopes(&mut tx, &scopes).await?;
    update_streaks_scopes(&mut tx, &scopes).await?;
    update_top_file_scopes(&mut tx, &scopes).await?;
    insert_daily_file_scopes(&mut tx, &scopes).await?;
    insert_daily_directory_scopes(&mut tx, &scopes).await?;
    refresh_global_developers(&mut tx, &affected_developers).await?;
    refresh_global_files(&mut tx, &affected_files).await?;
    refresh_global_directories_for_repos(&mut tx, &affected_repos).await?;
    tx.commit().await?;

    update_player_scores_for_developers(pool, &affected_developers).await?;

    info!("scoped aggregate recalculation complete");
    Ok(())
}

fn normalize_scopes(scopes: &[(String, String)]) -> Vec<(String, String)> {
    let mut deduped: Vec<(String, String)> = scopes
        .iter()
        .filter(|(repo_id, date)| !repo_id.is_empty() && !date.is_empty())
        .cloned()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    deduped.sort();
    deduped
}

fn affected_repos(scopes: &[(String, String)]) -> Vec<String> {
    let mut repos: Vec<String> = scopes
        .iter()
        .map(|(repo_id, _)| repo_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    repos.sort();
    repos
}

// ── Step 1 — wipe ─────────────────────────────────────────────────────────────

async fn clear_aggregates(tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>) -> Result<(), AggError> {
    for table in &[
        "stats_daily_developer",
        "stats_daily_file",
        "stats_daily_directory",
        "stats_developer_global",
        "stats_file_global",
        "stats_directory_global",
    ] {
        sqlx::query(&format!("DELETE FROM {table}"))
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

async fn clear_daily_scopes(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    scopes: &[(String, String)],
) -> Result<(), AggError> {
    for (repo_id, date) in scopes {
        sqlx::query("DELETE FROM stats_daily_developer WHERE repo_id = ? AND date = ?")
            .bind(repo_id)
            .bind(date)
            .execute(&mut **tx)
            .await?;

        sqlx::query(
            "DELETE FROM stats_daily_file
             WHERE date = ?
               AND file_id IN (SELECT id FROM files WHERE repo_id = ?)",
        )
        .bind(date)
        .bind(repo_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query("DELETE FROM stats_daily_directory WHERE repo_id = ? AND date = ?")
            .bind(repo_id)
            .bind(date)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

// ── Step 2 — stats_daily_developer (base) ─────────────────────────────────────

async fn insert_daily_developer(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), AggError> {
    sqlx::query(
        "WITH base AS (
             SELECT a.developer_id,
                    c.repo_id,
                    date(c.committed_at) AS date,
                    COUNT(c.id)          AS commits,
                    SUM(c.insertions)    AS insertions,
                    SUM(c.deletions)     AS deletions
             FROM commits c
             JOIN aliases a ON c.author_alias_id = a.id
             GROUP BY a.developer_id, c.repo_id, date(c.committed_at)
         ),
         file_counts AS (
             SELECT a.developer_id,
                    c.repo_id,
                    date(c.committed_at)        AS date,
                    COUNT(DISTINCT cfc.file_id) AS files_touched
             FROM commits c
             JOIN aliases a   ON c.author_alias_id = a.id
             JOIN commit_file_changes cfc ON cfc.commit_id = c.id
             GROUP BY a.developer_id, c.repo_id, date(c.committed_at)
         )
         INSERT INTO stats_daily_developer
             (id, developer_id, repo_id, date,
              commits, insertions, deletions, files_touched,
              streak, player_score)
         SELECT lower(hex(randomblob(16))),
                b.developer_id, b.repo_id, b.date,
                b.commits, b.insertions, b.deletions,
                COALESCE(fc.files_touched, 0),
                0, 0.0
         FROM base b
         LEFT JOIN file_counts fc
               ON  fc.developer_id = b.developer_id
               AND fc.repo_id      = b.repo_id
               AND fc.date         = b.date",
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_daily_developer_scopes(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    scopes: &[(String, String)],
) -> Result<(), AggError> {
    for (repo_id, date) in scopes {
        sqlx::query(
            "WITH base AS (
                 SELECT a.developer_id,
                        c.repo_id,
                        date(c.committed_at) AS date,
                        COUNT(c.id)          AS commits,
                        SUM(c.insertions)    AS insertions,
                        SUM(c.deletions)     AS deletions
                 FROM commits c
                 JOIN aliases a ON c.author_alias_id = a.id
                 WHERE c.repo_id = ? AND date(c.committed_at) = ?
                 GROUP BY a.developer_id, c.repo_id, date(c.committed_at)
             ),
             file_counts AS (
                 SELECT a.developer_id,
                        c.repo_id,
                        date(c.committed_at)        AS date,
                        COUNT(DISTINCT cfc.file_id) AS files_touched
                 FROM commits c
                 JOIN aliases a   ON c.author_alias_id = a.id
                 JOIN commit_file_changes cfc ON cfc.commit_id = c.id
                 WHERE c.repo_id = ? AND date(c.committed_at) = ?
                 GROUP BY a.developer_id, c.repo_id, date(c.committed_at)
             )
             INSERT INTO stats_daily_developer
                 (id, developer_id, repo_id, date,
                  commits, insertions, deletions, files_touched,
                  streak, player_score)
             SELECT lower(hex(randomblob(16))),
                    b.developer_id, b.repo_id, b.date,
                    b.commits, b.insertions, b.deletions,
                    COALESCE(fc.files_touched, 0),
                    0, 0.0
             FROM base b
             LEFT JOIN file_counts fc
                   ON  fc.developer_id = b.developer_id
                   AND fc.repo_id      = b.repo_id
                   AND fc.date         = b.date",
        )
        .bind(repo_id)
        .bind(date)
        .bind(repo_id)
        .bind(date)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

// ── Step 3 — streaks ──────────────────────────────────────────────────────────

async fn update_streaks(tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>) -> Result<(), AggError> {
    // Gap-and-islands technique:
    // Subtract the row-number from the date to get a stable "island" key.
    // Rows on consecutive days share the same island_start; gaps break it.
    sqlx::query(
        "WITH numbered AS (
             SELECT developer_id, repo_id, date,
                    ROW_NUMBER() OVER (
                        PARTITION BY developer_id, repo_id
                        ORDER BY date
                    ) AS rn
             FROM stats_daily_developer
             WHERE commits > 0
         ),
         islands AS (
             SELECT developer_id, repo_id, date,
                    date(date, '-' || CAST(rn AS TEXT) || ' days') AS island_start
             FROM numbered
         ),
         streaks AS (
             SELECT developer_id, repo_id, date,
                    COUNT(*) OVER (
                        PARTITION BY developer_id, repo_id, island_start
                        ORDER BY date
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) AS streak
             FROM islands
         )
         UPDATE stats_daily_developer
         SET streak = (
             SELECT streak FROM streaks s
             WHERE s.developer_id = stats_daily_developer.developer_id
               AND s.repo_id      = stats_daily_developer.repo_id
               AND s.date         = stats_daily_developer.date
         )
         WHERE commits > 0",
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn update_streaks_scopes(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    scopes: &[(String, String)],
) -> Result<(), AggError> {
    for (repo_id, date) in scopes {
        sqlx::query(
            "WITH numbered AS (
                 SELECT developer_id, repo_id, date,
                        ROW_NUMBER() OVER (
                            PARTITION BY developer_id, repo_id
                            ORDER BY date
                        ) AS rn
                 FROM stats_daily_developer
                 WHERE commits > 0
             ),
             islands AS (
                 SELECT developer_id, repo_id, date,
                        date(date, '-' || CAST(rn AS TEXT) || ' days') AS island_start
                 FROM numbered
             ),
             streaks AS (
                 SELECT developer_id, repo_id, date,
                        COUNT(*) OVER (
                            PARTITION BY developer_id, repo_id, island_start
                            ORDER BY date
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ) AS streak
                 FROM islands
             )
             UPDATE stats_daily_developer
             SET streak = (
                 SELECT streak FROM streaks s
                 WHERE s.developer_id = stats_daily_developer.developer_id
                   AND s.repo_id      = stats_daily_developer.repo_id
                   AND s.date         = stats_daily_developer.date
             )
             WHERE commits > 0 AND repo_id = ? AND date = ?",
        )
        .bind(repo_id)
        .bind(date)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

// ── Step 4 — top file per (developer, repo, date) ─────────────────────────────

async fn update_top_file(tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>) -> Result<(), AggError> {
    sqlx::query(
        "WITH touch_counts AS (
             SELECT a.developer_id, c.repo_id,
                    date(c.committed_at) AS date,
                    cfc.file_id,
                    COUNT(*)             AS n
             FROM commits c
             JOIN aliases a ON c.author_alias_id = a.id
             JOIN commit_file_changes cfc ON cfc.commit_id = c.id
             GROUP BY a.developer_id, c.repo_id, date(c.committed_at), cfc.file_id
         ),
         ranked AS (
             SELECT developer_id, repo_id, date, file_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY developer_id, repo_id, date
                        ORDER BY n DESC, file_id
                    ) AS rn
             FROM touch_counts
         )
         UPDATE stats_daily_developer
         SET top_file_id = (
             SELECT file_id FROM ranked r
             WHERE r.developer_id = stats_daily_developer.developer_id
               AND r.repo_id      = stats_daily_developer.repo_id
               AND r.date         = stats_daily_developer.date
               AND r.rn = 1
         )",
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn update_top_file_scopes(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    scopes: &[(String, String)],
) -> Result<(), AggError> {
    for (repo_id, date) in scopes {
        sqlx::query(
            "WITH touch_counts AS (
                 SELECT a.developer_id, c.repo_id,
                        date(c.committed_at) AS date,
                        cfc.file_id,
                        COUNT(*)             AS n
                 FROM commits c
                 JOIN aliases a ON c.author_alias_id = a.id
                 JOIN commit_file_changes cfc ON cfc.commit_id = c.id
                 WHERE c.repo_id = ? AND date(c.committed_at) = ?
                 GROUP BY a.developer_id, c.repo_id, date(c.committed_at), cfc.file_id
             ),
             ranked AS (
                 SELECT developer_id, repo_id, date, file_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY developer_id, repo_id, date
                            ORDER BY n DESC, file_id
                        ) AS rn
                 FROM touch_counts
             )
             UPDATE stats_daily_developer
             SET top_file_id = (
                 SELECT file_id FROM ranked r
                 WHERE r.developer_id = stats_daily_developer.developer_id
                   AND r.repo_id      = stats_daily_developer.repo_id
                   AND r.date         = stats_daily_developer.date
                   AND r.rn = 1
             )
             WHERE repo_id = ? AND date = ?",
        )
        .bind(repo_id)
        .bind(date)
        .bind(repo_id)
        .bind(date)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

// ── Step 5 — stats_daily_file ─────────────────────────────────────────────────

async fn insert_daily_file(tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>) -> Result<(), AggError> {
    sqlx::query(
        "INSERT INTO stats_daily_file
             (id, file_id, date, commits, insertions, deletions, churn_score)
         SELECT lower(hex(randomblob(16))),
                cfc.file_id,
                date(c.committed_at),
                COUNT(DISTINCT c.id),
                SUM(cfc.insertions),
                SUM(cfc.deletions),
                CAST(SUM(cfc.insertions) + SUM(cfc.deletions) AS REAL)
         FROM commit_file_changes cfc
         JOIN commits c ON cfc.commit_id = c.id
         GROUP BY cfc.file_id, date(c.committed_at)",
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_daily_file_scopes(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    scopes: &[(String, String)],
) -> Result<(), AggError> {
    for (repo_id, date) in scopes {
        sqlx::query(
            "INSERT INTO stats_daily_file
                 (id, file_id, date, commits, insertions, deletions, churn_score)
             SELECT lower(hex(randomblob(16))),
                    cfc.file_id,
                    date(c.committed_at),
                    COUNT(DISTINCT c.id),
                    SUM(cfc.insertions),
                    SUM(cfc.deletions),
                    CAST(SUM(cfc.insertions) + SUM(cfc.deletions) AS REAL)
             FROM commit_file_changes cfc
             JOIN commits c ON cfc.commit_id = c.id
             WHERE c.repo_id = ? AND date(c.committed_at) = ?
             GROUP BY cfc.file_id, date(c.committed_at)",
        )
        .bind(repo_id)
        .bind(date)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

// ── Step 6 — stats_daily_directory (immediate parent) ────────────────────────

async fn insert_daily_directory(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), AggError> {
    // SQLite has no reverse(); compute the parent directory in Rust.
    // Files at the root map to directory_path = ''.
    let rows: Vec<(String, String, String, String, String, i64, i64)> = sqlx::query_as(
        "SELECT c.repo_id, f.current_path, date(c.committed_at),
                c.id, cfc.file_id, cfc.insertions, cfc.deletions
         FROM commit_file_changes cfc
         JOIN commits c ON cfc.commit_id = c.id
         JOIN files   f ON cfc.file_id   = f.id",
    )
    .fetch_all(&mut **tx)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    insert_daily_directory_rows(tx, rows).await
}

async fn insert_daily_directory_scopes(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    scopes: &[(String, String)],
) -> Result<(), AggError> {
    for (repo_id, date) in scopes {
        let rows: Vec<(String, String, String, String, String, i64, i64)> = sqlx::query_as(
            "SELECT c.repo_id, f.current_path, date(c.committed_at),
                    c.id, cfc.file_id, cfc.insertions, cfc.deletions
             FROM commit_file_changes cfc
             JOIN commits c ON cfc.commit_id = c.id
             JOIN files   f ON cfc.file_id   = f.id
             WHERE c.repo_id = ? AND date(c.committed_at) = ?",
        )
        .bind(repo_id)
        .bind(date)
        .fetch_all(&mut **tx)
        .await?;

        insert_daily_directory_rows(tx, rows).await?;
    }
    Ok(())
}

async fn insert_daily_directory_rows(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    rows: Vec<(String, String, String, String, String, i64, i64)>,
) -> Result<(), AggError> {
    if rows.is_empty() {
        return Ok(());
    }

    type Key = (String, String, String);
    let mut agg: HashMap<Key, (HashSet<String>, HashSet<String>, i64, i64)> = HashMap::new();

    for (repo_id, path, date, commit_id, file_id, ins, del) in rows {
        let dir = std::path::Path::new(&path)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_string();
        let e = agg.entry((repo_id, dir, date)).or_default();
        e.0.insert(commit_id);
        e.1.insert(file_id);
        e.2 += ins;
        e.3 += del;
    }

    for ((repo_id, dir, date), (commits, files, ins, del)) in agg {
        sqlx::query(
            "INSERT INTO stats_daily_directory
                 (id, repo_id, directory_path, date,
                  commits, insertions, deletions, files_touched)
             VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&repo_id)
        .bind(&dir)
        .bind(&date)
        .bind(commits.len() as i64)
        .bind(ins)
        .bind(del)
        .bind(files.len() as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

// ── Step 7 — stats_developer_global ──────────────────────────────────────────

async fn insert_global_developer(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), AggError> {
    sqlx::query(
        "WITH daily_agg AS (
             SELECT developer_id,
                    SUM(commits)    AS total_commits,
                    SUM(insertions) AS total_insertions,
                    SUM(deletions)  AS total_deletions,
                    COUNT(*)        AS active_days,
                    MAX(streak)     AS longest_streak,
                    MIN(date)       AS first_date,
                    MAX(date)       AS last_date
             FROM stats_daily_developer
             WHERE commits > 0
             GROUP BY developer_id
         ),
         unique_files AS (
             SELECT a.developer_id,
                    COUNT(DISTINCT cfc.file_id) AS files_touched
             FROM commit_file_changes cfc
             JOIN commits c ON cfc.commit_id = c.id
             JOIN aliases a ON c.author_alias_id = a.id
             GROUP BY a.developer_id
         )
         INSERT INTO stats_developer_global
             (id, developer_id,
              total_commits, total_insertions, total_deletions,
              files_touched, active_days, longest_streak,
              avg_commit_size, first_commit_at, last_commit_at)
         SELECT lower(hex(randomblob(16))),
                d.developer_id,
                d.total_commits,
                d.total_insertions,
                d.total_deletions,
                COALESCE(f.files_touched, 0),
                d.active_days,
                d.longest_streak,
                CAST(d.total_insertions + d.total_deletions AS REAL)
                    / NULLIF(d.total_commits, 0),
                d.first_date,
                d.last_date
         FROM daily_agg d
         LEFT JOIN unique_files f ON f.developer_id = d.developer_id",
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn collect_affected_developers(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    scopes: &[(String, String)],
) -> Result<Vec<String>, AggError> {
    let mut developer_ids = HashSet::new();
    for (repo_id, date) in scopes {
        let existing: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT developer_id
             FROM stats_daily_developer
             WHERE repo_id = ? AND date = ?",
        )
        .bind(repo_id)
        .bind(date)
        .fetch_all(&mut **tx)
        .await?;
        developer_ids.extend(existing);

        let raw: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT a.developer_id
             FROM commits c
             JOIN aliases a ON c.author_alias_id = a.id
             WHERE c.repo_id = ? AND date(c.committed_at) = ?",
        )
        .bind(repo_id)
        .bind(date)
        .fetch_all(&mut **tx)
        .await?;
        developer_ids.extend(raw);
    }

    let mut developer_ids: Vec<String> = developer_ids.into_iter().collect();
    developer_ids.sort();
    Ok(developer_ids)
}

async fn refresh_global_developers(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    developer_ids: &[String],
) -> Result<(), AggError> {
    for developer_id in developer_ids {
        sqlx::query("DELETE FROM stats_developer_global WHERE developer_id = ?")
            .bind(developer_id)
            .execute(&mut **tx)
            .await?;

        sqlx::query(
            "WITH daily_agg AS (
                 SELECT developer_id,
                        SUM(commits)    AS total_commits,
                        SUM(insertions) AS total_insertions,
                        SUM(deletions)  AS total_deletions,
                        COUNT(*)        AS active_days,
                        MAX(streak)     AS longest_streak,
                        MIN(date)       AS first_date,
                        MAX(date)       AS last_date
                 FROM stats_daily_developer
                 WHERE commits > 0 AND developer_id = ?
                 GROUP BY developer_id
             ),
             unique_files AS (
                 SELECT a.developer_id,
                        COUNT(DISTINCT cfc.file_id) AS files_touched
                 FROM commit_file_changes cfc
                 JOIN commits c ON cfc.commit_id = c.id
                 JOIN aliases a ON c.author_alias_id = a.id
                 WHERE a.developer_id = ?
                 GROUP BY a.developer_id
             )
             INSERT INTO stats_developer_global
                 (id, developer_id,
                  total_commits, total_insertions, total_deletions,
                  files_touched, active_days, longest_streak,
                  avg_commit_size, first_commit_at, last_commit_at)
             SELECT lower(hex(randomblob(16))),
                    d.developer_id,
                    d.total_commits,
                    d.total_insertions,
                    d.total_deletions,
                    COALESCE(f.files_touched, 0),
                    d.active_days,
                    d.longest_streak,
                    CAST(d.total_insertions + d.total_deletions AS REAL)
                        / NULLIF(d.total_commits, 0),
                    d.first_date,
                    d.last_date
             FROM daily_agg d
             LEFT JOIN unique_files f ON f.developer_id = d.developer_id",
        )
        .bind(developer_id)
        .bind(developer_id)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

// ── Step 8 — stats_file_global ────────────────────────────────────────────────

async fn insert_global_file(tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>) -> Result<(), AggError> {
    sqlx::query(
        "INSERT INTO stats_file_global
             (id, file_id,
              commit_count, total_insertions, total_deletions,
              unique_authors, churn_score, co_touch_score,
              first_seen_at, last_seen_at)
         SELECT lower(hex(randomblob(16))),
                f.id,
                COUNT(DISTINCT cfc.commit_id),
                COALESCE(SUM(cfc.insertions), 0),
                COALESCE(SUM(cfc.deletions),  0),
                COUNT(DISTINCT a.developer_id),
                -- churn = total_churn / max(age_days, 1)
                CAST(COALESCE(SUM(cfc.insertions), 0)
                     + COALESCE(SUM(cfc.deletions), 0) AS REAL)
                / MAX(
                    CAST(
                        julianday(MAX(c.committed_at))
                        - julianday(MIN(c.committed_at))
                    AS REAL) + 1,
                    1
                  ),
                0.0,   -- co_touch_score: deferred
                MIN(c.committed_at),
                MAX(c.committed_at)
         FROM files f
         LEFT JOIN commit_file_changes cfc ON cfc.file_id         = f.id
         LEFT JOIN commits              c   ON c.id                = cfc.commit_id
         LEFT JOIN aliases              a   ON a.id                = c.author_alias_id
         GROUP BY f.id",
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn collect_affected_files(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    scopes: &[(String, String)],
) -> Result<Vec<String>, AggError> {
    let mut file_ids = HashSet::new();
    for (repo_id, date) in scopes {
        let existing: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT sdf.file_id
             FROM stats_daily_file sdf
             JOIN files f ON f.id = sdf.file_id
             WHERE f.repo_id = ? AND sdf.date = ?",
        )
        .bind(repo_id)
        .bind(date)
        .fetch_all(&mut **tx)
        .await?;
        file_ids.extend(existing);

        let raw: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT cfc.file_id
             FROM commit_file_changes cfc
             JOIN commits c ON c.id = cfc.commit_id
             WHERE c.repo_id = ? AND date(c.committed_at) = ?",
        )
        .bind(repo_id)
        .bind(date)
        .fetch_all(&mut **tx)
        .await?;
        file_ids.extend(raw);
    }

    let mut file_ids: Vec<String> = file_ids.into_iter().collect();
    file_ids.sort();
    Ok(file_ids)
}

async fn refresh_global_files(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    file_ids: &[String],
) -> Result<(), AggError> {
    for file_id in file_ids {
        sqlx::query("DELETE FROM stats_file_global WHERE file_id = ?")
            .bind(file_id)
            .execute(&mut **tx)
            .await?;

        sqlx::query(
            "INSERT INTO stats_file_global
                 (id, file_id,
                  commit_count, total_insertions, total_deletions,
                  unique_authors, churn_score, co_touch_score,
                  first_seen_at, last_seen_at)
             SELECT lower(hex(randomblob(16))),
                    f.id,
                    COUNT(DISTINCT cfc.commit_id),
                    COALESCE(SUM(cfc.insertions), 0),
                    COALESCE(SUM(cfc.deletions),  0),
                    COUNT(DISTINCT a.developer_id),
                    CAST(COALESCE(SUM(cfc.insertions), 0)
                         + COALESCE(SUM(cfc.deletions), 0) AS REAL)
                    / MAX(
                        CAST(
                            julianday(MAX(c.committed_at))
                            - julianday(MIN(c.committed_at))
                        AS REAL) + 1,
                        1
                      ),
                    0.0,
                    MIN(c.committed_at),
                    MAX(c.committed_at)
             FROM files f
             LEFT JOIN commit_file_changes cfc ON cfc.file_id = f.id
             LEFT JOIN commits              c   ON c.id       = cfc.commit_id
             LEFT JOIN aliases              a   ON a.id       = c.author_alias_id
             WHERE f.id = ?
             GROUP BY f.id",
        )
        .bind(file_id)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

// ── Step 9 — stats_directory_global ──────────────────────────────────────────

async fn insert_global_directory(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), AggError> {
    sqlx::query(
        "INSERT INTO stats_directory_global
             (id, repo_id, directory_path,
              commit_count, total_insertions, total_deletions,
              files_touched, unique_authors, churn_score)
         SELECT lower(hex(randomblob(16))),
                repo_id, directory_path,
                SUM(commits),
                SUM(insertions),
                SUM(deletions),
                SUM(files_touched),
                0,    -- unique_authors: deferred
                0.0   -- churn_score: deferred
         FROM stats_daily_directory
         GROUP BY repo_id, directory_path",
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn refresh_global_directories_for_repos(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    repo_ids: &[String],
) -> Result<(), AggError> {
    for repo_id in repo_ids {
        sqlx::query("DELETE FROM stats_directory_global WHERE repo_id = ?")
            .bind(repo_id)
            .execute(&mut **tx)
            .await?;

        sqlx::query(
            "INSERT INTO stats_directory_global
                 (id, repo_id, directory_path,
                  commit_count, total_insertions, total_deletions,
                  files_touched, unique_authors, churn_score)
             SELECT lower(hex(randomblob(16))),
                    repo_id, directory_path,
                    SUM(commits),
                    SUM(insertions),
                    SUM(deletions),
                    SUM(files_touched),
                    0,
                    0.0
             FROM stats_daily_directory
             WHERE repo_id = ?
             GROUP BY repo_id, directory_path",
        )
        .bind(repo_id)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

// ── Step 10 — player scores (Rust + evalexpr) ─────────────────────────────────

type DailyDeveloperScoreRow = (String, String, i64, i64, i64, i64, i64);

async fn update_player_scores(pool: &SqlitePool) -> Result<(), AggError> {
    let formula: String =
        sqlx::query_scalar("SELECT expression FROM metric_formulas WHERE name = 'player_score'")
            .fetch_one(pool)
            .await?;

    // Fetch all daily rows ordered so we can group by developer.
    let rows: Vec<DailyDeveloperScoreRow> = sqlx::query_as(
        "SELECT id, developer_id, commits, insertions, deletions, files_touched, streak
         FROM stats_daily_developer
         ORDER BY developer_id, date",
    )
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    // Compute raw score per row, grouped by developer.
    let mut raw_by_dev: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    for (id, dev_id, commits, ins, del, files, streak) in &rows {
        let raw = evaluate_raw_score(&formula, *commits, *ins, *del, *files, *streak)?;
        raw_by_dev
            .entry(dev_id.clone())
            .or_default()
            .push((id.clone(), raw));
    }

    // Convert raw → percentile and persist.
    let mut tx = pool.begin().await?;
    for raws in raw_by_dev.values() {
        for (row_id, pct) in percentile_scores(raws) {
            sqlx::query("UPDATE stats_daily_developer SET player_score = ? WHERE id = ?")
                .bind(pct)
                .bind(&row_id)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;

    Ok(())
}

async fn update_player_scores_for_developers(
    pool: &SqlitePool,
    developer_ids: &[String],
) -> Result<(), AggError> {
    if developer_ids.is_empty() {
        return Ok(());
    }

    let formula: String =
        sqlx::query_scalar("SELECT expression FROM metric_formulas WHERE name = 'player_score'")
            .fetch_one(pool)
            .await?;

    let affected_developers = developer_ids.iter().cloned().collect::<HashSet<_>>();
    let rows: Vec<DailyDeveloperScoreRow> = sqlx::query_as(
        "SELECT id, developer_id, commits, insertions, deletions, files_touched, streak
         FROM stats_daily_developer
         ORDER BY developer_id, date",
    )
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    let mut raw_by_dev: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    for (id, dev_id, commits, ins, del, files, streak) in &rows {
        if !affected_developers.contains(dev_id) {
            continue;
        }

        let raw = evaluate_raw_score(&formula, *commits, *ins, *del, *files, *streak)?;
        raw_by_dev
            .entry(dev_id.clone())
            .or_default()
            .push((id.clone(), raw));
    }

    let mut tx = pool.begin().await?;
    for raws in raw_by_dev.values() {
        for (row_id, pct) in percentile_scores(raws) {
            sqlx::query("UPDATE stats_daily_developer SET player_score = ? WHERE id = ?")
                .bind(pct)
                .bind(&row_id)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;

    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use chrono::Utc;
    use git2::{Repository, Signature, Time};
    use std::path::Path;
    use tempfile::TempDir;
    use uuid::Uuid;

    // ── Git + DB helpers ──────────────────────────────────────────────────────

    fn init_repo(dir: &Path) -> Repository {
        Repository::init(dir).unwrap()
    }

    /// Create a commit with a fixed Unix timestamp (seconds since epoch).
    fn commit_at(
        repo: &Repository,
        msg: &str,
        author: &str,
        email: &str,
        files: &[(&str, &str)],
        ts: i64,
    ) {
        let workdir = repo.workdir().unwrap().to_owned();
        for (name, content) in files {
            let p = workdir.join(name);
            if let Some(par) = p.parent() {
                std::fs::create_dir_all(par).unwrap();
            }
            std::fs::write(p, content).unwrap();
        }
        let mut idx = repo.index().unwrap();
        for (name, _) in files {
            idx.add_path(Path::new(name)).unwrap();
        }
        idx.write().unwrap();
        let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
        let sig = Signature::new(author, email, &Time::new(ts, 0)).unwrap();
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.as_ref().into_iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)
            .unwrap();
    }

    async fn seed_repo_record(pool: &SqlitePool, path: &Path) -> String {
        let now = Utc::now().to_rfc3339();
        let ws = Uuid::new_v4().to_string();
        let rid = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO workspaces (id,name,created_at) VALUES(?,?,?)")
            .bind(&ws)
            .bind("ws")
            .bind(&now)
            .execute(pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO repos (id,workspace_id,name,path,active_branch,created_at)
             VALUES(?,?,?,?,?,?)",
        )
        .bind(&rid)
        .bind(&ws)
        .bind("r")
        .bind(path.to_str().unwrap())
        .bind("master")
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
        rid
    }

    /// Scan + recalculate helper.
    async fn setup(pool: &SqlitePool, tmp: &TempDir) -> String {
        let rid = seed_repo_record(pool, tmp.path()).await;
        crate::git::scan_repo(pool, &rid, tmp.path(), "master")
            .await
            .unwrap();
        recalculate_all(pool).await.unwrap();
        rid
    }

    // Dates (Unix timestamps):
    // 2024-01-01 = 1704067200
    // 2024-01-02 = 1704153600
    // 2024-01-03 = 1704240000
    // 2024-01-05 = 1704412800  (gap: no 2024-01-04)
    const D1: i64 = 1704067200;
    const D2: i64 = 1704153600;
    const D3: i64 = 1704240000;
    const D5: i64 = 1704412800;

    // ── recalculate_all on empty DB ───────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn recalculate_empty_db_is_noop() {
        let pool = test_pool().await;
        recalculate_all(&pool).await.unwrap();

        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stats_daily_developer")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0);
    }

    // ── stats_daily_developer ─────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn daily_developer_row_created_per_active_day() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);

        setup(&pool, &tmp).await;

        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stats_daily_developer")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn daily_developer_commit_count_is_correct() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        // Two commits on the same day.
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D1 + 60); // same day

        setup(&pool, &tmp).await;

        let commits: i64 = sqlx::query_scalar("SELECT commits FROM stats_daily_developer LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(commits, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn daily_developer_files_touched_counts_distinct_files() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[("a.txt", "1"), ("b.txt", "2")],
            D1,
        );

        setup(&pool, &tmp).await;

        let files: i64 =
            sqlx::query_scalar("SELECT files_touched FROM stats_daily_developer LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(files, 2);
    }

    // ── streaks ───────────────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn streak_increments_on_consecutive_days() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);
        commit_at(&repo, "c3", "Alice", "a@x.com", &[("c.txt", "3")], D3);

        setup(&pool, &tmp).await;

        let streaks: Vec<i64> =
            sqlx::query_scalar("SELECT streak FROM stats_daily_developer ORDER BY date")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(streaks, vec![1, 2, 3]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn streak_resets_after_gap() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);
        // Skip D3
        commit_at(&repo, "c3", "Alice", "a@x.com", &[("c.txt", "3")], D5);

        setup(&pool, &tmp).await;

        let streaks: Vec<i64> =
            sqlx::query_scalar("SELECT streak FROM stats_daily_developer ORDER BY date")
                .fetch_all(&pool)
                .await
                .unwrap();
        // D1=1, D2=2, D5=1 (new island after gap)
        assert_eq!(streaks, vec![1, 2, 1]);
    }

    // ── stats_developer_global ────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn global_developer_totals_are_correct() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "22")], D2);

        setup(&pool, &tmp).await;

        let (total_commits, active_days): (i64, i64) =
            sqlx::query_as("SELECT total_commits, active_days FROM stats_developer_global")
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(total_commits, 2);
        assert_eq!(active_days, 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn global_developer_longest_streak_is_max() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);
        commit_at(&repo, "c3", "Alice", "a@x.com", &[("c.txt", "3")], D3);
        commit_at(&repo, "c4", "Alice", "a@x.com", &[("d.txt", "4")], D5); // new island

        setup(&pool, &tmp).await;

        let longest: i64 = sqlx::query_scalar("SELECT longest_streak FROM stats_developer_global")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(longest, 3);
    }

    // ── stats_daily_file ──────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn daily_file_row_per_touched_file_per_day() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[("x.rs", "fn x(){}"), ("y.rs", "fn y(){}")],
            D1,
        );

        setup(&pool, &tmp).await;

        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stats_daily_file")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 2);
    }

    // ── stats_file_global ─────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn global_file_unique_authors_counts_distinct_devs() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("z.rs", "v1")], D1);
        commit_at(&repo, "c2", "Bob", "b@x.com", &[("z.rs", "v2")], D2);

        setup(&pool, &tmp).await;

        let authors: i64 = sqlx::query_scalar("SELECT unique_authors FROM stats_file_global")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(authors, 2);
    }

    // ── stats_daily_directory ─────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn daily_directory_row_for_subdirectory_file() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(
            &repo,
            "c1",
            "Alice",
            "a@x.com",
            &[("src/main.rs", "fn main(){}")],
            D1,
        );

        setup(&pool, &tmp).await;

        let dir: String = sqlx::query_scalar("SELECT directory_path FROM stats_daily_directory")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(dir, "src");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn daily_directory_row_for_root_file() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("readme.md", "hi")], D1);

        setup(&pool, &tmp).await;

        let dir: String = sqlx::query_scalar("SELECT directory_path FROM stats_daily_directory")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(dir, "");
    }

    // ── player scores ─────────────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn player_score_is_set_after_recalculate() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);

        setup(&pool, &tmp).await;

        let score: f64 = sqlx::query_scalar("SELECT player_score FROM stats_daily_developer")
            .fetch_one(&pool)
            .await
            .unwrap();
        // Single row → 100th percentile
        assert!((score - 100.0).abs() < 1e-9, "got {score}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn player_score_varies_with_activity() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        // Day 1: 1 commit; Day 2: 3 commits — day 2 should score higher.
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);
        commit_at(&repo, "c3", "Alice", "a@x.com", &[("c.txt", "3")], D2 + 1);
        commit_at(&repo, "c4", "Alice", "a@x.com", &[("d.txt", "4")], D2 + 2);

        setup(&pool, &tmp).await;

        let scores: Vec<f64> =
            sqlx::query_scalar("SELECT player_score FROM stats_daily_developer ORDER BY date")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(scores.len(), 2);
        // Day 2 (more commits) must be at a higher percentile than Day 1.
        assert!(
            scores[1] > scores[0],
            "day2={} day1={}",
            scores[1],
            scores[0]
        );
    }

    // ── scoped recalculation ─────────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn scoped_recalculate_keeps_non_dirty_daily_rows_unchanged() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(&repo, "c2", "Alice", "a@x.com", &[("b.txt", "2")], D2);

        let rid = setup(&pool, &tmp).await;

        let untouched_before: (String, i64, i64, i64, i64, i64, Option<String>, f64) =
            sqlx::query_as(
                "SELECT id, commits, insertions, deletions, files_touched, streak, top_file_id, player_score
                 FROM stats_daily_developer
                 WHERE repo_id = ? AND date = '2024-01-02'",
            )
            .bind(&rid)
            .fetch_one(&pool)
            .await
            .unwrap();

        sqlx::query(
            "UPDATE stats_daily_developer
             SET commits = 99, insertions = 99, deletions = 99, files_touched = 99
             WHERE repo_id = ? AND date = '2024-01-01'",
        )
        .bind(&rid)
        .execute(&pool)
        .await
        .unwrap();

        recalculate_repo_dates(&pool, &[(rid.clone(), "2024-01-01".to_string())])
            .await
            .unwrap();

        let dirty_commits: i64 = sqlx::query_scalar(
            "SELECT commits FROM stats_daily_developer WHERE repo_id = ? AND date = '2024-01-01'",
        )
        .bind(&rid)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(dirty_commits, 1);

        let untouched_after: (String, i64, i64, i64, i64, i64, Option<String>, f64) =
            sqlx::query_as(
                "SELECT id, commits, insertions, deletions, files_touched, streak, top_file_id, player_score
                 FROM stats_daily_developer
                 WHERE repo_id = ? AND date = '2024-01-02'",
            )
            .bind(&rid)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(untouched_after, untouched_before);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scoped_recalculate_keeps_unaffected_repo_rows_unchanged() {
        let pool = test_pool().await;

        let dirty_tmp = TempDir::new().unwrap();
        let dirty_repo = init_repo(dirty_tmp.path());
        commit_at(
            &dirty_repo,
            "dirty",
            "Alice",
            "a@x.com",
            &[("a.txt", "1")],
            D1,
        );
        let dirty_rid = setup(&pool, &dirty_tmp).await;

        let other_tmp = TempDir::new().unwrap();
        let other_repo = init_repo(other_tmp.path());
        commit_at(
            &other_repo,
            "other",
            "Bob",
            "b@x.com",
            &[("b.txt", "2")],
            D1,
        );
        let other_rid = setup(&pool, &other_tmp).await;

        let other_before: (String, i64, i64, i64, i64, i64, Option<String>, f64) =
            sqlx::query_as(
                "SELECT id, commits, insertions, deletions, files_touched, streak, top_file_id, player_score
                 FROM stats_daily_developer
                 WHERE repo_id = ? AND date = '2024-01-01'",
            )
            .bind(&other_rid)
            .fetch_one(&pool)
            .await
            .unwrap();

        sqlx::query(
            "UPDATE stats_daily_developer
             SET commits = 99, insertions = 99, deletions = 99, files_touched = 99
             WHERE repo_id = ? AND date = '2024-01-01'",
        )
        .bind(&dirty_rid)
        .execute(&pool)
        .await
        .unwrap();

        recalculate_repo_dates(&pool, &[(dirty_rid.clone(), "2024-01-01".to_string())])
            .await
            .unwrap();

        let dirty_commits: i64 = sqlx::query_scalar(
            "SELECT commits FROM stats_daily_developer WHERE repo_id = ? AND date = '2024-01-01'",
        )
        .bind(&dirty_rid)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(dirty_commits, 1);

        let other_after: (String, i64, i64, i64, i64, i64, Option<String>, f64) = sqlx::query_as(
            "SELECT id, commits, insertions, deletions, files_touched, streak, top_file_id, player_score
                 FROM stats_daily_developer
                 WHERE repo_id = ? AND date = '2024-01-01'",
        )
        .bind(&other_rid)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(other_after, other_before);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scoped_recalculate_refreshes_all_scores_for_affected_developer() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        let medium_file = "1\n2\n3\n4\n5";
        let large_file = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10";

        commit_at(&repo, "c1", "Alice", "a@x.com", &[("a.txt", "1")], D1);
        commit_at(
            &repo,
            "c2",
            "Alice",
            "a@x.com",
            &[("b.txt", medium_file)],
            D2,
        );
        let rid = setup(&pool, &tmp).await;

        commit_at(
            &repo,
            "c3",
            "Alice",
            "a@x.com",
            &[("c.txt", large_file)],
            D3,
        );
        crate::git::scan_repo(&pool, &rid, tmp.path(), "master")
            .await
            .unwrap();

        recalculate_repo_dates(&pool, &[(rid.clone(), "2024-01-03".to_string())])
            .await
            .unwrap();

        let scores: Vec<f64> = sqlx::query_scalar(
            "SELECT player_score
             FROM stats_daily_developer
             WHERE repo_id = ?
             ORDER BY date",
        )
        .bind(&rid)
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(scores.len(), 3);
        assert!(
            scores[0] < scores[1] && scores[1] < scores[2],
            "scores should be re-percentiled across all affected developer rows: {scores:?}"
        );
    }

    // ── alias merge → recalculate ─────────────────────────────────────────────

    #[tokio::test(flavor = "multi_thread")]
    async fn recalculate_after_alias_merge_combines_stats() {
        let pool = test_pool().await;
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path());
        // Two authors on different days.
        commit_at(
            &repo,
            "c1",
            "alice",
            "alice@work.com",
            &[("a.txt", "1")],
            D1,
        );
        commit_at(
            &repo,
            "c2",
            "Alice W.",
            "alice@personal.com",
            &[("b.txt", "2")],
            D2,
        );

        let rid = seed_repo_record(&pool, tmp.path()).await;
        crate::git::scan_repo(&pool, &rid, tmp.path(), "master")
            .await
            .unwrap();

        // Before merge: 2 separate developers.
        let before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM developers")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(before, 2);

        // Merge alice@personal.com's developer into alice@work.com's developer.
        let src_id: String = sqlx::query_scalar(
            "SELECT a.developer_id FROM aliases a WHERE a.git_email='alice@personal.com'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let tgt_id: String = sqlx::query_scalar(
            "SELECT a.developer_id FROM aliases a WHERE a.git_email='alice@work.com'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        crate::alias::merge_developers(&pool, &src_id, &tgt_id)
            .await
            .unwrap();
        recalculate_all(&pool).await.unwrap();

        // After merge + recalc: 1 developer with combined stats.
        let global: (i64, i64) =
            sqlx::query_as("SELECT total_commits, active_days FROM stats_developer_global")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(global.0, 2, "combined commits");
        assert_eq!(global.1, 2, "combined active days");
    }
}
