# GitPulse

[![CI](https://github.com/Boblebol/GitPulse/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Boblebol/GitPulse/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/Boblebol/GitPulse/actions/workflows/pages.yml/badge.svg?branch=master)](https://github.com/Boblebol/GitPulse/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

GitPulse is a local Tauri 2 desktop app for analyzing Git repository activity.
It indexes local repositories into SQLite, aggregates developer/file/directory
stats, highlights code-health achievements, and presents an NBA box-score style
view of work patterns.

Public documentation and tutorials are published with GitHub Pages:
https://Boblebol.github.io/GitPulse/

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

GitHub Pages documentation site:

```bash
pnpm run site:dev
pnpm run site:build
pnpm run site:preview
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

Large-repo synthetic benchmark (ignored by default):

```bash
cd src-tauri
cargo test large_repo_benchmark -- --ignored --nocapture
```

Optional benchmark sizing:

```bash
GITPULSE_BENCH_COMMITS=5000 GITPULSE_BENCH_FILES_PER_COMMIT=3 \
  cargo test large_repo_benchmark -- --ignored --nocapture
```

## Releases

Releases are prepared from the `master` branch and published by pushing tags
named `vX.Y.Z` or release-candidate tags such as `vX.Y.Z-rc.N`. The release
workflow builds Linux, macOS, and Windows desktop artifacts, then attaches them
to a public GitHub Release or prerelease.

Download published desktop builds from GitHub Releases:
https://github.com/Boblebol/GitPulse/releases

### Unsigned macOS builds

Current macOS release-candidate bundles are not code-signed. After dragging
`GitPulse.app` to `/Applications`, clear the quarantine attribute once:

```bash
xattr -cr /Applications/GitPulse.app
```

This removes the Gatekeeper quarantine marker added to downloaded apps. It does
not modify GitPulse data or any repository you scan. After running it, open
GitPulse again from Finder, Spotlight, or Launchpad.

Desktop bundles are also built on every `master` push by the `Desktop Build`
workflow and can be downloaded from the workflow run artifacts for 14 days.

See [docs/release.md](docs/release.md) and [CHANGELOG.md](CHANGELOG.md).

## Contributing

GitPulse is MIT licensed. See [CONTRIBUTING.md](CONTRIBUTING.md),
[SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
before opening issues or pull requests.

## Current Architecture

The app stores data in a local SQLite database under the Tauri app data
directory. The database is local-first and has durable scan state plus derived
analytics layers:

1. Scan state: `scan_runs`, `repo_branch_cursors`
2. Raw facts: `commits`, `commit_file_changes`
3. Reference data: `developers`, `aliases`, `files`, `repos`, `workspaces`
4. Derived aggregates: `stats_daily_*`, `stats_*_global`
5. Dirty aggregate scopes: `dirty_aggregate_scopes`

The scanner performs a full first scan and then incremental rescans from a
branch-specific cursor. Commits are persisted in batches of 500 by default,
with scan progress emitted to the UI. Running scans can be paused; paused or
failed scans can be resumed from the persisted cursor.

Each persisted batch records dirty `(repo_id, date)` aggregate scopes. After a
scan completes, only dirty daily developer/file/directory rows are rebuilt, and
affected global developer/file/directory rows are refreshed. Alias merges and
formula changes still use full aggregate recalculation because they can affect
the whole derived dataset.

Directory metrics are recursive: `src/a/b.ts` contributes to both `src` and
`src/a`. File coupling is exposed through `co_touch_score`: for each commit
touching `N` distinct files, each touched file gains `N - 1`.

The React app uses hash routing for Tauri compatibility and lazy-loads route
pages with `React.lazy`/`Suspense`. Vite splits React, Tauri, and visualization
dependencies into manual chunks.

## Known Limitations

- `.gitpulse-worktree/` can appear as an untracked directory in analyzed repos;
  keep it ignored until worktree placement is redesigned.
- Existing databases created before recursive directory aggregation may need a
  full aggregate rebuild before historical directory rows reflect every parent
  directory.
