# Skills — Rust · Tauri 2 · SQLite · React · pnpm

## Environment setup

### Prerequisites check
Before doing anything, verify the environment is ready:
```bash
# Check all required tools
rustc --version          # must be >= 1.77
cargo --version
node --version           # must be >= 20
pnpm --version           # must be >= 9
rustup target list --installed  # must include current platform target

# Install missing tools if needed
rustup update stable
rustup component add clippy rustfmt
cargo install tauri-cli --version "^2"   # cargo tauri
pnpm install -g @tauri-apps/cli          # fallback if cargo tauri is slow
```

### Project bootstrap (run once)
```bash
# From repo root
pnpm create tauri-app gitpulse \
  --template react-ts \
  --manager pnpm \
  --yes

cd gitpulse

# Add Rust dependencies
cd src-tauri
cargo add tauri --features shell-open
cargo add serde --features derive
cargo add serde_json
cargo add tokio --features full
cargo add sqlx --features sqlite,runtime-tokio,chrono,uuid,migrate
cargo add git2
cargo add thiserror
cargo add chrono --features serde
cargo add uuid --features v4,serde
cargo add tracing
cargo add tracing-subscriber --features env-filter
cargo add evalexpr
cargo add dirs   # for ~/.gitpulse/ resolution
cd ..

# Frontend dependencies
pnpm add recharts
pnpm add @tauri-apps/api
pnpm add @tauri-apps/plugin-shell
pnpm add -D @types/recharts
pnpm add -D tailwindcss @tailwindcss/vite
pnpm add -D typescript @types/react @types/react-dom
```

### First run
```bash
# Dev mode (hot-reload frontend + Rust recompile on save)
pnpm tauri dev

# Build release binary
pnpm tauri build
```

### Environment files
```
.env                  # never committed
.env.example          # committed, documents required vars
```
```bash
# .env.example
GITPULSE_LOG=debug     # tracing filter (gitpulse=debug,sqlx=warn)
GITPULSE_DB_PATH=      # override default ~/.gitpulse/data.db (optional)
```

---

## Project structure (enforce strictly)

