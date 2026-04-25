# GitPulse Development Plan

> **For agentic workers:** implement one ticket at a time. Use test-first changes for behavior, keep commits small when this directory is inside a Git repository, and run the listed verification commands before marking a ticket complete.

**Goal:** make GitPulse robust for large local repositories by adding resumable, observable scans and scaling aggregate recalculation without losing the existing local-first architecture.

**Architecture:** keep the existing Tauri 2 + Rust + SQLite + React stack. The scan pipeline will move from a single in-memory full batch to a persisted scan-run state machine with chunked writes, progress events, and resumable cursors. Aggregates will move from whole-database rebuilds toward repo/date-scoped rebuilds after the scan pipeline is safe.

**Tech Stack:** Rust, Tauri 2 commands/events, `git2`, `sqlx` SQLite migrations, React, TanStack Query, Jest, Cargo tests.

---

## Current Baseline

- Frontend tests pass with `pnpm exec jest --runInBand`.
- Backend tests pass with `cargo test` in `src-tauri`.
- `pnpm build` fails because `src/setupTests.ts` imports Node globals while the app `tsconfig.json` does not include Node types.
- `cargo clippy --all-targets -- -D warnings` fails on unused imports, private error visibility, unused models, and a few Clippy suggestions.
- The project directory is not currently a Git repository, so tickets cannot be committed until Git is initialized or the files are moved into a repository.

---

## Phase 1: Baseline Hygiene

### Ticket P1-T1: Restore Build And Strict Checks

**Purpose:** make the project buildable and make strict backend checks actionable before feature work.

**Files:**
- Modify: `tsconfig.json`
- Modify: `src-tauri/src/alias.rs`
- Modify: `src-tauri/src/git/scanner.rs`
- Modify: `src-tauri/src/commands/repos.rs`
- Modify: `src-tauri/src/commands/developers.rs`
- Modify: `src-tauri/src/commands/boxscore.rs`
- Modify: `src-tauri/src/aggregation/engine.rs`
- Modify: `src-tauri/src/models/commit.rs`
- Modify: `src-tauri/src/models/stats.rs`

**Steps:**
- [x] Exclude frontend test files from the production TypeScript build or split app/test tsconfigs.
- [x] Remove unused Rust imports and unused Tauri command parameters.
- [x] Align `pub(crate)` helper functions with `pub(crate)` error types.
- [x] Keep database model structs intentionally allowed or wire them into queries.
- [x] Apply simple Clippy fixes where they do not change behavior.

**Acceptance Criteria:**
- `pnpm build` exits 0.
- `pnpm exec jest --runInBand` exits 0.
- `cargo test` exits 0 from `src-tauri`.
- `cargo clippy --all-targets -- -D warnings` exits 0 from `src-tauri`.

**Status:** completed.

### Ticket P1-T2: Documentation Cleanup

**Purpose:** make docs match the current project instead of the original Tauri template.

**Files:**
- Modify: `README.md`
- Optionally rename or replace: `prd_md.md`, `architecture_md.md`, `claude_md.md`
- Modify: `.gitignore`

**Steps:**
- [x] Replace the template README with setup, test, build, and run commands.
- [x] Document the current data model, scan behavior, and known limitations.
- [x] Add `.gitpulse-worktree/` to `.gitignore` or change the scanner to place worktrees outside analyzed repos.
- [x] Clarify the actual supported React version in docs.

**Acceptance Criteria:**
- README explains how to run `pnpm exec jest --runInBand`, `pnpm build`, `cargo test`, and `cargo clippy`.
- Docs no longer claim `.gitpulse-worktree/` is automatically ignored.
- Docs no longer claim all queries use `sqlx::query!` unless the code is changed to match.

**Status:** completed.

---

## Phase 2: Resumable Large-Repo Scans

### Ticket P2-T1: Add Persistent Scan Run State

**Purpose:** make scan progress durable so a large scan can resume after cancellation, app close, or crash.

**Files:**
- Create: `src-tauri/src/db/migrations/003_scan_runs.sql`
- Create: `src-tauri/src/models/scan.rs`
- Modify: `src-tauri/src/models/mod.rs`
- Modify: `src-tauri/src/db/migrations.rs`

