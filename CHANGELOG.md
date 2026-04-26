# Changelog

All notable changes to GitPulse are documented here.

This project follows a pragmatic Keep a Changelog format. Versions use Git tags
named `vX.Y.Z`.

## [Unreleased]

### Added

- Weekly Recap command and UI for selected repositories or workspaces, with
  previous-week regeneration and copyable Markdown.
- Watchlists & Compare page with local tracked repos/files/directories and
  current-vs-previous period deltas for activity and code-area signals.
- GitHub Pages documentation site covering the product, architecture, tutorials,
  build instructions, releases, and changelog.
- GitHub Actions CI for frontend tests, frontend build, site build, Rust tests,
  and Rust clippy.
- Manual desktop build workflow for packaged Tauri artifacts.
- Tag-driven release workflow for GitHub Release drafts.
- Release process documentation in `docs/release.md`.

## [0.1.0] - 2026-04-26

### Added

- Local Tauri 2 desktop app for Git repository analytics.
- Workspace and multi-repository scanning.
- Branch-aware scan state with durable incremental cursors.
- Pause and resume support for scan runs.
- Developer alias management with merge and single-alias reassignment.
- Scoped analytics for selected repository or all repos in a workspace.
- Time filters for all time, custom ranges, last 7/14/30/90 days, week
  navigation, and month navigation.
- Dashboard with overview cards, top developers, top files, and activity
  timeline.
- Developer, file, directory, and box score views.
- SQLite aggregate tables for daily and global developer/file/directory stats.
- Editable player score formula for NBA-style daily developer scoring.
- Rust and Jest test coverage for scanning, aggregation, stats hooks, context,
  and key UI flows.

[Unreleased]: https://github.com/Boblebol/GitPulse/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Boblebol/GitPulse/releases/tag/v0.1.0
