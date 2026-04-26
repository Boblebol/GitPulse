# GitPulse Development Plan V3

> **For agentic workers:** implement one ticket at a time. Keep write scopes disjoint when working in parallel. Backend historical analytics, backend code-health analytics, and frontend UI/hooks can be developed independently, then integrated through Tauri command registration.

**Goal:** add NBA-inspired historical seasons, awards, records, and advanced code-health analytics.

**Architecture:** reuse existing daily/global aggregate tables first. Add read-only analytics commands for period views and health metrics before introducing cache tables. Keep the app local-first and avoid surveillance framing: health metrics are for codebase risk, maintainability, and planning.

**Tech Stack:** React 19, TanStack Query, Tauri commands, Rust, `sqlx`, SQLite aggregates, Jest, Cargo tests.

---

## Product Principles

- Keep all stats scoped by selected repo or selected workspace.
- Support time periods as first-class product concepts: month, quarter, calendar year, season, all time.
- Present developer stats as team/context signals, not punitive individual surveillance.
- Prefer explainable formulas over opaque ML-style scores.
- Do not reparse Git for V3 analytics; query aggregate/raw fact tables already in SQLite.
- Start without cache tables; add period cache only if real repos show slow queries.

---

## V3 MVP Scope

The first V3 release should ship:

1. Period engine.
2. Seasonal leaderboards.
3. Awards.
4. Records.
5. Hotspot score.
6. Ownership / bus factor.
7. Knowledge silos.
8. Directory health score.
9. Frontend pages for `Seasons`, `Awards`, `Records`, and `Code Health`.

Later V3 extensions:

- Context switching / focus score.
- Review risk proxy.
- Refactor vs feature signal.
- Code volatility.
- Coupling graph.

---

## Data Contracts

### Period Scope

```ts
type PeriodType = "month" | "quarter" | "calendar_year" | "season" | "all_time";

interface PeriodSelection {
  periodType: PeriodType;
  periodKey: string; // "2026-04", "2026-Q2", "2026", "all"
}
```

Rust commands accept:

- `repo_id: Option<String>`
- `workspace_id: Option<String>`
- `period_type: String`
- `period_key: String`

Repo scope wins over workspace scope when both are present.

### Health Score Philosophy

Scores are 0-100 where practical. Raw component values remain exposed in response rows so the UI can explain why a file or directory is risky.

---

## Ticket V3-T1: Period Engine

**Purpose:** normalize month, quarter, calendar year, season, and all-time date bounds.

**Files:**

- Create: `src-tauri/src/commands/history.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify later during integration: `src-tauri/src/lib.rs`
- Create tests in: `src-tauri/src/commands/history.rs`
- Modify frontend types: `src/types/index.ts`

**Behavior:**

- `month` key `YYYY-MM` maps to first and last calendar day.
- `quarter` key `YYYY-QN` maps to quarter date bounds.
- `calendar_year` and `season` key `YYYY` map to `YYYY-01-01` through `YYYY-12-31`.
- `all_time` ignores date bounds.

**Acceptance Criteria:**

- Unit tests cover valid month, quarter, year, season, all-time.
- Invalid keys return clear errors.

**Commit:** `feat(stats): add historical period engine`

---

## Ticket V3-T2: Historical Leaderboards

**Purpose:** provide NBA-style period rankings for developers.

**Backend Command:**

- `get_period_leaderboard(repo_id?, workspace_id?, period_type, period_key)`

**Rows:**

- `rank`
- `developer_id`
- `developer_name`
- `total_commits`
- `total_insertions`
- `total_deletions`
- `files_touched`
- `active_days`
- `best_streak`
- `total_player_score`
- `avg_player_score`
- `adder_rank`
- `remover_rank`

**Awards Derived From Leaderboard:**

- MVP: highest total player score.
- Best Adder: highest insertions.
- Best Remover: highest deletions.
- Most Active: commits then active days.
- Iron Man: active days then best streak.

**Acceptance Criteria:**

- Repo-scoped leaderboard filters by repo.
- Workspace-scoped leaderboard aggregates workspace repos.
- All-time mode works.
- Rows are ranked deterministically.

**Commit:** `feat(stats): add seasonal leaderboards`

---

## Ticket V3-T3: Awards

**Purpose:** generate monthly/yearly awards per repo or workspace.

**Backend Command:**

- `get_period_awards(repo_id?, workspace_id?, period_type, period_key)`

**Awards:**

- `mvp`
- `best_adder`
- `best_remover`
- `most_active`
- `iron_man`
- `hotspot_hero`

**Behavior:**

- Awards are computed from period leaderboard and health rows.
- Missing data returns an empty award list, not an error.
- Each award includes winner developer id/name, metric value, and explanation.

**Commit:** `feat(awards): add period awards`

---

## Ticket V3-T4: Records

**Purpose:** expose career, repo, workspace, season, and all-time records.

**Backend Command:**

- `get_historical_records(repo_id?, workspace_id?, period_type, period_key)`

**Records:**

- most commits in a day
- most insertions in a day
- most deletions in a day
- most files touched in a day
- best player score day
- longest streak
- biggest month
- biggest year
- most active file
- hottest file

**Commit:** `feat(records): add historical records`

---

## Ticket V3-T5: Hotspot Score

**Purpose:** prioritize files that deserve testing/refactoring attention.

**Formula:**

```text
hotspot_score =
  normalized_recent_commits * 0.30
