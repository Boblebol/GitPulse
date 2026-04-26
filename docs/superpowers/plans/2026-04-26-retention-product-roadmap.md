# GitPulse Retention Product Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** turn GitPulse from a one-off repository analyzer into a product users reopen because it gives recurring, useful codebase insight.

**Architecture:** ship retention features in layers: first-run activation, recurring insights, then share/export workflows. Keep everything local-first and explainable; avoid individual surveillance framing by presenting developer metrics as codebase context and team health signals.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, Tauri 2 commands, Rust, SQLite, Jest, Cargo tests.

---

## Milestones

## Publishable Release Train

| Version | Ticket | Release Name | Status | Publishable Scope |
|---|---:|---|---|---|
| `v4.0.0` | `V4-001` | Activation Tour | Shipped in `645fabd` | First-run product tour, persisted dismissal, sidebar reopen entry point. |
| `v4.1.0` | `V4-002` | Demo Aha Moment | Shipped in `75b9971` | Demo mode, sample Dashboard data, improved no-repo activation state. |
| `v4.2.0` | `V4-003` | Insights Inbox | Shipped in `69b0262` + `991b4d3` | Local insight feed with severity/category labels and Dashboard preview. |
| `v4.3.0` | `V4-004` | Weekly Recap | Shipped in `c433f7d` + `40cba73` | Weekly repo/workspace recap with copyable Markdown. |
| `v4.4.0` | `V4-005` | Watchlists And Compare | Shipped in `9fb7d4c` + `9f0bbbb` + `0d06ed3` | Watch files/directories/repos and compare periods. |
| `v4.5.0` | `V4-006` | Shareable Reports | Shipped in `b3788b8` + `276a4e6` | Markdown exports for Dashboard, Code Health, and recaps. |
| `v4.6.0` | `V4-007` | Achievements Polish | Shipped in `01e841d` + `c6e9560` | Positive code-health achievements with ignorable local nudges. |
| `v0.2.0-rc.1` | `V4-008` | Open Source Release Candidate | Shipped in `bc34aec` | OSS hygiene, RC versions, changelog, and prerelease workflow. |
| `v0.2.0-rc.2` | `V4-009` | Public Downloads Release Candidate | Prepared for tag | Published prereleases and desktop artifacts from CI. |

Release rule: each version must be independently useful, tested, and documented before tagging. Avoid bundling half-built later milestones into an earlier release.

### Milestone 1: Activation And Product Tour

**Ticket:** `V4-001`

**Publishable version:** `v4.0.0`

**Status:** Shipped in `645fabd feat(onboarding): add product tour`.

**Outcome:** new users understand the app quickly and know the shortest path to value.

**Scope:**

- First-run product tour.
- Reopen tour from the sidebar.
- Activation checklist on Dashboard or tour.
- Copy focused on local-first scanning, workspace/repo setup, scan, dashboard, Code Health, NBA views, Hall of Fame.

**Acceptance:**

- Product tour opens on first launch unless dismissed.
- Dismiss state persists in `localStorage`.
- Sidebar exposes a way to reopen the tour.
- Jest covers context state and tour UI navigation.

**Commit:** `feat(onboarding): add product tour`

### Milestone 2: Demo And Empty-State Aha Moments

**Ticket:** `V4-002`

**Publishable version:** `v4.1.0`

**Status:** Shipped in `75b9971 feat(onboarding): add demo mode`.

**Outcome:** users can experience GitPulse before connecting a real repository.

**Scope:**

- Demo mode with static sample insights and sample charts.
- Better empty states on Dashboard, Code Health, Seasons, Awards, Records, Hall of Fame.
- "Try demo" and "Add first repo" calls to action.

**Acceptance:**

- Empty app no longer feels blank.
- Demo does not mutate the SQLite database.
- Tests cover demo state and empty-state routing.

**Commit:** `feat(onboarding): add demo mode`

### Milestone 3: Insights Inbox

**Ticket:** `V4-003`

**Publishable version:** `v4.2.0`

