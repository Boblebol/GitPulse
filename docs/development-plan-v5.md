# GitPulse Development Plan V5

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or execute one ticket at a time with
> focused verification. Do not touch local context files such as `AGENTS.md`.

**Goal:** close the audit findings after V4 by tightening dependency tracking,
repo import correctness, docs/marketing accuracy, QA coverage, and small UI
polish before the next feature cycle.

**Architecture:** keep the current Tauri 2 + React 19 + SQLite architecture.
Prefer small, independently testable changes over broad refactors. Security
work should document upstream blockers when Cargo cannot resolve a compatible
patched graph.

**Tech Stack:** React, TypeScript, TanStack Query, Tauri commands, Rust, sqlx,
SQLite, Cargo, Jest, GitHub Actions, Dependabot.

---

## Audit Findings Addressed

- Dependabot still reports `glib` medium and `rand` low alerts through upstream
  transitive dependency chains.
- The marketing site still describes Reports as Markdown-only even though the
  app supports Markdown, CSV, PDF, and PPTX exports.
- The marketing site references a roadmap path under `docs/superpowers/`, which
  is ignored by Git and unsuitable for public links.
- `CHANGELOG.md` has no Unreleased entry for bulk folder/repo import.
- `add_repo` stores the raw user path while bulk discovery stores canonicalized
  paths, creating a duplicate-repo risk.
- `ActivityChart.tsx` contains a residual `any`.
- `Settings.tsx` and `useRepos.ts` contain production debug logs around scan
  controls.
- Test coverage is strong overall but lacks a real desktop-style smoke path for
  import, scan, rebuild, and export workflows.
- Several large files should be split in future work, but only along touched
  boundaries to avoid churn.

---

## Ticket V5-T1: Document Remaining Dependency Alerts

**Status:** Done and verified.

**Owner:** Security/docs worker.

**Files:**

- Modify or create: `docs/security-dependency-status.md`
- Modify if needed: `README.md`
- Modify if needed: `SECURITY.md`

**Purpose:** make the remaining Dependabot state explicit without forcing unsafe
transitive upgrades.

**Steps:**

- [x] Confirm open alerts with:

  ```bash
  gh api 'repos/Boblebol/GitPulse/dependabot/alerts?state=open'
  ```

- [x] Confirm `glib` source with:

  ```bash
  cargo tree --manifest-path src-tauri/Cargo.toml --target all -i glib
  ```

- [x] Confirm `rand` source with:

  ```bash
  cargo tree --manifest-path src-tauri/Cargo.toml -i rand@0.7.3
  ```

- [x] Document the blocker chains:

  ```text
  glib -> gtk/webkit2gtk/wry/tauri Linux runtime stack
  rand 0.7.3 -> selectors -> kuchikiki -> tauri-utils
  ```

- [x] State the decision: keep Dependabot enabled, avoid `[patch]` overrides,
  retry compatible upgrades when Tauri/wry/GTK or kuchikiki/selectors move.

- [x] Verification:

  ```bash
  pnpm audit --audit-level low
  cargo test --manifest-path src-tauri/Cargo.toml
  cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
  ```

**Acceptance Criteria:**

- A maintainer can understand why alerts remain open.
- The doc includes commands to re-check the state.
- No unsafe dependency override is added.

---

## Ticket V5-T2: Refresh Docs, Site, And Changelog

**Status:** Done and verified.

**Owner:** Docs/marketing worker.

**Files:**

- Modify: `site/src/main.tsx`
- Modify: `CHANGELOG.md`
- Modify if needed: `README.md`

**Purpose:** align public copy with the product shipped on `master`.

**Steps:**

- [x] Replace Markdown-only Reports copy with Markdown, CSV, PDF, and PPTX copy.
- [x] Replace the ignored `docs/superpowers/...` roadmap link with a tracked
  public roadmap link such as `docs/development-plan-v4.md` or this V5 plan.
- [x] Add an Unreleased changelog entry for importing multiple folders/repos
  into one workspace.
- [x] Verification:

  ```bash
  pnpm run site:build
  ```

**Acceptance Criteria:**

- Site copy no longer contradicts Reports functionality.
- Site links point to tracked repository files.
- Changelog reflects the latest bulk import feature.

---

## Ticket V5-T3: Canonicalize Manual Repo Imports

**Status:** Done and verified.

**Owner:** Backend worker.

**Files:**

- Modify: `src-tauri/src/commands/repos.rs`

**Purpose:** prevent duplicate repo rows when a user imports the same repository
through different path spellings.

