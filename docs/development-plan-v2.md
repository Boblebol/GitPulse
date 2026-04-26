# GitPulse Development Plan V2

> **For agentic workers:** implement one ticket at a time. Keep the app usable after every ticket, write focused tests for changed behavior, and commit each completed feature separately.

**Goal:** close the remaining PRD gaps around scoped analytics, time filters, dashboard completeness, branch switching, and alias reassignment.

**Architecture:** keep the existing Tauri 2 + Rust + SQLite + React stack. The UI defaults to the selected repository and adds an explicit "all repos in workspace" analysis scope. Backend stats commands accept a typed scope and optional date ranges, then reuse aggregate tables instead of reparsing Git history.

**Tech Stack:** React 19, TanStack Query, Tauri commands, Rust, `sqlx`, SQLite aggregates, Jest, Cargo tests.

---

## Baseline

- Current branch for this work: `prd-v2-polish`.
- The starting tree is clean.
- Fresh baseline checks before this plan:
  - `pnpm exec jest --runInBand`: 76 passed.
  - `pnpm build`: passed.
  - `cargo test`: 127 passed, 1 ignored benchmark.
  - `cargo clippy --all-targets -- -D warnings`: passed.

---

## Product Decisions

- Default analysis scope is the selected repository.
- The user can switch analytics views to "All repos in workspace".
- No stats should aggregate across unrelated workspaces.
- Existing scan behavior stays repo-specific.
- Each feature below gets its own commit.

---

## Ticket V2-T1: Shared Analysis Scope

**Purpose:** create a shared frontend model for choosing between selected repo and all repos in the selected workspace.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/components/Sidebar.tsx`
- Add: `src/components/AnalysisScopeToggle.tsx`
- Test: `src/__tests__/context/AppContext.test.tsx`

**Steps:**
- [ ] Add `AnalysisScopeMode = "repo" | "workspace"` and `AnalysisScope`.
- [ ] Store `analysisScopeMode` in `AppContext`, defaulting to `"repo"`.
- [ ] Reset scope mode to `"repo"` when workspace or repo selection changes.
- [ ] Add a compact toggle in the sidebar under the repo selector.
- [ ] Disable workspace scope when no workspace is selected.
- [ ] Add Jest coverage for default mode and reset behavior.

**Acceptance Criteria:**
- The UI still works exactly as before when scope mode is `"repo"`.
- The sidebar exposes a clear repo/workspace scope switch.
- `pnpm exec jest --runInBand src/__tests__/context/AppContext.test.tsx` passes.

**Commit:** `feat(ui): add analysis scope selector`

---

## Ticket V2-T2: Scoped Developer Stats

**Purpose:** stop using cross-workspace developer totals in Dashboard, Developers, and Box Score developer selectors.

**Files:**
- Modify: `src-tauri/src/commands/stats.rs`
- Modify: `src/hooks/useStats.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Developers.tsx`
- Modify: `src/pages/BoxScore.tsx`
- Test: `src-tauri/src/commands/stats.rs`
- Test: `src/__tests__/hooks/useStats.test.tsx`

**Backend Behavior:**
- `get_developer_global_stats` accepts optional `repo_id` and `workspace_id`.
- If `repo_id` is present, return stats for that repo only.
- If `workspace_id` is present, aggregate developers across repos in that workspace.
- If neither is present, preserve legacy all-database behavior for compatibility.

**Frontend Behavior:**
- Hooks derive query params from the selected analysis scope.
- Dashboard and Developers display stats for current repo by default.
- Workspace scope aggregates all repos from the selected workspace.

**Acceptance Criteria:**
- Rust tests prove repo filtering, workspace aggregation, and workspace isolation.
- Jest tests prove hooks pass scope params into Tauri.
- `pnpm exec jest --runInBand src/__tests__/hooks/useStats.test.tsx` passes.
- `cargo test commands::stats::tests` passes.

**Commit:** `feat(stats): scope developer stats by repo or workspace`

---

## Ticket V2-T3: Time Range Filters

**Purpose:** implement PRD time filters: all time, custom range, last 7/14/30/90 days, week navigation, and month navigation.

**Files:**
- Add: `src/utils/timeRange.ts`
- Add: `src/components/TimeRangePicker.tsx`
- Modify: `src/types/index.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/hooks/useStats.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Developers.tsx`
- Modify: `src/pages/Files.tsx`
- Modify: `src/pages/BoxScore.tsx`
- Test: `src/__tests__/utils/timeRange.test.ts`
- Test: `src/__tests__/context/AppContext.test.tsx`

**Behavior:**
- `all` means no date predicate for global views.
- Presets compute inclusive `fromDate` and `toDate` in local calendar date form.
- Week/month modes expose previous/next controls.
- Custom mode uses two date inputs and validates `from <= to`.

**Acceptance Criteria:**
- Time range state is shared across analytics pages.
- Box Score keeps its selected day card but uses shared range for leaderboard/trend.
- Jest tests cover preset calculations and week/month navigation.

**Commit:** `feat(ui): add time range filters`

---

## Ticket V2-T4: Range-Aware File And Developer Queries

**Purpose:** make file, directory, developer, and timeline stats respect the selected time range.

**Files:**
- Modify: `src-tauri/src/commands/stats.rs`
- Modify: `src/hooks/useStats.ts`
- Test: `src-tauri/src/commands/stats.rs`
- Test: `src/__tests__/hooks/useStats.test.tsx`

**Backend Behavior:**
- Add range-aware developer stats for repo/workspace scopes.
- Add range-aware file stats for a repo using `stats_daily_file`.
- Add range-aware directory stats for a repo using `stats_daily_directory`.
- Add `get_activity_timeline(repo_id?, workspace_id?, from_date?, to_date?)`.

**Acceptance Criteria:**
- Existing all-time file and directory screens keep working.
- Date-bounded queries return only rows from the inclusive range.
- Workspace timeline aggregates across repos in the workspace.

**Commit:** `feat(stats): add range aware analytics queries`

---

## Ticket V2-T5: Complete Dashboard PRD View

**Purpose:** dashboard shows overview, top developers, top files, and an activity timeline.

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/components/ActivityChart.tsx` if needed for multi-series display
- Modify: `src/hooks/useStats.ts`
- Test: add or update focused frontend tests if a new component is extracted

