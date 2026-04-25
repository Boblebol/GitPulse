# GitPulse

GitPulse is a local Tauri 2 desktop app for analyzing Git repository activity.
It indexes local repositories into SQLite, aggregates developer/file/directory
stats, and presents an NBA box-score style view of work patterns.

## Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, Recharts
- Desktop shell: Tauri 2
- Backend: Rust, `git2`, `sqlx`, SQLite, `evalexpr`
- Tests: Jest for frontend hooks/context/components, Cargo tests for Rust

## Setup

```bash
pnpm install
```

Rust and the Tauri platform prerequisites must also be installed for desktop
builds and backend tests.

## Development

Run the web UI through Vite:

```bash
pnpm dev
```

Run the Tauri app:

```bash
pnpm tauri dev
```

## Verification

Frontend tests:

```bash
pnpm exec jest --runInBand
```

Frontend production build:

```bash
pnpm build
```

Backend tests:

```bash
cd src-tauri
cargo test
```

Backend strict lint:

```bash
cd src-tauri
cargo clippy --all-targets -- -D warnings
```

## Current Architecture

The app stores data in a local SQLite database under the Tauri app data
directory. The database has three layers:

1. Raw facts: `commits`, `commit_file_changes`
2. Reference data: `developers`, `aliases`, `files`, `repos`, `workspaces`
3. Derived aggregates: `stats_daily_*`, `stats_*_global`

The scanner currently performs a full first scan and an incremental rescan based
on `repos.last_indexed_commit_sha`. Aggregates are rebuilt after scans, alias
changes, and formula changes.

## Known Limitations

- Large repository scans are not yet chunked or resumable.
- Scan progress is not streamed to the UI yet.
- Aggregate recalculation is still global, not scoped to changed repo/date rows.
- `.gitpulse-worktree/` can appear as an untracked directory in analyzed repos;
  keep it ignored until worktree placement is redesigned.
- Directory metrics are parent-directory based; recursive directory rollups and
  co-touch score are planned next.