**Status:** Shipped in `69b0262 feat(insights): add local insight command` and `991b4d3 feat(ui): add insights inbox`.

**Outcome:** users have a reason to return after scans.

**Scope:**

- Read-only insight engine over existing stats: new hotspot, cooled hotspot, silo risk, bus factor change, high review risk, volatile file, coupling pair, record broken.
- `Insights` page plus Dashboard preview.
- Severity and category labels.

**Acceptance:**

- Insights are scoped by selected repo/workspace and time range where possible.
- Empty insight state explains what scan data is needed.
- Backend tests cover each insight category.

**Commit:** `feat(insights): add local insight inbox`

**V4-003 Ticket Breakdown:**

- `V4-003A`: Backend `get_insights(repo_id?, workspace_id?, from_date?, to_date?)` command.
- `V4-003B`: Frontend `useInsights` hook and `InsightRow` type.
- `V4-003C`: `Insights` page with category/severity cards.
- `V4-003D`: Dashboard preview and sidebar route.
- `V4-003E`: Release status update after verification.

**V4-003 Initial Insight Categories:**

- `hotspot`: high-churn/high-touch files to inspect first.
- `knowledge_silo`: files owned by too few authors.
- `review_risk`: large or broad commits that deserve review attention.
- `coupling`: files with high co-touch signals.
- `activity`: recent scoped activity summary.

### Milestone 4: Weekly Recap

**Ticket:** `V4-004`

**Publishable version:** `v4.3.0`

**Status:** Shipped in `c433f7d feat(recaps): add weekly recap command` and `40cba73 feat(ui): add weekly recap page`.

**Outcome:** GitPulse becomes a recurring review ritual.

**Scope:**

- Weekly recap command for selected repo/workspace.
- Summary sections: activity, health changes, notable files, awards, risks, records.
- Recap page with copyable Markdown.

**Acceptance:**

- Recap works without network access.
- Recap can be regenerated for previous weeks.
- Tests cover date bounds and Markdown output.

**Commit:** `feat(recaps): add weekly recap`

**V4-004 Ticket Breakdown:**

- `V4-004A`: Backend `get_weekly_recap(repo_id?, workspace_id?, week_start)` command.
- `V4-004B`: Frontend `useWeeklyRecap` hook and `WeeklyRecap` type.
- `V4-004C`: `Weekly Recap` page with week navigation and copyable Markdown.
- `V4-004D`: Sidebar and route entry point.
- `V4-004E`: Release status update after verification.

**V4-004 Initial Recap Sections:**

- `activity`: commits, insertions, deletions, active days.
- `standouts`: top developer and top file for the selected week.
- `insight`: highest-priority local insight for the selected scope and week.
- `markdown`: deterministic recap text for retros, standups, or OSS updates.

### Milestone 5: Watchlists And Compare Mode

**Ticket:** `V4-005`

**Publishable version:** `v4.4.0`

**Status:** Shipped in `9fb7d4c feat(watchlists): add local watchlist storage`, `9f0bbbb feat(compare): add period delta helpers`, and `0d06ed3 feat(ui): add watchlists compare page`.

**Outcome:** users track the parts of the codebase they care about.

**Scope:**

- Local watchlist for files, directories, and repos.
- Compare current period vs previous period.
- Compare before/after dates for refactors.

**Acceptance:**

- Watchlist persists locally.
- Compare mode shows deltas for commits, churn, health, hotspots, silos, volatility.
- Tests cover persistence and delta formulas.

**Commit:** `feat(watchlists): add tracked code areas`

**V4-005 Ticket Breakdown:**

- `V4-005A`: Local watchlist model, storage helpers, and React hook.
- `V4-005B`: Previous-period helper and metric delta helpers.
- `V4-005C`: `Watchlists & Compare` page with manual tracked files/directories/repos.
- `V4-005D`: Sidebar and route entry point.
- `V4-005E`: Release status update after verification.

**V4-005 Initial Compare Metrics:**

- `activity`: commits, churn, and files touched vs previous period.
- `code area`: hotspot proxy, silo risk proxy, and volatile file count for selected repo.
- `tracking`: persisted local watchlist scoped to selected repo/workspace.

