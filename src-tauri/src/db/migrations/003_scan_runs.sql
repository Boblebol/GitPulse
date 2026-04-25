-- =============================================================
-- Migration 003 — Persistent scan run state
-- =============================================================

CREATE TABLE scan_runs (
    id                TEXT PRIMARY KEY,
    repo_id           TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    branch            TEXT NOT NULL,
    target_head_sha   TEXT NOT NULL,
    cursor_sha        TEXT,
    status            TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'failed')),
    commits_indexed   INTEGER NOT NULL DEFAULT 0,
    files_processed   INTEGER NOT NULL DEFAULT 0,
    error_message     TEXT,
    started_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    completed_at      TEXT
);

CREATE INDEX idx_scan_runs_repo ON scan_runs(repo_id);
CREATE INDEX idx_scan_runs_status ON scan_runs(status);
CREATE INDEX idx_scan_runs_repo_status ON scan_runs(repo_id, status);