**Behavior:**
- Summary cards use scoped and range-aware developer totals.
- Top contributors use scoped and range-aware developer rows.
- Top files uses scoped repo file stats; workspace scope shows top files grouped by repo name if backend exposes repo name.
- Activity timeline shows daily commits and line churn for the selected range.
- Empty states distinguish "no repo selected" from "no scanned data for this range".

**Acceptance Criteria:**
- Dashboard meets PRD wording for overview, top files, top developers, and timeline.
- `pnpm build` passes after the dashboard changes.

**Commit:** `feat(dashboard): add top files and activity timeline`

---

## Ticket V2-T6: Branch Switching After Repo Add

**Purpose:** make the repo branch selector real after a repo is added.

**Files:**
- Modify: `src/hooks/useRepos.ts`
- Modify: `src/pages/Settings.tsx`
- Test: `src/__tests__/hooks/useRepos.test.tsx`

**Behavior:**
- Branches are fetched per repo path, not only during add.
- Settings displays all branches for each repo.
- Changing branch calls `set_repo_branch`.
- Stats are invalidated after branch changes.
- The user can sync the repo after switching branch to scan that branch.

**Acceptance Criteria:**
- A repo row branch select contains all known branches.
- Switching branch updates the repo active branch.
- Hook tests cover branch query keys and invalidation.

**Commit:** `feat(ui): enable branch switching after repo add`

---

## Ticket V2-T7: Alias Reassignment UI

**Purpose:** expose precise alias reassignment, not only whole-developer merge.

**Files:**
- Modify: `src/pages/AliasManager.tsx`
- Modify: `src/hooks/useDevelopers.ts` if invalidation needs broadening
- Test: add frontend test coverage if the page is extracted into smaller components

**Behavior:**
- Each alias row has a "Move to" developer selector.
- Moving an alias calls `reassign_alias`.
- Whole developer merge remains available as a separate action.
- After a move, developer list and stats are invalidated.
- Empty source developers are removed by existing backend behavior.

**Acceptance Criteria:**
- The UI can move one alias without merging every alias from the source developer.
- Merge still works.
- `pnpm exec jest --runInBand` passes.

**Commit:** `feat(ui): expose alias reassignment`

---

## Ticket V2-T8: Documentation And Final Verification

**Purpose:** keep docs honest and prove the full branch is stable.

**Files:**
- Modify: `README.md` if user-facing behavior changed enough to document.
- Modify: `docs/development-plan-v2.md` statuses.

**Verification:**
- [ ] `pnpm exec jest --runInBand`
- [ ] `pnpm build`
- [ ] `cargo test`
- [ ] `cargo clippy --all-targets -- -D warnings`

**Acceptance Criteria:**
- All verification commands exit 0.
- Development plan statuses match implemented features.
- Git history contains one doc commit plus one commit per product feature.

**Commit:** `docs: update v2 development status`
