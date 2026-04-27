# Accessibility And Onboarding Guide

This document defines how GitPulse explains itself without making the app feel
heavy. The app is dense by design, so help must be contextual, keyboard
reachable, and concise.

## Help Patterns

Use `HelpTooltip` for short definitions.

- Good: explaining "churn", "co-touch", "scope", "silo risk", or a compact
  icon action.
- Bad: hiding required setup instructions in a tooltip.
- Keep tooltip copy to one or two sentences.
- Tooltips must be reachable by keyboard focus, not only hover.

Use `FieldHint` when the user can make a blocking mistake.

- Good: repository path, branch selection, period key, scoring formula.
- Bad: repeating a label in smaller text.
- Hints should stay visible because they prevent errors.

Use `PageHelp` on dense analytics pages.

- Good: Dashboard, Settings, Files, Code Health, Alias Manager.
- Bad: simple list pages where the heading and empty state already explain the
  task.
- Keep it collapsed by default and limit it to three bullets.

Use visible copy when the state is urgent or destructive.

- Good: scan locks, delete-all-data warnings, failed scans.
- Bad: putting safety warnings only behind a tooltip.

## GitPulse Glossary

- **Workspace:** A group of related repositories. Use one workspace for one
  product area, team, or client.
- **Repository:** A local Git repository GitPulse reads. GitPulse does not
  mutate the working tree.
- **Stats scope:** Repo scope reads one repository; workspace scope combines all
  repositories in the selected workspace.
- **Scan:** Indexes local Git history into GitPulse's SQLite database. Only one
  scan can run at a time.
- **Churn:** Line movement, usually insertions plus deletions, weighted by
  recency in health views.
- **Co-touch:** How often a file changes in the same commits as other files.
  High co-touch can indicate coupling.
- **Hotspot:** A file with enough activity, churn, ownership, or coupling
  signals to deserve inspection.
- **Silo risk:** A file or area dominated by one owner, which can concentrate
  knowledge.
- **Review risk:** Commits touching broad or complex areas that may need closer
  review.
- **Volatility:** Files changing repeatedly across time windows.
- **Alias:** A Git name/email identity. Merge aliases before trusting
  contributor comparisons.

## Accessibility Checklist

Before shipping a new interactive surface:

- Every icon-only button has an accessible name.
- Every input/select/textarea has a visible label or `aria-label`.
- Help that appears visually also works on keyboard focus.
- Toasts and async status updates use `role="status"` or `role="alert"`.
- Modals support Escape and move focus inside the dialog when opened.
- Charts have nearby text or an `aria-label` summarizing what they show.
- Disabled actions explain why when the reason is not obvious.
- Focus is visible against the navy/orange palette.

## Copy Rules

- Prefer task language: "Add a repository", "Run Sync", "Clean aliases".
- Avoid explaining implementation details unless the user needs the mental
  model to avoid mistakes.
- Avoid sports metaphors in safety, setup, or error copy.
- Keep tooltips calm and factual.
- If the user needs to remember it later, put it in `PageHelp` or docs, not a
  one-time tour step.

## Patterns To Avoid

- Tooltip-only setup requirements.
- Multiple controls with the same accessible name in one dialog.
- Native `title` attributes as the only explanation.
- Auto-dismissed errors with no `role="alert"`.
- Always-open explanatory cards on every page.
- Long paragraphs inside tooltips.