```
gitpulse/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # entrypoint, tracing init, run()
│   │   ├── lib.rs               # tauri builder, AppState, command registration
│   │   ├── error.rs             # top-level AppError enum
│   │   ├── db/
│   │   │   ├── mod.rs           # pool init, pragmas
│   │   │   └── migrations/
│   │   │       ├── 001_initial.sql
│   │   │       └── 002_aggregates.sql
│   │   ├── git/
│   │   │   ├── mod.rs           # GitError, GitResult
│   │   │   ├── scanner.rs       # commit parsing, incremental scan
│   │   │   ├── worktree.rs      # create/destroy worktree
│   │   │   └── rename.rs        # --follow rename chain tracking
│   │   ├── models/
│   │   │   ├── mod.rs
│   │   │   ├── repo.rs
│   │   │   ├── developer.rs
│   │   │   ├── commit.rs
│   │   │   └── stats.rs
│   │   ├── aggregation/
│   │   │   ├── mod.rs
│   │   │   ├── engine.rs        # SQL recalc orchestrator
│   │   │   └── formulas.rs      # evalexpr integration
│   │   └── commands/
│   │       ├── mod.rs           # re-exports all commands
│   │       ├── repos.rs
│   │       ├── developers.rs
│   │       ├── stats.rs
│   │       └── boxscore.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/
│   │   └── index.ts             # mirrors Rust models (keep in sync)
│   ├── lib/
│   │   └── invoke.ts            # typed wrappers around tauri invoke()
│   ├── hooks/
│   │   ├── useRepo.ts
│   │   ├── useDeveloper.ts
│   │   └── useStats.ts
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Files.tsx
│   │   ├── Developers.tsx
│   │   ├── BoxScore.tsx
│   │   └── AliasManager.tsx
│   └── components/
│       ├── BoxScoreCard.tsx
│       ├── FileTree.tsx
│       └── StatBar.tsx
├── .claude/
│   └── skills.md
├── CLAUDE.md
├── PRD.md
├── ARCHITECTURE.md
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Rust conventions

### Error handling — always thiserror, never anyhow in lib code

```rust
// src-tauri/src/error.rs — top-level error aggregating all modules
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("git error: {0}")]
    Git(#[from] crate::git::GitError),
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("aggregation error: {0}")]
    Aggregation(#[from] crate::aggregation::AggregationError),
    #[error("formula error: {0}")]
    Formula(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

// Each module defines its own fine-grained error type
// src-tauri/src/git/mod.rs
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("repository not found at {path}")]
    NotFound { path: String },
    #[error("branch '{branch}' not found in {repo}")]
    BranchNotFound { repo: String, branch: String },
    #[error("worktree already exists at {path}")]
    WorktreeExists { path: String },
    #[error("incremental scan requires at least one indexed commit")]
    NoBaseCommit,
    #[error("git2: {0}")]
    Git2(#[from] git2::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

pub type GitResult<T> = Result<T, GitError>;
```

### No unwrap in production paths — ever

```rust
// WRONG
let name = commit.author().name().unwrap();

// RIGHT
let name = commit.author().name().unwrap_or("").to_string();
// or propagate
let name = commit.author().name()
    .ok_or(GitError::MissingAuthorName { sha: sha.clone() })?
    .to_string();
```

### All structs must derive the full set

```rust
// Models shared with frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct Developer {
    pub id: uuid::Uuid,
    pub display_name: String,
    pub color: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// Internal-only models (no Deserialize needed)
#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
pub struct CommitRaw {
    pub id: uuid::Uuid,
    pub sha: String,
    pub repo_id: uuid::Uuid,
    pub author_alias_id: uuid::Uuid,
    pub committed_at: chrono::DateTime<chrono::Utc>,
    pub message: String,
}
```

### Tauri command pattern — thin wrapper always

```rust
// src-tauri/src/commands/repos.rs

/// Add a repository to a workspace and trigger initial scan.
#[tauri::command]
pub async fn add_repo(
    state: tauri::State<'_, crate::AppState>,
    path: String,
    branch: String,
    workspace_id: String,
) -> Result<crate::models::repo::Repo, String> {
    add_repo_inner(&state.db, path, branch, workspace_id)
        .await
        .map_err(|e| e.to_string())  // only conversion allowed in the command itself
}

async fn add_repo_inner(
    db: &sqlx::SqlitePool,
    path: String,
    branch: String,
    workspace_id: String,
) -> Result<crate::models::repo::Repo, crate::error::AppError> {
    // all real logic here — proper error types, no String mapping
    let worktree = crate::git::worktree::create(std::path::Path::new(&path))?;
    let repo = insert_repo(db, &path, &branch, &workspace_id, &worktree).await?;
    crate::git::scanner::full_scan(db, &repo).await?;
    crate::aggregation::engine::recalc_all(db, &repo.id.to_string()).await?;
    Ok(repo)
}
```

### Register all commands in lib.rs

```rust
// src-tauri/src/lib.rs
pub fn run() {
    tauri::Builder::default()
        .manage(AppState { db: /* init */ })
        .invoke_handler(tauri::generate_handler![
            commands::repos::add_repo,
            commands::repos::list_repos,
            commands::repos::scan_repo,
            commands::developers::list_developers,
            commands::developers::merge_aliases,
            commands::stats::get_developer_stats,
            commands::stats::get_file_stats,
            commands::stats::get_directory_stats,
            commands::boxscore::get_box_scores,
            commands::boxscore::get_day_view,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### AppState

```rust
// src-tauri/src/lib.rs
pub struct AppState {
    pub db: sqlx::SqlitePool,
}
```

---

## Database

### Pool init with pragmas

```rust
// src-tauri/src/db/mod.rs
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::str::FromStr;

pub async fn init_pool(db_path: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite:{db_path}"))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .pragma("foreign_keys", "ON")
        .pragma("cache_size", "-32000");

    let pool = SqlitePool::connect_with(options).await?;
    sqlx::migrate!("src/db/migrations").run(&pool).await?;
    Ok(pool)
}

pub fn db_path() -> String {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("gitpulse");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("data.db").to_string_lossy().into_owned()
}
```

### Migration file rules
- One file per logical change group, numbered `001_`, `002_`, etc.
- Layer 1+2 tables in `001_initial.sql`, layer 3 aggregates in `002_aggregates.sql`
- Never ALTER a migration file after it has been run — create a new one
- Each migration ends with a comment on what comes next

```sql
-- src-tauri/src/db/migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repos (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    path                 TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    current_branch       TEXT NOT NULL,
    worktree_path        TEXT,
    last_indexed_at      TEXT,
    last_indexed_sha     TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace_repos (
    workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo_id       TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    PRIMARY KEY (workspace_id, repo_id)
);

CREATE TABLE IF NOT EXISTS developers (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    display_name  TEXT NOT NULL,
    color         TEXT NOT NULL DEFAULT '#6366f1',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aliases (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    developer_id  TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    git_name      TEXT NOT NULL,
    git_email     TEXT NOT NULL,
    UNIQUE(git_name, git_email)
);

CREATE TABLE IF NOT EXISTS files (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    repo_id       TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    current_path  TEXT NOT NULL,
    canonical_id  TEXT NOT NULL,
    UNIQUE(repo_id, current_path)
);

CREATE TABLE IF NOT EXISTS file_name_history (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    path        TEXT NOT NULL,
    valid_from  TEXT NOT NULL,
    valid_to    TEXT
);

CREATE TABLE IF NOT EXISTS commits (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    repo_id          TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    sha              TEXT NOT NULL,
    author_alias_id  TEXT NOT NULL REFERENCES aliases(id),
    committed_at     TEXT NOT NULL,
    message          TEXT NOT NULL,
    UNIQUE(repo_id, sha)
);

CREATE TABLE IF NOT EXISTS commit_file_changes (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    commit_id   TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
    file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    insertions  INTEGER NOT NULL DEFAULT 0,
    deletions   INTEGER NOT NULL DEFAULT 0,
    change_type TEXT NOT NULL DEFAULT 'M'  -- A(dd) M(odify) D(elete) R(ename)
);

CREATE TABLE IF NOT EXISTS metric_formulas (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT NOT NULL UNIQUE,
    expression      TEXT NOT NULL,
    description     TEXT,
    last_recalc_at  TEXT
);

-- Seed default player score formula
INSERT OR IGNORE INTO metric_formulas (name, expression, description) VALUES (
    'player_score',
    '(commits * 10) + (insertions * 0.5) - (deletions * 0.3) + (files_touched * 2) + (streak_bonus * 3)',
    'Daily developer score inspired by NBA Game Score (Hollinger). Normalized 0-100 per developer history.'
);

-- Next: 002_aggregates.sql
```

### SQLx query patterns

```rust
// Always use query! or query_as! — compile-time SQL verification
// Run `cargo sqlx prepare` to regenerate .sqlx cache before committing

// Simple scalar
let count = sqlx::query_scalar!(
    "SELECT COUNT(*) FROM commits WHERE repo_id = ?",
    repo_id
)
.fetch_one(db)
.await?;

// Typed struct result
let stats = sqlx::query_as!(
    DeveloperDailyStats,
    r#"SELECT date as "date!", commits, insertions, deletions,
              files_touched, player_score, streak_current
       FROM stats_daily_developer
       WHERE developer_id = ? AND repo_id = ?
         AND date BETWEEN ? AND ?
       ORDER BY date DESC"#,
    developer_id, repo_id, start_date, end_date
)
.fetch_all(db)
.await?;

// Transaction (always for multi-table writes)
let mut tx = db.begin().await?;
sqlx::query!("INSERT INTO commits ...", ...).execute(&mut *tx).await?;
sqlx::query!("INSERT INTO commit_file_changes ...", ...).execute(&mut *tx).await?;
tx.commit().await?;
```

### Generate SQLx offline cache (required before CI / release)
```bash
cd src-tauri
DATABASE_URL="sqlite:../dev.db" cargo sqlx prepare
# commits the generated .sqlx/ directory
```

---

## git2 patterns

### Open repo and walk commits

```rust
use git2::{Repository, Sort};

pub fn walk_commits_from(
    repo_path: &std::path::Path,
    branch: &str,
    since_sha: Option<&str>,
) -> GitResult<Vec<CommitInfo>> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitError::NotFound { path: repo_path.display().to_string() })?;

    let branch_ref = repo.find_branch(branch, git2::BranchType::Local)
        .map_err(|_| GitError::BranchNotFound {
            repo: repo_path.display().to_string(),
            branch: branch.to_string(),
        })?;

    let head_commit = branch_ref.get().peel_to_commit()?;
    let stop_oid = since_sha
        .and_then(|s| git2::Oid::from_str(s).ok());

    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    revwalk.push(head_commit.id())?;

    let mut results = Vec::new();
    for oid in revwalk {
        let oid = oid?;
        if stop_oid == Some(oid) { break; }  // incremental: stop at last indexed

        let commit = repo.find_commit(oid)?;
        results.push(CommitInfo {
            sha: oid.to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            message: commit.message().unwrap_or("").trim().to_string(),
        });
    }

    // Return in chronological order (oldest first) for correct streak calculation
    results.reverse();
    Ok(results)
}
```

### Diff a commit for file-level stats

```rust
pub fn diff_commit_files(
    repo: &Repository,
    commit: &git2::Commit,
) -> GitResult<Vec<FileChange>> {
    let tree = commit.tree()?;
    let parent_tree = commit.parents().next()
        .and_then(|p| p.tree().ok());

    let mut opts = git2::DiffOptions::new();
    opts.ignore_whitespace(true);

    let diff = repo.diff_tree_to_tree(
        parent_tree.as_ref(),
        Some(&tree),
        Some(&mut opts),
    )?;

    let mut changes: Vec<FileChange> = Vec::new();

    diff.foreach(
        &mut |delta, _progress| {
            changes.push(FileChange {
                old_path: delta.old_file().path()
                    .map(|p| p.to_string_lossy().into_owned()),
                new_path: delta.new_file().path()
                    .map(|p| p.to_string_lossy().into_owned()),
                status: format!("{:?}", delta.status()),
                insertions: 0,
                deletions: 0,
            });
            true
        },
        None,
        Some(&mut |delta, _hunk, line| {
            use git2::DiffLineType::*;
            let path = delta.new_file().path()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default();
            if let Some(c) = changes.iter_mut().find(|c| c.new_path.as_deref() == Some(&path)) {
                match line.origin_value() {
                    Addition => c.insertions += 1,
                    Deletion => c.deletions += 1,
                    _ => {}
                }
            }
            true
        }),
        None,
    )?;

    Ok(changes)
}
```

### Worktree create / cleanup

```rust
// src-tauri/src/git/worktree.rs

pub fn create(repo_path: &std::path::Path) -> GitResult<std::path::PathBuf> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitError::NotFound { path: repo_path.display().to_string() })?;

    let worktree_path = repo_path.join(".gitpulse-worktree");
    if worktree_path.exists() {
        tracing::debug!("worktree already exists at {}", worktree_path.display());
        return Ok(worktree_path);
    }

    repo.worktree("gitpulse-analysis", &worktree_path, None)?;
    tracing::info!("created worktree at {}", worktree_path.display());
    Ok(worktree_path)
}

pub fn destroy(repo_path: &std::path::Path) -> GitResult<()> {
    let worktree_path = repo_path.join(".gitpulse-worktree");
    if worktree_path.exists() {
        std::fs::remove_dir_all(&worktree_path)?;
        // Also prune the worktree ref from the main repo
        let repo = Repository::open(repo_path)?;
        if let Ok(wt) = repo.find_worktree("gitpulse-analysis") {
            wt.prune(None)?;
        }
    }
    Ok(())
}
```

---

## Aggregation engine

### Recalc orchestration

```rust
// src-tauri/src/aggregation/engine.rs

/// Full recalculation for a repo. Called after scan or alias merge.
/// Pure SQL — no Git access required.
pub async fn recalc_all(db: &sqlx::SqlitePool, repo_id: &str) -> Result<(), AggregationError> {
    tracing::info!("starting full recalc for repo {repo_id}");
    let mut tx = db.begin().await?;

    recalc_developer_daily(&mut tx, repo_id).await?;
    recalc_file_daily(&mut tx, repo_id).await?;
    recalc_directory_daily(&mut tx, repo_id).await?;
    recalc_globals(&mut tx, repo_id).await?;

    tx.commit().await?;
    tracing::info!("recalc complete for repo {repo_id}");
    Ok(())
}

async fn recalc_developer_daily(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    repo_id: &str,
) -> Result<(), AggregationError> {
    sqlx::query!("DELETE FROM stats_daily_developer WHERE repo_id = ?", repo_id)
        .execute(&mut **tx).await?;

    sqlx::query!(r#"
        INSERT INTO stats_daily_developer
            (developer_id, repo_id, date, commits, insertions, deletions, files_touched)
        SELECT
            d.id,
            c.repo_id,
            DATE(c.committed_at) as date,
            COUNT(DISTINCT c.id),
            COALESCE(SUM(cfc.insertions), 0),
            COALESCE(SUM(cfc.deletions), 0),
            COUNT(DISTINCT cfc.file_id)
        FROM commits c
        JOIN aliases a ON a.id = c.author_alias_id
        JOIN developers d ON d.id = a.developer_id
        LEFT JOIN commit_file_changes cfc ON cfc.commit_id = c.id
        WHERE c.repo_id = ?
        GROUP BY d.id, c.repo_id, DATE(c.committed_at)
    "#, repo_id)
    .execute(&mut **tx).await?;

    Ok(())
}
```

### Streak via SQL window functions (no Rust loop)

```sql
-- Used inside recalc_globals
WITH active_days AS (
    SELECT developer_id, repo_id, date
    FROM stats_daily_developer
    WHERE repo_id = ? AND commits > 0
),
grouped AS (
    SELECT *,
        julianday(date) - ROW_NUMBER() OVER (
            PARTITION BY developer_id, repo_id
            ORDER BY date
        ) AS grp
    FROM active_days
),
streaks AS (
    SELECT developer_id, repo_id, date,
        COUNT(*) OVER (
            PARTITION BY developer_id, repo_id, grp
            ORDER BY date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS streak_current,
        COUNT(*) OVER (PARTITION BY developer_id, repo_id, grp) AS streak_total
    FROM grouped
)
SELECT developer_id, repo_id, date, streak_current,
    MAX(streak_total) OVER (PARTITION BY developer_id, repo_id) as streak_best
FROM streaks
ORDER BY developer_id, date
```

---

## Tracing setup

```rust
// src-tauri/src/main.rs
fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("GITPULSE_LOG")
                .unwrap_or_else(|_| "gitpulse=info,sqlx=warn,git2=warn".into()),
        )
        .with_target(true)
        .with_file(true)
        .with_line_number(true)
        .init();

    tracing::info!("GitPulse starting");
    gitpulse_lib::run();
}
```

Log levels to use:
- `tracing::error!` — unrecoverable, user must be informed
- `tracing::warn!` — degraded state (e.g. alias not found, skipping commit)
- `tracing::info!` — lifecycle events (scan started, recalc complete)
- `tracing::debug!` — per-commit/per-file detail (gated behind GITPULSE_LOG=debug)

---

## Frontend conventions

### Typed invoke wrappers — never call invoke() directly in components

```typescript
// src/lib/invoke.ts
import { invoke } from "@tauri-apps/api/core";
import type { Repo, Developer, DeveloperDailyStats, BoxScoreDay } from "../types";

export const api = {
  repos: {
    add: (path: string, branch: string, workspaceId: string) =>
      invoke<Repo>("add_repo", { path, branch, workspaceId }),
    list: (workspaceId: string) =>
      invoke<Repo[]>("list_repos", { workspaceId }),
    scan: (repoId: string) =>
      invoke<void>("scan_repo", { repoId }),
  },
  developers: {
    list: (repoId: string) =>
      invoke<Developer[]>("list_developers", { repoId }),
    mergeAliases: (targetDeveloperId: string, aliasIds: string[]) =>
      invoke<void>("merge_aliases", { targetDeveloperId, aliasIds }),
  },
  stats: {
    developer: (params: StatsParams) =>
      invoke<DeveloperDailyStats[]>("get_developer_stats", params),
    files: (params: StatsParams) =>
      invoke<FileStats[]>("get_file_stats", params),
    directory: (params: StatsParams & { path: string }) =>
      invoke<DirectoryStats[]>("get_directory_stats", params),
  },
  boxscore: {
    feed: (params: StatsParams) =>
      invoke<BoxScoreDay[]>("get_box_scores", params),
    day: (date: string, repoId: string) =>
      invoke<BoxScoreDay[]>("get_day_view", { date, repoId }),
  },
};
```

### Types mirroring Rust models

```typescript
// src/types/index.ts
// Keep in sync with src-tauri/src/models/*.rs

export interface Repo {
  id: string;
  path: string;
  name: string;
  currentBranch: string;
  lastIndexedAt: string | null;
}

export interface Developer {
  id: string;
  displayName: string;
  color: string;
}

export interface DeveloperDailyStats {
  date: string;         // "YYYY-MM-DD"
  commits: number;
  insertions: number;
  deletions: number;
  filesTouched: number;
  playerScore: number;
  streakCurrent: number;
}

export interface BoxScoreDay {
  developer: Developer;
  date: string;
  stats: DeveloperDailyStats;
  topFile: string | null;
  repoName: string;
}
```

### Tailwind v4 setup

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { internalIpV4 } from "internal-ip";

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: mobile ? "0.0.0.0" : false,
    hmr: mobile ? { protocol: "ws", host: await internalIpV4(), port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
```

```css
/* src/index.css — that's all you need for Tailwind v4 */
@import "tailwindcss";
```

---

## Testing

### Rust — unit tests with in-memory SQLite

```rust
// At the bottom of any module file, or in src-tauri/src/<module>/tests.rs

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_db() -> sqlx::SqlitePool {
        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        sqlx::migrate!("src/db/migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_alias_merge_triggers_recalc() {
        let db = setup_db().await;
        // arrange: insert two aliases for the same real person
        // act: merge_aliases(...)
        // assert: stats_daily_developer has single developer_id per day
        todo!()
    }

    #[tokio::test]
    async fn test_incremental_scan_does_not_duplicate_commits() {
        let db = setup_db().await;
        // arrange: run full scan on a temp git repo
        // act: run scan again (should be no-op)
        // assert: commit count unchanged
        todo!()
    }
}
```

### Run tests

```bash
# All Rust tests
cd src-tauri && cargo test

# Single test, with output
cargo test test_alias_merge -- --nocapture

# Frontend type-check (no test runner yet in v1)
cd .. && pnpm tsc --noEmit

# Lint Rust
cargo clippy -- -D warnings

# Format check (CI-style)
cargo fmt --check
```

### Clippy config

```toml
# src-tauri/.cargo/config.toml
[build]
rustflags = ["-D", "warnings"]  # treat all warnings as errors in CI
```

```toml
# src-tauri/Cargo.toml — deny common footguns
[lints.clippy]
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
```

---

## Git workflow

### Commit convention (Conventional Commits — enforced)

```
<type>(<scope>): <description in imperative, lowercase>

Types  : feat | fix | refactor | test | chore | docs | perf | migration
Scopes : db | git | aggregation | commands | ui | aliases | boxscore | config

feat(db): add initial migration for raw fact tables
feat(git): implement worktree creation and cleanup
feat(git): add incremental commit scanner
feat(aggregation): implement SQL recalc engine for developer daily stats
feat(commands): expose add_repo and scan_repo to frontend
feat(ui): scaffold routing and sidebar layout
fix(aggregation): correct streak calculation using window functions
refactor(commands): extract repo validation to shared helper
test(aggregation): add alias merge recalculation test
migration: add aggregate tables (002_aggregates.sql)
```

### Commit rules — enforced strictly

- One logical unit per commit — if you have to say "and" in the message, split it
- Migrations always in their own commit, never bundled with application code
- Never commit generated files: `target/`, `node_modules/`, `.sqlx/` (only after `cargo sqlx prepare`), `*.db`, `.gitpulse-worktree/`
- Never commit secrets: `.env` (only `.env.example`)
- Frontend and backend in separate commits when the change is independent

### .gitignore (enforce these entries)

```gitignore
# Rust
target/
Cargo.lock        # keep this for binary apps — do NOT ignore it

# SQLx
# .sqlx/          # commit this — needed for offline compile check

# Database
*.db
*.db-shm
*.db-wal

# GitPulse worktrees
.gitpulse-worktree/

# Node
node_modules/
dist/

# Env
.env

# OS
.DS_Store
Thumbs.db
```

### Pre-commit checks (run before every commit)

```bash
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
cd .. && pnpm tsc --noEmit
```