**Data Model:**
- `scan_runs.id`
- `scan_runs.repo_id`
- `scan_runs.branch`
- `scan_runs.target_head_sha`
- `scan_runs.cursor_sha`
- `scan_runs.status` with values `running`, `paused`, `completed`, `failed`
- `scan_runs.commits_indexed`
- `scan_runs.files_processed`
- `scan_runs.error_message`
- `scan_runs.started_at`
- `scan_runs.updated_at`
- `scan_runs.completed_at`

**Steps:**
- [x] Write migration tests proving the table exists and cascades with `repos`.
- [x] Add Rust model structs for scan run rows and progress summaries.
- [x] Add helper functions to create, update, complete, and fail scan runs.

**Acceptance Criteria:**
- Migration tests pass.
- Scan-run helpers are covered by Rust unit tests.
- No UI behavior changes yet.

**Status:** completed.

### Ticket P2-T2: Process Commits In Batches

**Purpose:** stop loading the entire history into memory before writing to SQLite.

**Files:**
- Modify: `src-tauri/src/git/scanner.rs`
- Modify: `src-tauri/src/git/incremental.rs`
- Add tests in: `src-tauri/src/git/scanner.rs`

**Behavior:**
- The scanner collects at most one batch of commits before persisting.
- Default batch size is 500 commits.
- `last_indexed_commit_sha` is updated only after a batch commit succeeds.
- Re-running after a partial scan continues from durable scan state.

**Steps:**
- [ ] Write a failing Rust test that simulates two batches and verifies partial progress is persisted.
- [ ] Refactor `collect_commits` into an iterator-like batch collector.
- [ ] Persist each batch in a transaction.
- [ ] Update scan counters after each committed batch.

**Acceptance Criteria:**
- Existing scan tests still pass.
- New partial-progress test passes.
- Scanning a repo with no new commits still returns zero without creating duplicate rows.

### Ticket P2-T3: Make Branch State Explicit

**Purpose:** avoid corrupt incremental assumptions when a repo branch changes.

**Files:**
- Modify: `src-tauri/src/db/migrations/003_scan_runs.sql` or add `004_repo_branch_state.sql`
- Modify: `src-tauri/src/commands/repos.rs`
- Modify: `src-tauri/src/git/incremental.rs`

**Behavior:**
- Incremental cursor is scoped by repo and branch.
- Changing `active_branch` either creates a separate branch cursor or resets the scan cursor for that branch.
- If the previous cursor is not reachable from the selected branch, the scanner falls back to a safe full scan for that branch.

**Acceptance Criteria:**
- Tests cover switching from `main` to a divergent branch.
- Tests cover switching back to a previously scanned branch.

---

## Phase 3: Scan Progress Events And Controls

### Ticket P3-T1: Emit Tauri Scan Progress Events

**Purpose:** let the frontend display data arriving during large scans.

**Files:**
- Modify: `src-tauri/src/commands/repos.rs`
- Modify: `src-tauri/src/git/scanner.rs`
- Modify: `src/types/index.ts`

**Event Payload:**
- `repo_id`
- `scan_run_id`
- `status`
- `commits_indexed`
- `files_processed`
- `last_indexed_commit_sha`
- `target_head_sha`
- `message`

**Acceptance Criteria:**
- Backend test or integration seam verifies progress payload creation.
- Tauri command no longer accepts an unused `AppHandle`.
- UI can subscribe to `scan_progress`.

### Ticket P3-T2: Add Frontend Progress UI

**Purpose:** replace the static “Fetching commits…” text with real progress.

