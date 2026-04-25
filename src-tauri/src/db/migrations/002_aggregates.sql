-- =============================================================
-- Migration 002 — Layer 3 (precalculated aggregates)
-- These tables are fully derived and can be dropped/rebuilt at any time.
-- =============================================================

-- ---------------------------------------------------------------
-- Per (developer, repo, date)
-- ---------------------------------------------------------------
CREATE TABLE stats_daily_developer (
    id             TEXT PRIMARY KEY,
    developer_id   TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    repo_id        TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    date           TEXT NOT NULL,  -- YYYY-MM-DD
    commits        INTEGER NOT NULL DEFAULT 0,
    insertions     INTEGER NOT NULL DEFAULT 0,
    deletions      INTEGER NOT NULL DEFAULT 0,
    files_touched  INTEGER NOT NULL DEFAULT 0,
    streak         INTEGER NOT NULL DEFAULT 0,
    player_score   REAL    NOT NULL DEFAULT 0,
    top_file_id    TEXT REFERENCES files(id),
    UNIQUE (developer_id, repo_id, date)
);

CREATE INDEX idx_sdd_developer ON stats_daily_developer(developer_id);
CREATE INDEX idx_sdd_repo      ON stats_daily_developer(repo_id);
CREATE INDEX idx_sdd_date      ON stats_daily_developer(date);

-- ---------------------------------------------------------------
-- Per (file, date)
-- ---------------------------------------------------------------
CREATE TABLE stats_daily_file (
    id           TEXT PRIMARY KEY,
    file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    date         TEXT NOT NULL,   -- YYYY-MM-DD
    commits      INTEGER NOT NULL DEFAULT 0,
    insertions   INTEGER NOT NULL DEFAULT 0,
    deletions    INTEGER NOT NULL DEFAULT 0,
    churn_score  REAL    NOT NULL DEFAULT 0,
    UNIQUE (file_id, date)
);

CREATE INDEX idx_sdf_file ON stats_daily_file(file_id);
CREATE INDEX idx_sdf_date ON stats_daily_file(date);

-- ---------------------------------------------------------------
-- Per (repo, directory_path, date)
-- ---------------------------------------------------------------
CREATE TABLE stats_daily_directory (
    id             TEXT PRIMARY KEY,
    repo_id        TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    directory_path TEXT NOT NULL,
    date           TEXT NOT NULL,  -- YYYY-MM-DD
    commits        INTEGER NOT NULL DEFAULT 0,
    insertions     INTEGER NOT NULL DEFAULT 0,
    deletions      INTEGER NOT NULL DEFAULT 0,
    files_touched  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (repo_id, directory_path, date)
);

CREATE INDEX idx_sdir_repo ON stats_daily_directory(repo_id);
CREATE INDEX idx_sdir_date ON stats_daily_directory(date);

-- ---------------------------------------------------------------
-- All-time per developer
-- ---------------------------------------------------------------
CREATE TABLE stats_developer_global (
    id              TEXT PRIMARY KEY,
    developer_id    TEXT NOT NULL UNIQUE REFERENCES developers(id) ON DELETE CASCADE,
    total_commits   INTEGER NOT NULL DEFAULT 0,
    total_insertions INTEGER NOT NULL DEFAULT 0,
    total_deletions  INTEGER NOT NULL DEFAULT 0,
    files_touched   INTEGER NOT NULL DEFAULT 0,
    active_days     INTEGER NOT NULL DEFAULT 0,
    longest_streak  INTEGER NOT NULL DEFAULT 0,
    avg_commit_size REAL    NOT NULL DEFAULT 0,
    first_commit_at TEXT,
    last_commit_at  TEXT
);

-- ---------------------------------------------------------------
-- All-time per file
-- ---------------------------------------------------------------
CREATE TABLE stats_file_global (
    id              TEXT PRIMARY KEY,
    file_id         TEXT NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
    commit_count    INTEGER NOT NULL DEFAULT 0,
    total_insertions INTEGER NOT NULL DEFAULT 0,
    total_deletions  INTEGER NOT NULL DEFAULT 0,
    unique_authors  INTEGER NOT NULL DEFAULT 0,
    churn_score     REAL    NOT NULL DEFAULT 0,
    co_touch_score  REAL    NOT NULL DEFAULT 0,
    first_seen_at   TEXT,
    last_seen_at    TEXT
);

-- ---------------------------------------------------------------
-- All-time per directory
-- ---------------------------------------------------------------
CREATE TABLE stats_directory_global (
    id              TEXT PRIMARY KEY,
    repo_id         TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    directory_path  TEXT NOT NULL,
    commit_count    INTEGER NOT NULL DEFAULT 0,
    total_insertions INTEGER NOT NULL DEFAULT 0,
    total_deletions  INTEGER NOT NULL DEFAULT 0,
    files_touched   INTEGER NOT NULL DEFAULT 0,
    unique_authors  INTEGER NOT NULL DEFAULT 0,
    churn_score     REAL    NOT NULL DEFAULT 0,
    UNIQUE (repo_id, directory_path)
);

CREATE INDEX idx_sdg_repo ON stats_directory_global(repo_id);
