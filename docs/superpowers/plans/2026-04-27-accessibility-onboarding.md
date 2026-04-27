# Accessibility Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accessible, low-noise help and onboarding improvements for new GitPulse users.

**Architecture:** Create small reusable help primitives, then integrate them into the highest-friction pages. Keep page copy concise and colocate explanations near controls instead of adding a large always-visible help panel.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Jest, Testing Library.

---

## Files

- Create: `src/components/HelpTooltip.tsx`
- Create: `src/components/FieldHint.tsx`
- Create: `src/components/PageHelp.tsx`
- Create: `src/__tests__/components/HelpPrimitives.test.tsx`
- Create: `docs/accessibility-onboarding.md`
- Modify: `src/components/Layout.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/ProductTour.tsx`
- Modify: `src/components/Toast.tsx`
- Modify: `src/components/AnalysisScopeToggle.tsx`
- Modify: `src/components/TimeRangePicker.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Files.tsx`
- Modify: `src/pages/CodeHealth.tsx`
- Modify: `src/pages/AliasManager.tsx`
- Modify: related Jest tests where accessible names or new help content need coverage.

## Tasks

### Task 1: Help Primitives

- [ ] Write failing tests in `src/__tests__/components/HelpPrimitives.test.tsx`:
  - `HelpTooltip` renders a button trigger with an accessible name.
  - Help content is hidden before focus and visible after keyboard focus.
  - `FieldHint` links copy with a stable id.
  - `PageHelp` renders a collapsed `details` block with a summary.
- [ ] Run `pnpm exec jest src/__tests__/components/HelpPrimitives.test.tsx --runInBand` and verify the tests fail because components do not exist.
- [ ] Implement `HelpTooltip`, `FieldHint`, and `PageHelp`.
- [ ] Run the component test again and verify it passes.

### Task 2: Global Accessibility Shell

- [ ] Add a skip link in `Layout` that targets the main region.
- [ ] Name the sidebar nav with `aria-label="Primary navigation"`.
- [ ] Give `main` an id and accessible label.
- [ ] Add global focus-visible styling in `src/index.css`.
- [ ] Make toast notifications use `role="status"` for success and `role="alert"` for errors.
- [ ] Add or update tests for toast live-region behavior.

### Task 3: Product Tour

- [ ] Write a failing test proving Escape closes the product tour.
- [ ] Write a failing test proving the dialog focuses a tour control when opened.
- [ ] Rewrite the tour steps for beginner task flow:
  1. Try the demo.
  2. Create a workspace.
  3. Add a repository and branch.
  4. Run one scan at a time.
  5. Read the Dashboard first.
  6. Clean aliases before trusting contributor metrics.
- [ ] Implement Escape handling and focus-on-open.
- [ ] Run `pnpm exec jest src/__tests__/components/ProductTour.test.tsx --runInBand`.

### Task 4: Page Integrations

- [ ] Add `PageHelp` to Dashboard, Settings, Files, Code Health, and Aliases.
- [ ] Add `HelpTooltip` to jargon terms and compact controls:
  - Stats Scope, Workspace, Repository, Sync Repo, Time range.
  - Churn, co-touch, hotspot, silo risk, review risk, volatility.
  - Alias merge/reassign and scan-lock banner.
- [ ] Add `FieldHint` to repository path, display name, branch, formula, and period key fields.
- [ ] Avoid tooltip-only essential instructions. If a mistake would block progress, use persistent hint text.
- [ ] Update page tests for a small number of critical help affordances.

### Task 5: Internal Documentation

- [ ] Add `docs/accessibility-onboarding.md`.
- [ ] Include rules for tooltip vs hint vs page help.
- [ ] Include a glossary of GitPulse metrics.
- [ ] Include a keyboard/screen-reader checklist.
- [ ] Include examples of bad help patterns to avoid.

### Task 6: Verification

- [ ] Run `pnpm exec jest --runInBand`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm run site:build`.
- [ ] Run `git diff --check`.
- [ ] Review the diff skeptically for noisy copy, unreachable help, and accidental layout churn.
