# Backend And UI Module Split Notes

Last reviewed: 2026-05-03.

This note records safe future splits for the largest GitPulse files. The goal is
to reduce regression risk without mixing broad refactors into security, release,
or product-fix branches.

## Principles

- Split only when touching a file for adjacent behavior.
- Keep public Tauri command names stable.
- Move tests with the code they exercise when possible.
- Prefer pure helpers first, then stateful command orchestration.
- Run the full Rust or Jest suite after each extraction.

## Rust Candidates

### `src-tauri/src/git/scanner.rs`

Current responsibilities:

- Walking Git history and batches.
- Persisting commits, files, authors, aliases, and rename facts.
- Managing scan progress callbacks.
- Handling branch cursors and pause/resume behavior.
- Managing temporary analysis worktrees.

First safe extraction:

- Move worktree path creation and cleanup helpers into
  `src-tauri/src/git/worktree.rs`.
- Keep scanner tests unchanged first, then move worktree-specific tests after
  the extraction is green.

Verification:

```bash
cargo test --manifest-path src-tauri/Cargo.toml git::scanner::tests
```

### `src-tauri/src/aggregation/engine.rs`

Current responsibilities:

- Recalculating daily/global developer stats.
- Recalculating daily/global file and directory stats.
- Applying player-score formulas.
- Managing dirty aggregate scopes.

First safe extraction:

- Move directory rollup path expansion into
  `src-tauri/src/aggregation/directories.rs`.
- Move score update helpers into `src-tauri/src/aggregation/scores.rs` only
  after directory extraction is stable.

Verification:

```bash
cargo test --manifest-path src-tauri/Cargo.toml aggregation::engine::tests
```

### `src-tauri/src/commands/health.rs`

Current responsibilities:

- File health queries.
- Directory health queries.
- Developer focus, review risk, activity signal, volatility, and coupling graph
  queries.
- Period parsing and shared scope filters.

First safe extraction:

- Move period parsing and scope SQL binding helpers into
  `src-tauri/src/commands/query_scope.rs`.
- Then split health command groups by endpoint family only after helper
  extraction is green.

Verification:

```bash
cargo test --manifest-path src-tauri/Cargo.toml commands::health::tests
```

### `src-tauri/src/commands/repos.rs`

Current responsibilities:

- Workspace CRUD.
- Single repo import.
- Bulk repo discovery/import.
- Branch listing and branch switching.
- Scan, pause, resume, and scan status commands.

First safe extraction:

- Move bulk discovery/import models and helpers into
  `src-tauri/src/commands/repo_import.rs`.
- Keep command exports in `repos.rs` until the extraction has no behavior diff.

Verification:

```bash
cargo test --manifest-path src-tauri/Cargo.toml commands::repos::tests
```

### `src-tauri/src/commands/history.rs`

Current responsibilities:

- Period leaderboards.
- Awards and records.
- Hall of fame queries.
- Period parsing and deterministic ranking.

First safe extraction:

- Reuse the future shared `query_scope.rs` period parser.
- Move award key definitions and deterministic tie-breaking helpers into
  `src-tauri/src/commands/history_awards.rs`.

Verification:

```bash
cargo test --manifest-path src-tauri/Cargo.toml commands::history::tests
```

### `src-tauri/src/commands/stats.rs`

Current responsibilities:

- Developer, file, directory, daily, leaderboard, box score, and activity
  timeline queries.
- Date-range SQL filters.
- Shared scope filtering across repo/workspace modes.

First safe extraction:

- Reuse the future shared `query_scope.rs` helpers.
- Move file and directory stat queries into
  `src-tauri/src/commands/file_directory_stats.rs` only after shared filters are
  stable.

Verification:

```bash
cargo test --manifest-path src-tauri/Cargo.toml commands::stats::tests
```

## Frontend Candidate

### `src/pages/Settings.tsx`

Current responsibilities:

- Workspace creation/deletion.
- Manual repo add.
- Bulk folder discovery/import.
- Branch selection.
- Scan/pause/resume controls.
- Formula editor.
- Aggregate rebuild.
- Local data deletion.

First safe extraction:

- Move bulk import state and UI into `src/components/settings/BulkRepoImport.tsx`.
- Keep all query hooks unchanged and pass `workspaceId`, candidates, selected
  paths, and callbacks explicitly.

Second extraction:

- Move scan controls into `src/components/settings/RepoScanControls.tsx`.

Verification:

```bash
pnpm exec jest --runInBand src/__tests__/pages/Settings.test.tsx
pnpm run build
```

## Recommended Order

1. Extract `BulkRepoImport.tsx` from `Settings.tsx`.
2. Extract repo import helpers from `commands/repos.rs`.
3. Extract worktree helpers from `git/scanner.rs`.
4. Extract shared period/scope helpers from Rust commands.
5. Split health/history/stats by endpoint family after the shared helpers are
   stable.

Each step should be its own pull request with no product behavior change.