+ normalized_churn * 0.25
+ normalized_co_touch * 0.25
+ normalized_unique_authors * 0.20
```

**Backend Command:**

- `get_file_health_stats(repo_id, period_type, period_key)`

**Rows:**

- `file_id`
- `file_path`
- `recent_commits`
- `churn_score`
- `co_touch_score`
- `unique_authors`
- `hotspot_score`
- `primary_owner_id`
- `primary_owner_name`
- `primary_owner_share`
- `active_maintainers`
- `bus_factor`
- `silo_risk`

**Commit:** `feat(health): add file hotspot score`

---

## Ticket V3-T6: Ownership, Bus Factor, And Knowledge Silos

**Purpose:** show where code knowledge is concentrated.

**Rules:**

- `primary_owner_share >= 0.80` and recent activity means silo risk.
- `active_maintainers <= 1` means bus factor risk.
- Owner share is based on commits touching a file/directory within the period.

**UI Language:**

- Use `ownership risk`, `silo risk`, and `maintainer coverage`.
- Avoid “bad developer” framing.

**Commit:** `feat(health): add ownership and silo metrics`

---

## Ticket V3-T7: Directory Health Score

**Purpose:** summarize code health by directory.

**Backend Command:**

- `get_directory_health_stats(repo_id, period_type, period_key)`

**Formula:**

```text
directory_health_score =
  hotspot_density * 0.30
+ volatility_proxy * 0.20
+ ownership_risk * 0.25
+ coupling_density * 0.15
+ churn * 0.10
```

**Rows:**

- `directory_path`
- `files_touched`
- `commit_count`
- `unique_authors`
- `hotspot_file_count`
- `silo_file_count`
- `churn_score`
- `directory_health_score`

**Commit:** `feat(health): add directory health score`

---

## Ticket V3-T8: Frontend Hooks And Types

**Purpose:** expose V3 commands to React without tying UI to raw invoke calls.

**Files:**

- Modify: `src/types/index.ts`
- Create: `src/hooks/useHistoricalStats.ts`
- Create: `src/hooks/useCodeHealth.ts`
- Test: `src/__tests__/hooks/useHistoricalStats.test.tsx`
- Test: `src/__tests__/hooks/useCodeHealth.test.tsx`

**Acceptance Criteria:**

- Hooks pass repo/workspace/period params correctly.
- Hooks are disabled when required repo/scope is missing.

**Commit:** `feat(ui): add v3 analytics hooks`

---

## Ticket V3-T9: Frontend Pages

**Purpose:** add pages for seasons, awards, records, and code health.

**Files:**

- Create: `src/pages/Seasons.tsx`
- Create: `src/pages/Awards.tsx`
- Create: `src/pages/Records.tsx`
- Create: `src/pages/CodeHealth.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`

**Acceptance Criteria:**

- Pages use existing selected repo/workspace scope.
- Empty states explain when scans are needed.
- Sidebar exposes the new views.

**Commit:** `feat(ui): add v3 analytics pages`

---

## Ticket V3-T10: Later Advanced Metrics

**Purpose:** extend V3 after MVP.

**Metrics:**

- Context Switching Index.
- Focus Score.
- Review Risk Proxy.
- Refactor vs Feature Signal.
- Code Volatility.
- Coupling Graph.

**Recommended Commit Series:**

- `feat(health): add focus and context switching metrics`
- `feat(health): add review risk proxy`
- `feat(health): classify activity signals`
- `feat(health): add code volatility metrics`
- `feat(health): add file coupling graph`

---

## Parallel Execution Plan

### Agent A: Backend Historical Analytics

Owns:

- `src-tauri/src/commands/history.rs`
- tests inside `history.rs`

Does not modify:

- `src-tauri/src/lib.rs`
- frontend files

### Agent B: Backend Code Health Analytics

Owns:

- `src-tauri/src/commands/health.rs`
- tests inside `health.rs`

Does not modify:

- `src-tauri/src/lib.rs`
- frontend files

### Agent C: Frontend V3 Hooks And Pages

Owns:

- `src/types/index.ts`
- `src/hooks/useHistoricalStats.ts`
- `src/hooks/useCodeHealth.ts`
- `src/pages/Seasons.tsx`
- `src/pages/Awards.tsx`
- `src/pages/Records.tsx`
- `src/pages/CodeHealth.tsx`
- hook tests

Does not modify:

- Rust files
- `src/App.tsx`
- `src/components/Sidebar.tsx`

### Main Integrator

Owns:

- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`
- `src/App.tsx`
- `src/components/Sidebar.tsx`
- final test/build fixes
- commits and push

---

## Verification

- `pnpm exec jest --runInBand`
- `pnpm build`
- `cargo test` in `src-tauri`
- `cargo clippy --all-targets -- -D warnings` in `src-tauri`
- optional `pnpm run site:build` if Pages docs are updated
