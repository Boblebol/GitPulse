-- =============================================================
-- Migration 001 — Layer 1 (raw facts) + Layer 2 (reference data)
-- =============================================================

-- ---------------------------------------------------------------
-- Layer 2 — Workspaces & Repos
-- ---------------------------------------------------------------
CREATE TABLE workspaces (
    id          TEXT PRIMARY KEY,   -- UUID
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL       -- ISO-8601 UTC
);

CREATE TABLE repos (
    id                      TEXT PRIMARY KEY,  -- UUID
    workspace_id            TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    path                    TEXT NOT NULL UNIQUE,
    active_branch           TEXT NOT NULL DEFAULT 'main',
    last_indexed_commit_sha TEXT,              -- NULL = never scanned
    created_at              TEXT NOT NULL
);

CREATE TABLE workspace_repos (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo_id      TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    PRIMARY KEY (workspace_id, repo_id)
);

-- ---------------------------------------------------------------
-- Layer 2 — Developers & Aliases
-- ---------------------------------------------------------------
CREATE TABLE developers (
    id         TEXT PRIMARY KEY,  -- UUID
    name       TEXT NOT NULL,     -- canonical display name
    created_at TEXT NOT NULL
);

CREATE TABLE aliases (
    id           TEXT PRIMARY KEY,  -- UUID
    developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    git_name     TEXT NOT NULL,
    git_email    TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    UNIQUE (git_name, git_email)
);

CREATE INDEX idx_aliases_developer ON aliases(developer_id);
CREATE INDEX idx_aliases_email     ON aliases(git_email);

-- ---------------------------------------------------------------
-- Layer 2 — Files & rename history
-- ---------------------------------------------------------------
CREATE TABLE files (
    id           TEXT PRIMARY KEY,  -- UUID (stable across renames)
    repo_id      TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    current_path TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    UNIQUE (repo_id, current_path)
);

CREATE TABLE file_name_history (
    id         TEXT PRIMARY KEY,
    file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    old_path   TEXT NOT NULL,
    new_path   TEXT NOT NULL,
    changed_at TEXT NOT NULL        -- commit date of the rename
);

CREATE INDEX idx_file_name_history_file ON file_name_history(file_id);

-- ---------------------------------------------------------------
-- Layer 2 — Metric formulas
-- ---------------------------------------------------------------
CREATE TABLE metric_formulas (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,  -- e.g. 'player_score'
    expression TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Default player score formula
INSERT INTO metric_formulas (id, name, expression, updated_at) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'player_score',
    '(commits * 10) + (insertions * 0.5) - (deletions * 0.3) + (files_touched * 2) + (streak_bonus * 3)',
    '2024-01-01T00:00:00Z'
);

-- ---------------------------------------------------------------
-- Layer 1 — Raw commits (append-only)
-- ---------------------------------------------------------------
CREATE TABLE commits (
    id               TEXT PRIMARY KEY,  -- UUID
    repo_id          TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    sha              TEXT NOT NULL,
    author_alias_id  TEXT NOT NULL REFERENCES aliases(id),
    message          TEXT NOT NULL,
    committed_at     TEXT NOT NULL,     -- ISO-8601 UTC
    insertions       INTEGER NOT NULL DEFAULT 0,
    deletions        INTEGER NOT NULL DEFAULT 0,
    files_changed    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (repo_id, sha)
);

CREATE INDEX idx_commits_repo        ON commits(repo_id);
CREATE INDEX idx_commits_alias       ON commits(author_alias_id);
CREATE INDEX idx_commits_committed   ON commits(committed_at);

-- ---------------------------------------------------------------
-- Layer 1 — Raw file changes per commit (append-only)
-- ---------------------------------------------------------------
CREATE TABLE commit_file_changes (
    id          TEXT PRIMARY KEY,  -- UUID
    commit_id   TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
    file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('A','M','D','R','C')),
    insertions  INTEGER NOT NULL DEFAULT 0,
    deletions   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (commit_id, file_id)
);

CREATE INDEX idx_cfc_commit ON commit_file_changes(commit_id);
CREATE INDEX idx_cfc_file   ON commit_file_changes(file_id);
