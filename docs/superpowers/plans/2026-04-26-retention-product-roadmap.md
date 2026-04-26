# GitPulse Retention Product Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** turn GitPulse from a one-off repository analyzer into a product users reopen because it gives recurring, useful codebase insight.

**Architecture:** ship retention features in layers: first-run activation, recurring insights, then share/export workflows. Keep everything local-first and explainable; avoid individual surveillance framing by presenting developer metrics as codebase context and team health signals.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, Tauri 2 commands, Rust, SQLite, Jest, Cargo tests.

---

## Milestones

### Milestone 1: Activation And Product Tour

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

### Milestone 4: Weekly Recap

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

### Milestone 5: Watchlists And Compare Mode

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

### Milestone 6: Shareable Reports

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

### Milestone 7: Habit And Delight Polish

**Outcome:** the app feels alive without becoming noisy.

**Scope:**

- HOF refinements and positive code-health achievements.
- "Hotspot cooled down", "bus factor improved", "knowledge spread", "cleanup week".
- Optional reminder preferences once recaps exist.

**Acceptance:**

- Achievements reward codebase improvements, not raw individual output.
- Users can ignore/disable non-critical nudges.

**Commit:** `feat(achievements): add code health achievements`

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
