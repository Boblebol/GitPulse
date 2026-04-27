# Accessibility Onboarding Design

## Goal

Make GitPulse easier to understand for people arriving without product context,
while improving keyboard and screen-reader access. The UI should explain terms
and blocked states only where the user needs them, without turning the app into
documentation.

## Current State

GitPulse already has a first-run product tour, demo mode, sidebar navigation,
and clear page headers. The gaps are concentrated around:

- jargon-heavy analytics terms such as churn, co-touch, scope, formula, and
  silo risk;
- controls that rely on placeholder text or icon-only affordances;
- transient feedback that is not announced through live regions;
- a product tour dialog without explicit Escape handling or focus management;
- charts that have visual value but little text context for assistive tech.

## Design

Use progressive disclosure rather than broad explanatory text.

- `HelpTooltip` explains short terms and icon buttons. It opens on hover and
  focus, uses a real button trigger, and connects the bubble through
  `aria-describedby`.
- `FieldHint` gives concise persistent help below fields where mistakes are
  likely, especially repository path, branch, and scoring formula.
- `PageHelp` is a compact details/summary block for pages with dense metrics.
  It stays collapsed by default and explains the page's mental model in two or
  three bullets.

The tour stays modal but becomes more beginner-oriented: demo first, then
workspace, repo, scan, dashboard, and aliases. It must close on Escape and move
focus to the first actionable button when opened.

Global accessibility improvements should be quiet and mechanical: skip link,
named navigation, named main area, visible keyboard focus, live toasts, and live
scan status.

## Scope

Implement the pattern on the surfaces that most affect onboarding:

- Sidebar: nav/help/demo context and scope explanation.
- Dashboard: empty state, scan actions, chart summary, and glossary for key
  metrics.
- Settings: workspace/repo setup, branch picker, formula, and delete data.
- Files: churn and co-touch explanations.
- Code Health: hotspots, silo risk, review risk, volatility, and period key.
- Aliases: merge/reassign explanation and locked state.

Do not convert every visual list into semantic tables in this pass. That is a
larger structural change and should follow after the help model is proven.

## Acceptance Criteria

- New users can discover demo, workspace, repo, scan, dashboard, and aliases
  from in-app help without reading external docs.
- Help is keyboard reachable and screen-reader described.
- Toasts and scan status are announced through live regions.
- The product tour supports Escape and focus on open.
- The internal doc defines when to use tooltip, hint, page help, and visible
  copy.
- Tests cover the reusable help primitives, tour accessibility, and at least
  one page integration.
