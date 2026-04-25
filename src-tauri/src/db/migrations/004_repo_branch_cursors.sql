-- =============================================================
-- Migration 004 — Per-branch repository scan cursors
-- =============================================================

CREATE TABLE repo_branch_cursors (
    repo_id                   TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    branch_name               TEXT NOT NULL,
    last_indexed_commit_sha   TEXT NOT NULL,
    last_scan_run_id          TEXT REFERENCES scan_runs(id) ON DELETE SET NULL,
    updated_at                TEXT NOT NULL,
    PRIMARY KEY (repo_id, branch_name)
);

CREATE INDEX idx_repo_branch_cursors_repo ON repo_branch_cursors(repo_id);
CREATE INDEX idx_repo_branch_cursors_scan_run ON repo_branch_cursors(last_scan_run_id);
