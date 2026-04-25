# GitPulse — PRD v1.0

## What it is

Local Tauri 2 desktop app for deep Git repository analysis. Gives an NBA box-score style view of developer activity across one or multiple repos.

## Core features

### Repos & workspaces
- A **workspace** groups N repos (e.g. `backend` + `frontend`)
- Each repo has one active branch selected for analysis
- Analysis runs in a `git worktree` — the user's working tree is never touched
- Scan strategy: full scan on first add, incremental on rescan (from last indexed SHA)

### Alias system
- Multiple git identities (name + email combinations) map to one canonical developer
- Merging aliases triggers SQL-only recalc of all aggregates — no Git re-parse
- Unassigned aliases shown prominently for review

### Stats dimensions
| Dimension | Key metrics |
|---|---|
| Per developer | commits, +lines/-lines, files touched, active days, streak, avg commit size |
| Per file | commit count, churn score, unique authors, co-touch score, first/last seen |
| Per directory | recursive aggregation of file metrics, drill-down to subdirs |

**Churn score**: `(insertions + deletions) / age_days` — measures instability  
**Co-touch score**: how often this file is modified in the same commit as others (coupling signal)

### Time filters
- All time (global)
- Custom date range
- Last 7 / 14 / 30 / 90 days
- Week / month navigation

### NBA Box Score
Daily developer card showing:
- Commits, +lines, -lines, files touched, churn indicator, streak
- Top file of the day
- **Player score** (0–100 percentile vs own history):
  ```
  raw = (commits×10) + (insertions×0.5) - (deletions×0.3) + (files_touched×2) + (streak≥3 ? 3 : 0)
  score = percentile(raw, developer_history)
  ```
- Formula stored in DB, editable, recalculates on save

### Views
1. **Dashboard** — repo overview, top files, top devs, activity timeline
2. **Files** — drill-down tree sorted by churn/commits/authors
3. **Developers** — cards per dev with stats and streaks
4. **Box Scores** — chronological feed + "day view" comparing all devs side by side
5. **Alias Manager** — merge identities, unassigned shown in red

## Out of scope (v1)
- Export (CSV, PDF, PPTX)
- Multi-user / sharing
- Authentication
- GitHub/GitLab API integration
- Inline code diff viewer
- PR/MR integration

## Data model summary

**3-layer SQLite database:**
1. **Raw facts** (append-only): `commits`, `commit_file_changes`
2. **Reference data**: `developers`, `aliases`, `files`, `file_name_history`, `repos`, `workspaces`, `metric_formulas`
3. **Aggregates** (recalculated on demand): `stats_daily_developer`, `stats_daily_file`, `stats_daily_directory`, `stats_developer_global`, `stats_file_global`, `stats_directory_global`

All UI reads from layer 3. All recalcs are pure SQL triggered by Rust. Git re-parse only for new commits.

## Non-goals
- Perfect accuracy on binary files / very large monorepos (v2)
- Indexes on aggregate tables (add if needed, not preemptively)