**Files:**
- Modify: `src/hooks/useRepos.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Add tests in: `src/__tests__/hooks/useRepos.test.tsx`

**Behavior:**
- Show scan status, indexed commits, processed files, and latest message.
- Keep the UI responsive during scans.
- Refresh stats after each completed batch or after scan completion, depending on aggregation ticket status.

**Acceptance Criteria:**
- Jest tests cover receiving a progress event and updating UI state.
- Existing scan mutation tests still pass.

### Ticket P3-T3: Pause, Resume, And Recover Failed Scans

**Purpose:** make long-running scans controllable by the user.

**Files:**
- Modify: `src-tauri/src/commands/repos.rs`
- Modify: `src-tauri/src/git/scanner.rs`
- Modify: `src/hooks/useRepos.ts`
- Modify: `src/pages/Settings.tsx`

**Commands:**
- `pause_scan(scan_run_id)`
- `resume_scan(repo_id)`
- `get_scan_status(repo_id)`

**Acceptance Criteria:**
- A paused scan has `status = paused` and can resume from its cursor.
- A failed scan shows the error and can be resumed or restarted.
- UI disables conflicting scan actions for the same repo.

---

## Phase 4: Incremental Aggregation

### Ticket P4-T1: Track Dirty Aggregate Scopes

**Purpose:** avoid rebuilding all aggregate tables after each scan batch.

**Files:**
- Add migration: `src-tauri/src/db/migrations/004_dirty_aggregate_scopes.sql`
- Modify: `src-tauri/src/aggregation/engine.rs`
- Modify: `src-tauri/src/git/scanner.rs`

**Behavior:**
- Each committed scan batch records dirty `(repo_id, date)` scopes.
- Alias merge and formula changes can still trigger wider recalculation.

**Acceptance Criteria:**
- Tests verify only dirty repo/date rows are rebuilt after scan batches.
- Full recalculation remains available as a fallback command/helper.

### Ticket P4-T2: Repo-Scoped Aggregate Rebuild

**Purpose:** make stats refresh cheap enough to run while scan batches complete.

**Files:**
- Modify: `src-tauri/src/aggregation/engine.rs`
- Modify: `src-tauri/src/commands/repos.rs`
- Modify tests in: `src-tauri/src/aggregation/engine.rs`

**Behavior:**
- Rebuild daily developer, file, and directory stats only for dirty scopes.
- Rebuild global stats only for repos/developers/files affected by dirty scopes.

**Acceptance Criteria:**
- Existing aggregate tests pass.
- New tests prove unaffected repos keep their aggregate rows unchanged.

---

## Phase 5: Complete File And Directory Metrics

### Ticket P5-T1: Recursive Directory Aggregates

**Purpose:** match the PRD requirement for recursive directory drill-down.

**Files:**
- Modify: `src-tauri/src/aggregation/engine.rs`
- Modify: `src-tauri/src/commands/stats.rs`
- Modify: `src/pages/Files.tsx`

**Behavior:**
- A file at `src/a/b.ts` contributes to `src` and `src/a`.
- Root-level files contribute to `<root>`.

**Acceptance Criteria:**
- Tests cover nested files contributing to all ancestor directories.
- Files page can display parent and child directories without double-counting labels.

### Ticket P5-T2: Co-Touch Score

**Purpose:** implement the coupling metric described in the PRD.

**Files:**
- Modify: `src-tauri/src/aggregation/engine.rs`
- Modify: `src/pages/Files.tsx`

**Behavior:**
- For each file, `co_touch_score` reflects how often it appears in commits with other files.
- Binary or single-file commits do not inflate coupling.

**Acceptance Criteria:**
- Tests cover single-file commits, repeated co-touched pairs, and multi-author files.
- Files page exposes the metric in the file list.

---

## Phase 6: Performance And Product Hardening

### Ticket P6-T1: Add Large-Repo Synthetic Benchmarks

**Purpose:** catch regressions before testing on real monorepos.

**Files:**
- Create: `src-tauri/benches/scan_large_repo.rs` or test-only benchmark helper
- Modify: `src-tauri/Cargo.toml`

**Acceptance Criteria:**
- Benchmark or ignored test can generate thousands of commits and files.
- Report includes scan duration, peak batch size, and aggregate duration.

### Ticket P6-T2: Bundle And UI Performance

**Purpose:** keep the desktop app responsive as pages grow.

**Files:**
- Modify: `vite.config.ts`
- Modify pages using Recharts where needed.

**Acceptance Criteria:**
- `pnpm exec vite build` has no chunk-size warning or has an intentional documented threshold.
- Heavy routes can be lazily loaded without breaking hash routing.