### Milestone 6: Shareable Reports

**Ticket:** `V4-006`

**Publishable version:** `v4.5.0`

**Status:** Shipped in `b3788b8 feat(exports): add markdown report serializers` and `276a4e6 feat(ui): add shareable reports page`.

**Outcome:** users can bring GitPulse into retros, standups, OSS updates, and handoffs.

**Scope:**

- Export Dashboard/Code Health/Weekly Recap to Markdown.
- Optional HTML export after Markdown is stable.
- Include command snippets and "generated locally" note.

**Acceptance:**

- Exported Markdown is deterministic and readable.
- No proprietary local paths are included unless the user opts in.
- Tests cover Markdown serializers.

**Commit:** `feat(exports): add markdown reports`

**V4-006 Ticket Breakdown:**

- `V4-006A`: Deterministic Markdown serializers for Dashboard and Code Health reports.
- `V4-006B`: Reports page with Dashboard, Code Health, and Weekly Recap modes.
- `V4-006C`: Copy-to-clipboard Markdown workflow.
- `V4-006D`: Sidebar and route entry point.
- `V4-006E`: Release status update after verification.

**V4-006 Initial Report Types:**

- `dashboard`: activity totals, top developers, top files.
- `code_health`: hotspot proxy, silo risk proxy, volatile files, hot file table.
- `weekly`: existing Weekly Recap Markdown for the selected week.

### Milestone 7: Habit And Delight Polish

**Ticket:** `V4-007`

**Publishable version:** `v4.6.0`

**Status:** Shipped in `01e841d feat(achievements): add code health signals` and `c6e9560 feat(ui): add achievements page`.

**Outcome:** the app feels alive without becoming noisy.

**Scope:**

- Positive code-health achievements derived from current vs previous periods.
- "Hotspot cooled down", "knowledge spread", "volatility reduced", "cleanup week".
- Local ignore/show ignored workflow for non-critical achievement nudges.

**Acceptance:**

- Achievements reward codebase improvements, not raw individual output.
- Users can ignore/disable non-critical nudges.
- Tests cover the achievement engine and the Achievements page dismissal flow.

**Commit:** `feat(achievements): add code health achievements`

### Milestone 8: Open Source Release Candidate

**Ticket:** `V4-008`

**Publishable version:** `v0.2.0-rc.1`

**Status:** Prepared for `v0.2.0-rc.1` tag.

**Outcome:** GitPulse is ready for external contributors and release-candidate
desktop builds.

**Scope:**

- MIT license and project governance files.
- Bug report, feature request, and pull request templates.
- Version bump across frontend, Tauri, and Cargo metadata.
- Changelog section for `v0.2.0-rc.1`.
- Release workflow marks `-rc.` tags as prereleases.

**Acceptance:**

- Repository has the minimum public open source project files.
- Local verification passes before the RC tag is pushed.
- `v0.2.0-rc.1` creates a draft prerelease with desktop artifacts.

**Commit:** `chore(release): prepare v0.2.0-rc.1`

### Milestone 9: Public Downloads Release Candidate

**Ticket:** `V4-009`

**Publishable version:** `v0.2.0-rc.2`

**Status:** Prepared for `v0.2.0-rc.2` tag.

**Outcome:** public users can find app downloads from releases and CI artifacts.

**Scope:**

- Publish `v*` release workflow outputs instead of hiding them in drafts.
- Mark `-rc.` tags as prereleases.
- Allow manual release workflow dispatch for an existing tag.
- Run Desktop Build on `master` and upload per-platform artifacts.
- Document where to find release downloads and CI artifacts.

**Acceptance:**

- `v0.2.0-rc.2` creates a visible prerelease with app bundles.
- `Desktop Build` produces downloadable Actions artifacts on `master`.
- Pages workflow is retriggered after the repository is public.

**Commit:** `ci: publish desktop release downloads`

---

## Task 1: Product Tour State

**Files:**

