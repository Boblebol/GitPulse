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
      ▼ git2 crate (worktree séparé)
┌─────────────────┐
│   Git scanner   │  ← src-tauri/src/git/scanner.rs
│  (incremental)  │
└────────┬────────┘
         │ INSERT (append-only)
         ▼
┌─────────────────────────┐
│  Layer 1 — Raw facts    │  commits + commit_file_changes
└────────────┬────────────┘
             │ triggered by: new scan | alias merge | formula change
             ▼ SQL aggregation (no Rust loop)
┌─────────────────────────┐
│  Layer 3 — Aggregates   │  stats_daily_* + stats_*_global
└────────────┬────────────┘
             │ SELECT (filtered by date range)
             ▼
┌─────────────────────────┐
│   Tauri commands        │  → JSON → React UI
└─────────────────────────┘
```

## Why 3-layer database

**Problem**: recalculating stats on every UI read from raw commits would be O(n commits) per query. On a repo with 50k commits, that's unusably slow.

**Solution**:
- Layer 1 is append-only → safe to always keep, never corrupted by logic changes
- Layer 3 is fully derived → can always be dropped and rebuilt from layer 1
- Alias merge doesn't require touching commit data — only `aliases.developer_id` links them, aggregates just re-GROUP

## Why `git2` over shell subprocess

- No dependency on system `git` version
- Programmatic access to tree objects, blob diffs, rename detection
- No shell injection risk
- Consistent behavior across macOS/Windows/Linux

## Why worktree

The user's working tree must never be touched (dirty index, uncommitted changes, etc.). A `git worktree` gives us a clean checkout on the target branch without disturbing the user's workspace.

Worktree path today: `<repo>/.gitpulse-worktree/`. This directory can appear as untracked in the analyzed repository, so it must be ignored explicitly until worktree placement is moved outside the target repo.

## Aggregation engine design

All aggregation is SQL, not Rust loops. Rust only:
1. Triggers the recalculation
2. Injects formula variable bindings via `evalexpr` for the player score

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
│   ├── useRepo.ts          # invoke wrappers with React Query
│   ├── useDeveloper.ts
│   └── useStats.ts
├── pages/
│   ├── Dashboard.tsx
│   ├── Files.tsx
│   ├── Developers.tsx
│   ├── BoxScore.tsx
│   └── AliasManager.tsx
└── components/
    ├── BoxScoreCard.tsx
    ├── FileTree.tsx
    └── StatBar.tsx
```

All `invoke()` calls wrapped in typed hooks. Pages never call `invoke()` directly.

## SQLite pragmas (set on connection)

```sql
PRAGMA journal_mode = WAL;     -- concurrent reads during writes
PRAGMA foreign_keys = ON;      -- enforce FK constraints
PRAGMA synchronous = NORMAL;   -- safe + fast (WAL mode)
PRAGMA cache_size = -32000;    -- 32MB page cache
```
