-- =============================================================
-- Migration 005 — Dirty aggregate recomputation scopes
-- =============================================================

CREATE TABLE dirty_aggregate_scopes (
    repo_id    TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (repo_id, date)
);

CREATE INDEX idx_dirty_aggregate_scopes_repo ON dirty_aggregate_scopes(repo_id);
CREATE INDEX idx_dirty_aggregate_scopes_date ON dirty_aggregate_scopes(date);
