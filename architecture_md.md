# GitPulse — Architecture decisions

## Why Tauri 2 + Rust

- Native access to the filesystem (repos clonés localement) sans serveur
- `git2` crate = binding libgit2, plus fiable qu'un subprocess `git`
- SQLite embarqué dans le binaire Rust via `sqlx`
- Frontend React standard, pas de contrainte technologique inhabituelle

## Data flow

```
Git repo on disk
      │
      ▼ git2/libgit2 revwalk on selected branch
┌─────────────────┐
│   Git scanner   │  ← src-tauri/src/git/scanner.rs
│ batched + resumable
└────────┬────────┘
         │ transactional batch INSERT
         ▼
┌─────────────────────────┐
│  Layer 1 — Raw facts    │  commits + commit_file_changes
└────────────┬────────────┘
             │ mark dirty repo/date scopes
             ▼ scoped aggregation
┌─────────────────────────┐
│  Layer 3 — Aggregates   │  stats_daily_* + stats_*_global
└────────────┬────────────┘
             │ SELECT (filtered by date range)
             ▼
┌─────────────────────────┐
│   Tauri commands        │  → JSON → React UI
└─────────────────────────┘
```

## Why layered database

**Problem**: recalculating stats on every UI read from raw commits would be O(n commits) per query. On a repo with 50k commits, that's unusably slow.

**Solution**:
- Layer 1 is append-only → safe to always keep, never corrupted by logic changes
- Layer 3 is fully derived → can always be dropped and rebuilt from layer 1
- Alias merge doesn't require touching commit data — only `aliases.developer_id` links them, aggregates just re-GROUP

Additional scan-control tables keep long-running scans durable:

- `scan_runs`: running, paused, completed, failed state plus counters and error message
- `repo_branch_cursors`: last indexed commit per `(repo, branch)`
- `dirty_aggregate_scopes`: `(repo_id, date)` rows that need scoped aggregate rebuilds

## Why `git2` over shell subprocess

- No dependency on system `git` version
- Programmatic access to tree objects, blob diffs, rename detection
- No shell injection risk
- Consistent behavior across macOS/Windows/Linux

## Why worktree

The scanner reads Git object data through `git2` and does not mutate the user's
working tree. It also attempts to create a `gitpulse-analysis` worktree at
`<repo>/.gitpulse-worktree/` for analysis isolation.

Current caveat: `.gitpulse-worktree/` can appear as untracked in the analyzed
repository, so it should stay ignored until worktree placement is moved outside
the target repo.

## Aggregation engine design

Aggregation is mostly SQL, with small Rust-side helpers where SQLite is a poor
fit:

1. Rust triggers full or scoped recalculation.
2. SQL builds daily developer/file aggregates and most global aggregates.
3. Rust expands file paths into recursive directory parents before inserting
   `stats_daily_directory`.
4. SQL computes file `co_touch_score`: for a commit touching `N` distinct
   files, each touched file gains `N - 1`.
5. Rust injects formula variable bindings via `evalexpr` for player score.

Scan-triggered recalculation is scoped:

```
scan batch committed
      │
      ▼
dirty_aggregate_scopes(repo_id, date)
      │
      ▼
recalculate_repo_dates(scopes)
      │
      ├─ rebuild daily developer/file/directory rows for those dates
      ├─ refresh affected global developers/files/directories
      └─ clear dirty scopes after successful recalculation
```

Alias merges and formula changes still call `recalculate_all`, because they can
invalidate broad historical stats.

Streak calculation uses SQL window functions:
```sql
-- streak = consecutive active days ending at each date
WITH daily AS (
  SELECT developer_id, repo_id, date,
    date - ROW_NUMBER() OVER (
      PARTITION BY developer_id, repo_id ORDER BY date
    ) * INTERVAL '1 day' AS grp
  FROM stats_daily_developer
  WHERE commits > 0
)
SELECT developer_id, repo_id, date,
  COUNT(*) OVER (PARTITION BY developer_id, repo_id, grp ORDER BY date) AS streak
FROM daily
```

## AppState

```rust
pub struct AppState {
    pub db: sqlx::SqlitePool,
    pub config_dir: PathBuf,  // ~/.gitpulse/
}
```

Single global state passed to all Tauri commands via `tauri::State`.

## Error propagation

```
git2::Error
    └─► GitError (thiserror)
            └─► String (Tauri boundary — serde serializable)
                    └─► frontend: throw / toast notification
```

## Frontend architecture

```
src/
├── hooks/
│   ├── useRepos.ts         # repo/scan invoke wrappers with React Query
│   ├── useDevelopers.ts
│   └── useStats.ts
├── pages/
│   ├── Dashboard.tsx
│   ├── Files.tsx
│   ├── Developers.tsx
│   ├── BoxScore.tsx
│   └── AliasManager.tsx
└── components/
    ├── ActivityChart.tsx
    ├── Layout.tsx
    ├── Sidebar.tsx
    └── StatCard.tsx
```

All `invoke()` calls are wrapped in typed hooks. Pages do not call `invoke()`
directly. Routes use `createHashRouter` for Tauri compatibility and each page is
loaded with `React.lazy`/`Suspense`. Vite splits React/Tauri/visualization
dependencies into manual chunks.

## Verification and performance checks

Normal checks:

```bash
pnpm exec jest --runInBand
pnpm build
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

Manual large-repo benchmark:

```bash
cd src-tauri
cargo test large_repo_benchmark -- --ignored --nocapture
```

The benchmark reports generation duration, scan duration, aggregate duration,
files processed, and peak scan batch size. It can be scaled with
`GITPULSE_BENCH_COMMITS` and `GITPULSE_BENCH_FILES_PER_COMMIT`.

## SQLite pragmas (set on connection)

```sql
PRAGMA journal_mode = WAL;     -- concurrent reads during writes
PRAGMA foreign_keys = ON;      -- enforce FK constraints
PRAGMA synchronous = NORMAL;   -- safe + fast (WAL mode)
PRAGMA cache_size = -32000;    -- 32MB page cache
```