- Create: `src/utils/productTour.ts`
- Modify: `src/context/AppContext.tsx`
- Test: `src/__tests__/context/AppContext.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests proving the tour defaults open, persists dismissal, and can be reopened:

```tsx
function ProductTourStateComponent() {
  const {
    isProductTourOpen,
    dismissProductTour,
    openProductTour,
  } = useAppContext();
  return (
    <div>
      <div data-testid="tour-open">{String(isProductTourOpen)}</div>
      <button onClick={dismissProductTour}>Dismiss Tour</button>
      <button onClick={openProductTour}>Open Tour</button>
    </div>
  );
}
```

Run:

```bash
pnpm exec jest src/__tests__/context/AppContext.test.tsx --runInBand
```

Expected: FAIL because product tour context fields do not exist.

- [ ] **Step 2: Implement storage helpers**

Create `src/utils/productTour.ts` with:

```ts
const PRODUCT_TOUR_DISMISSED_KEY = "gitpulse.productTour.dismissed";

export function hasDismissedProductTour(storage: Storage | undefined = window.localStorage): boolean {
  return storage?.getItem(PRODUCT_TOUR_DISMISSED_KEY) === "true";
}

export function markProductTourDismissed(storage: Storage | undefined = window.localStorage): void {
  storage?.setItem(PRODUCT_TOUR_DISMISSED_KEY, "true");
}

export function resetProductTourDismissed(storage: Storage | undefined = window.localStorage): void {
  storage?.removeItem(PRODUCT_TOUR_DISMISSED_KEY);
}
```

- [ ] **Step 3: Implement context state**

Extend `AppContextValue` with `isProductTourOpen`, `openProductTour`, `dismissProductTour`, and `resetProductTour`. Initialize open state from `hasDismissedProductTour()`.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm exec jest src/__tests__/context/AppContext.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/productTour.ts src/context/AppContext.tsx src/__tests__/context/AppContext.test.tsx
git commit -m "feat(onboarding): add product tour state"
```

## Task 2: Product Tour UI

**Files:**

- Create: `src/components/ProductTour.tsx`
- Create: `src/__tests__/components/ProductTour.test.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Write failing UI tests**

Test that the first step renders, Next advances, Back returns, Finish dismisses, and dismissed state hides the modal.

Run:

```bash
pnpm exec jest src/__tests__/components/ProductTour.test.tsx --runInBand
```

Expected: FAIL because `ProductTour` does not exist.

- [ ] **Step 2: Implement controlled modal**

Create a fixed overlay with six steps:

1. Welcome.
2. Workspace.
3. Repository and branch.
4. Scan.
5. Dashboard and insights.
6. Code Health, Seasons, Awards, Records, Hall of Fame.

Use context callbacks and familiar button styles already used in the app.

- [ ] **Step 3: Mount in layout**

Render `<ProductTour />` next to `<ToastContainer />` inside `src/components/Layout.tsx`.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm exec jest src/__tests__/components/ProductTour.test.tsx --runInBand
pnpm build
```

Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductTour.tsx src/components/Layout.tsx src/__tests__/components/ProductTour.test.tsx
git commit -m "feat(onboarding): add product tour UI"
```

## Task 3: Sidebar Reopen Entry Point

**Files:**

- Modify: `src/components/Sidebar.tsx`
- Test: `src/__tests__/components/ProductTour.test.tsx`

- [ ] **Step 1: Write failing test**

Test that a dismissed tour can be reopened from the sidebar button.

Run:

```bash
pnpm exec jest src/__tests__/components/ProductTour.test.tsx --runInBand
```

Expected: FAIL because sidebar has no reopen button.

- [ ] **Step 2: Add sidebar button**

Add a compact `Product Tour` button near the bottom controls using a lucide help icon and `openProductTour`.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm exec jest src/__tests__/components/ProductTour.test.tsx --runInBand
pnpm exec jest --runInBand
pnpm build
```

Expected: all frontend tests and build pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/__tests__/components/ProductTour.test.tsx
git commit -m "feat(onboarding): expose product tour"
```
