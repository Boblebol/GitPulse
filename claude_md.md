# GitPulse — Agent Instructions

## Project overview

Tauri 2 desktop app for deep Git repository analysis. Rust backend, React/TypeScript frontend, SQLite local database.
Solo app, fully local, no auth, no export in v1.

## Stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 |
| Backend | Rust (`git2`, `sqlx` async, `evalexpr`) |
| Database | SQLite via `sqlx` with migrations |
| Frontend | React 19 + TypeScript strict |
| Charts | Recharts |
| Styling | Tailwind CSS v4 |

## Repository structure

```
gitpulse/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── migrations.rs
│   │   │   └── migrations/
│   │   │       ├── 001_initial.sql
│   │   │       └── 002_aggregates.sql
│   │   ├── git/
│   │   │   ├── mod.rs
│   │   │   ├── scanner.rs      # commit parsing, worktree management
│   │   │   ├── incremental.rs  # diff since last HEAD
│   │   │   └── rename.rs       # git log --follow tracking
│   │   ├── models/
│   │   │   ├── mod.rs
│   │   │   ├── repo.rs
│   │   │   ├── developer.rs
│   │   │   ├── commit.rs
│   │   │   └── stats.rs
│   │   ├── aggregation/
│   │   │   ├── mod.rs
│   │   │   ├── engine.rs       # recalcul SQL des agrégats
│   │   │   └── formulas.rs     # evalexpr integration
│   │   └── commands/
│   │       ├── mod.rs
│   │       ├── repos.rs
│   │       ├── developers.rs
│   │       ├── stats.rs
│   │       └── boxscore.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── types/
├── CLAUDE.md               # this file
├── PRD.md                  # product requirements
├── ARCHITECTURE.md         # technical decisions
└── package.json
```

## Database architecture — 3 layers

### Layer 1 — Raw facts (append-only, never modified)
- `commits` — one row per Git commit
- `commit_file_changes` — one row per (commit, file) pair

**Rule**: these tables are the source of truth. Only appended to during Git scans. Never updated or deleted.

### Layer 2 — Reference data (slowly changing)
- `developers`, `aliases` — canonical identities + git name/email mappings
- `files`, `file_name_history` — file tracking with rename chain
- `repos`, `workspaces`, `workspace_repos`
- `metric_formulas` — editable scoring formulas stored as text expressions

### Layer 3 — Precalculated aggregates (recalculated on demand)
- `stats_daily_developer` — per (developer, repo, date)
- `stats_daily_file` — per (file, date)
- `stats_daily_directory` — per (repo, directory_path, date)
- `stats_developer_global` — all-time per developer
- `stats_file_global` — all-time per file
- `stats_directory_global` — all-time per directory

**Recalc triggers**:
- Alias merge → SQL-only recalc, no Git re-parse
- Formula change → SQL-only recalc
- New commits → Git re-parse (incremental), then recalc

## Rust conventions

### General
- Use `thiserror` for all error types, never `anyhow` in library code
- All public functions must have doc comments (`///`)
- No `unwrap()` or `expect()` in production paths — propagate with `?`
- Use `tracing` for logging, not `println!`
- Prefer `async fn` with `tokio` runtime throughout

### Error handling
```rust
// Every module defines its own error type
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("repository not found: {path}")]
    NotFound { path: String },
    #[error("git2 error: {0}")]
    Git2(#[from] git2::Error),
}
```

### Tauri commands
```rust
// Always in src-tauri/src/commands/<module>.rs
// Must be registered in lib.rs
#[tauri::command]
pub async fn command_name(
    state: tauri::State<'_, AppState>,
    param: ParamType,
) -> Result<ReturnType, String> {
    // Map errors to String for Tauri serialization
    inner(state, param).await.map_err(|e| e.to_string())
}
```

### Database
- Prefer `sqlx` compile-time checked macros (`query!`, `query_as!`) for stable queries when the project has the required offline/DB setup. Runtime `sqlx::query` is acceptable for dynamic SQL and existing migration-backed SQLite queries.
- Migrations in `src-tauri/src/db/migrations/*.sql`, numbered sequentially
- Keep raw string queries centralized and covered by tests when compile-time checked macros are not practical.
- All writes wrapped in transactions

### Models
- All models derive `serde::Serialize`, `serde::Deserialize`, `sqlx::FromRow`
- Use `chrono::DateTime<Utc>` for all timestamps
- UUIDs via `uuid::Uuid`

## Git workflow

### Commit convention (Conventional Commits)
```
<type>(<scope>): <short description>

Types: feat | fix | refactor | test | chore | docs | perf
Scopes: db | git | aggregation | commands | ui | config

Examples:
feat(db): add migrations for aggregate tables
feat(git): implement worktree-based scanner
fix(aggregation): correct churn score formula
refactor(commands): extract stats queries to repository pattern
```

### Commit rules
- One logical change per commit — never bundle unrelated changes
- Migrations always committed alone (never with application code)
- Frontend and backend changes in separate commits when possible
- Never commit: `.env`, `*.db`, `target/`, `node_modules/`, `.gitpulse-worktree/`

### Branch strategy
```
main           — stable, always builds
feat/<scope>   — new features
fix/<scope>    — bug fixes
refactor/<scope>
```

## Build order

Implement in this strict order. Never skip ahead.

1. **Database foundation** — migrations (layer 1 + 2 tables), `AppState`, `DbPool`
2. **Git scanner** — worktree creation, commit parsing into raw tables
3. **Alias system** — developer/alias CRUD + merge logic
4. **Aggregation engine** — SQL recalc for all `stats_*` tables
5. **Tauri commands** — expose scanner, alias, stats to frontend
6. **Frontend scaffold** — routing, layout, Tauri invoke wrappers
7. **Stats pages** — dashboard, files, developers
8. **Box Score** — daily cards, player score formula, streaks

## Key implementation notes

### Worktree
```rust
// Create worktree for analysis, never touch working tree
let worktree_path = repo_path.join(".gitpulse-worktree");
repo.worktree("gitpulse-analysis", &worktree_path, None)?;
```

### File rename tracking
Use `git log --follow --diff-filter=ACDMR --name-status` and build `file_name_history` entries for each rename. The `canonical_id` on `files` stays stable across renames.

### Incremental scan
Store `last_indexed_commit_sha` on `repos`. On rescan: walk from HEAD back to that SHA, only process new commits. Insert in chronological order (oldest first).

### Alias recalculation
When aliases are merged, `commit.author_alias_id` already points to the right `alias` row. Recalc is just re-running the aggregate SQL GROUP BY `alias.developer_id`. No data migration needed.

### Player score formula
Default formula stored in `metric_formulas`:
```
(commits * 10) + (insertions * 0.5) - (deletions * 0.3) + (files_touched * 2) + (streak_bonus * 3)
```
Evaluated via `evalexpr` crate with variables injected per row.

## What NOT to do

- Do not use `git` CLI subprocess — use `git2` crate exclusively
- Do not store computed stats in layer 1 tables
- Do not recalculate streaks in Rust — compute them in SQL window functions
- Do not add indexes preemptively — add only when a query is provably slow
- Do not implement export features (v2 scope)
- Do not add authentication or multi-user features
