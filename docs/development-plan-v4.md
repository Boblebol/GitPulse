# GitPulse Development Plan V4

> **For agentic workers:** implement one ticket at a time. Keep security,
> maintenance, report exports, and scan isolation as separate commits. Do not
> touch local context files such as `AGENTS.md`.

**Goal:** prepare the next GitPulse release by closing current security alerts,
adding a safe aggregate maintenance action, expanding Reports exports, and
moving analysis worktrees outside scanned repositories.

**Architecture:** keep the existing Tauri 2 + Rust + SQLite + React stack.
Security work should prefer upstream-compatible dependency updates over Cargo
patches. Product work should keep user-facing controls in existing maintenance
and Reports surfaces instead of spreading new actions across every page.

**Tech Stack:** React 19, TanStack Query, Tauri commands, Rust, `sqlx`, SQLite,
Cargo, Jest, and GitHub Dependabot.

---

## Implementation Status

- [x] V4-T1 Resolve Dependabot security alerts.
- [ ] V4-T2 Add manual aggregate rebuild action.
- [ ] V4-T3 Add CSV, PDF, and PPTX exports from Reports only.
- [ ] V4-T4 Move `.gitpulse-worktree/` outside analyzed repositories.
- [x] Remove temporary branch `chore/dependency-updates-site-footer`.
- [x] Leave local `AGENTS.md` untracked and untouched.

---

## Product Decisions

- Reports is the only UI surface for CSV, PDF, and PPTX exports.
- Markdown export remains available in Reports.
- Aggregate rebuild is a maintenance action, not part of normal scan flow.
- Rebuild and export actions must not mutate scanned Git repositories.
- Analysis worktrees should live in GitPulse-managed app data, not inside the
  repository being analyzed.
- If a dependency alert is blocked by upstream Tauri/Linux GTK dependencies,
  document the blocker rather than forcing an unsafe patch.

---

## Ticket V4-T1: Resolve Dependabot Security Alerts

**Status:** Done.

**Purpose:** reduce or remove current GitHub Dependabot alerts before the next
release.

**Current Alerts:**

- `rand` low severity: already updated in `Cargo.lock` to `0.8.6`; verify that
  GitHub dismisses the alert after rescanning.
- `glib` medium severity: currently pulled through Linux Tauri dependencies
  (`gtk`, `webkit2gtk`, `wry`, `tauri-runtime-wry`). The patched line starts at
  `glib 0.20.0`, but direct overrides may be incompatible with the current GTK
  dependency chain.

**Approach:**

- Run dependency graph checks locally with `cargo tree --target all`.
- Try upstream-compatible `cargo update` changes first.
- If Tauri or GTK still pins `glib 0.18.x`, record the blocker in release notes
  and keep Dependabot enabled so a future upstream update can close it.
- Avoid `[patch]` or forced transitive upgrades unless Cargo proves the full
  dependency graph accepts them and all backend checks pass.

**Resolution Notes:**

- Compatible Cargo updates were applied with `cargo update`.
- `rand 0.7.3` remains in the graph through
  `selectors 0.24.0 -> kuchikiki 0.8.8-speedreader -> tauri-utils 2.8.3`.
  Cargo rejects `selectors 0.25.0` because `kuchikiki` requires
  `selectors = "^0.24"`.
- `glib 0.18.5` remains in the Linux Tauri stack through `gtk 0.18.2`.
  Cargo rejects `glib 0.20.0` because `gtk` requires `glib = "^0.18"`.
- Both remaining Dependabot alerts are therefore upstream dependency-chain
  blockers in the current Tauri 2.10.x GTK stack, not direct GitPulse
  dependencies.

**Acceptance Criteria:**

- Dependabot alerts are either closed by compatible updates or documented with a
  precise upstream blocker.