**Steps:**

- [x] Add a Rust test proving `inner_add_repo` stores a canonical path.
- [x] Add a Rust test proving a later bulk-discovered canonical path is detected
  as already imported.
- [x] In `inner_add_repo`, validate the raw path, then store
  `repo_path_string(Path::new(&path))`.
- [x] Keep error messages based on the user-provided path when the path does not
  exist or is not a Git repo.
- [x] Verification:

  ```bash
  cargo test --manifest-path src-tauri/Cargo.toml commands::repos::tests -- --nocapture
  ```

**Acceptance Criteria:**

- Manual and bulk import use the same canonical path convention.
- Existing add/remove/list/scan repo tests still pass.

---

## Ticket V5-T4: Remove Low-Risk UI Polish Debt

**Status:** Done and verified.

**Owner:** UI polish worker.

**Files:**

- Modify: `src/components/ActivityChart.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/hooks/useRepos.ts`
- Modify if needed: `src/__tests__/pages/Settings.test.tsx`
- Modify if needed: `src/__tests__/hooks/useRepos.test.tsx`

**Purpose:** remove production debug noise and TypeScript looseness without
changing product behavior.

**Steps:**

- [x] Replace the `any` label formatter type with a specific Recharts-compatible
  value type.
- [x] Remove scan control `console.log` and `console.error` calls from Settings
  and scan hooks.
- [x] Keep existing notifications and button states unchanged.
- [x] Update any tests that asserted console output.
- [x] Verification:

  ```bash
  pnpm exec jest --runInBand src/__tests__/pages/Settings.test.tsx
  pnpm run build
  ```

**Acceptance Criteria:**

- No `label: any` remains in `ActivityChart.tsx`.
- Scan controls and hooks do not write debug logs during normal use.
- Settings tests and TypeScript build pass.

---

## Ticket V5-T5: Add A Minimal Workflow Smoke Test

**Status:** Done and verified.

**Owner:** Main integrator after V5-T2 through V5-T4 land.

**Files:**

- Create if lightweight: `src/__tests__/workflows/import-scan-export.test.tsx`
- Modify only if needed: frontend test helpers under `src/__tests__/`

**Purpose:** cover the user workflow that unit tests currently exercise only in
separate pieces.

**Initial Scope:**

- Import multiple discovered repos into a workspace through Settings.
- Trigger a scan and assert progress state is reflected.
- Rebuild analytics and assert analytics queries are invalidated.
- Open Reports and assert Markdown/CSV/PDF/PPTX actions exist for a valid scope.

**Steps:**

- [x] Reuse existing Tauri `invoke` mocks from Settings and Reports tests.
- [x] Keep this as a Jest workflow test first; defer full Playwright/Tauri until
  the app needs visual regression or OS-dialog coverage.
- [x] Verification:

  ```bash
  pnpm exec jest --runInBand src/__tests__/workflows/import-scan-export.test.tsx
  pnpm exec jest --runInBand
  ```

**Acceptance Criteria:**

- The smoke test fails if import, scan, rebuild, or Reports exports disappear
  from the core workflow.
- It does not depend on a real local Git repository or OS file dialog.

---

## Ticket V5-T6: Plan Focused Module Splits

**Status:** Done and verified.

**Owner:** Main integrator.

**Files:**

- Create: `docs/backend-module-split-notes.md`

**Purpose:** reduce future regression risk without doing a risky broad refactor
in the same patch as behavior changes.

**Candidate Modules:**

- `src-tauri/src/git/scanner.rs`
- `src-tauri/src/aggregation/engine.rs`
- `src-tauri/src/commands/health.rs`
- `src-tauri/src/commands/repos.rs`
- `src-tauri/src/commands/history.rs`
- `src-tauri/src/commands/stats.rs`
- `src/pages/Settings.tsx`

**Steps:**

- [x] For each large file, list the responsibilities currently mixed together.
- [x] Identify the first safe extraction that does not change behavior.
- [x] Do not refactor until full V5 checks pass.

**Acceptance Criteria:**

- The repo has a concrete split map for future PRs.
- V5 does not mix broad refactors with security or product fixes.

---

## Final Verification

Passed on 2026-05-03:

```bash
pnpm audit --audit-level low
pnpm exec jest --coverage --runInBand
pnpm run build
pnpm run site:build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git status --short --branch
```

Expected result: all commands pass, with only the documented upstream
Dependabot alerts remaining open.

Actual result: verification passed. GitHub Dependabot still reports open
upstream-blocked alerts for `glib` medium and `rand` low.
