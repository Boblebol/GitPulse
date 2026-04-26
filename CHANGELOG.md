# Changelog

All notable changes to GitPulse are documented here.

This project follows a pragmatic Keep a Changelog format. Versions use Git tags
named `vX.Y.Z` or release-candidate tags named `vX.Y.Z-rc.N`.

## [Unreleased]

No unreleased changes yet.

## [0.2.0-rc.2] - 2026-04-26

### Changed

- Desktop Build now runs on every `master` push and uploads Linux, macOS, and
  Windows bundles as GitHub Actions artifacts.
- Release tags now publish visible GitHub prereleases/releases instead of draft
  releases, so app downloads are available from the release page.
- Release workflow can also be run manually for an existing tag.

## [0.2.0-rc.1] - 2026-04-26

### Added

- Weekly Recap command and UI for selected repositories or workspaces, with
  previous-week regeneration and copyable Markdown.
- Watchlists & Compare page with local tracked repos/files/directories and
  current-vs-previous period deltas for activity and code-area signals.
- Shareable Reports page with deterministic Markdown exports for Dashboard,
  Code Health, and Weekly Recap views.
- Achievements page for positive code-health improvements such as cooled
  hotspots, knowledge spread, lower volatility, and cleanup-heavy periods.
- GitHub Pages documentation site covering the product, architecture, tutorials,
  build instructions, releases, and changelog.
- GitHub Actions CI for frontend tests, frontend build, site build, Rust tests,
  and Rust clippy.
- Manual desktop build workflow for packaged Tauri artifacts.
- Tag-driven release workflow for GitHub Release drafts.
- Release process documentation in `docs/release.md`.
- Open source project files: MIT license, contributing guide, security policy,
  code of conduct, issue templates, and pull request template.

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

[Unreleased]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.2...HEAD
[0.2.0-rc.2]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.1...v0.2.0-rc.2
[0.2.0-rc.1]: https://github.com/Boblebol/GitPulse/compare/v0.1.0...v0.2.0-rc.1
[0.1.0]: https://github.com/Boblebol/GitPulse/releases/tag/v0.1.0