- `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
  passes when dependency changes touch Rust crates.

**Commit:** `chore(security): resolve dependency alerts`

---

## Ticket V4-T2: Manual Aggregate Rebuild Action

**Status:** Planned.

**Purpose:** give users a safe way to rebuild derived stats for old local
databases after aggregation logic changes.

**Backend Design:**

- Add a Tauri command named `rebuild_aggregates`.
- Implement it in the existing data or maintenance command area, reusing
  `crate::aggregation::recalculate_all`.
- Return a small result payload with at least `started_at`, `completed_at`, and
  `status`.
- Reject or serialize the action when a scan is currently running, matching the
  existing write-heavy scan protection.

**Frontend Design:**

- Add a Settings maintenance section action named "Rebuild analytics".
- Explain that it rebuilds GitPulse stats from local scanned data and does not
  change any Git repository.
- Show pending, success, and error states using the existing notification
  system.
- Invalidate analytics queries after success.

**Acceptance Criteria:**

- Rust tests prove the command rebuilds empty aggregate rows from raw facts.
- Rust tests prove the command rejects or avoids running during an active scan.
- Jest tests cover the Settings button state and mutation call.
- `pnpm exec jest --runInBand src/__tests__/pages/Settings.test.tsx` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml commands::data::tests` passes.

**Commit:** `feat(data): add aggregate rebuild action`

---

## Ticket V4-T3: Reports CSV, PDF, And PPTX Exports

**Status:** Planned.

**Purpose:** expand the existing Reports page from copyable Markdown into
downloadable formats for retros, handoffs, and release notes.

**Scope:**

- Add exports only to `src/pages/Reports.tsx`.
- Keep Dashboard, Code Health, Weekly Recap, and other product pages unchanged.
- Reuse current report data and serializers where possible.

**Formats:**

- Markdown: keep the current copy action.
- CSV: generate structured rows for the selected report type and download a
  `.csv` file with escaped cells.
- PDF: generate a readable local PDF from the selected report content.
- PPTX: generate a simple local deck with a title slide and report sections.

**Implementation Direction:**

- Create report model helpers that convert Dashboard, Code Health, and Weekly
  Recap reports into shared sections.
- Add export utilities under `src/utils/`.
- Prefer focused dependencies for PDF/PPTX generation only if native browser
  APIs would produce unreliable files.
- Keep all generation local in the renderer; do not add backend export storage.

**Acceptance Criteria:**

- Reports can download CSV, PDF, and PPTX for Dashboard, Code Health, and Weekly
  Recap report types.
- Empty reports still export deterministic files with a clear empty-state body.
- Jest tests cover CSV escaping and report-section generation.
- Page tests cover the export buttons being disabled without a selected repo or
  workspace.
- `pnpm exec jest --runInBand src/__tests__/utils/reports.test.ts src/__tests__/pages/Reports.test.tsx`
  passes.

**Commit:** `feat(reports): add file exports`

---

## Ticket V4-T4: Move Analysis Worktrees Outside Scanned Repositories

**Status:** Planned.

**Purpose:** remove the known limitation where `.gitpulse-worktree/` can appear
as an untracked directory in a repository that GitPulse analyzes.

**Backend Design:**

- Compute a GitPulse-managed worktree root from Tauri app data during scan
  commands.
- Use stable per-repo/per-branch subdirectories under that root.
- Pass the optional external worktree path down to the scanner.
- Keep worktree creation non-fatal: history reads must still work if worktree
  creation fails.
- Do not delete existing user-created or historical `.gitpulse-worktree/`
  folders inside scanned repositories.

**Documentation:**

- Update README known limitations after the move.
- Update architecture and PRD docs so they no longer say the analysis worktree
  is created inside the scanned repo.

**Acceptance Criteria:**

- Rust tests prove the scanner does not create `.gitpulse-worktree/` inside the
  analyzed repo when an external worktree root is provided.
- Existing scan tests still pass.
- README no longer lists `.gitpulse-worktree/` as a current limitation.
- `cargo test --manifest-path src-tauri/Cargo.toml git::scanner::tests` passes.

**Commit:** `fix(scan): move analysis worktrees outside repos`

---

## Verification

Run the narrow checks listed in each ticket during implementation. Before the
final V4 integration commit, run:

- `pnpm exec jest --runInBand`
- `pnpm build`
- `pnpm run site:build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
