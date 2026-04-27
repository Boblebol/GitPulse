# Changelog

All notable changes to GitPulse are documented here.

This project follows a pragmatic Keep a Changelog format. Versions use Git tags
named `vX.Y.Z` or release-candidate tags named `vX.Y.Z-rc.N`.

## [Unreleased]

## [0.2.0] - 2026-04-27

### Changed

- Promotes the `0.2.0` release-candidate line to a stable release.
- Stable desktop bundles now include the onboarding, accessibility, scan
  locking, data reset, icon, release automation, and open-source readiness work
  documented in the `0.2.0-rc.1` through `0.2.0-rc.9` entries below.

## [0.2.0-rc.9] - 2026-04-27

### Added

- Beginner-friendly onboarding help across the app with page summaries, field
  hints, and keyboard-accessible tooltips for key metrics and workflows.
- A refreshed product tour focused on first-run setup, demo data, scan
  expectations, dashboard reading, and alias cleanup.
- Internal accessibility and onboarding guidance in
  `docs/accessibility-onboarding.md`.

### Changed

- Dashboard, Settings, Files, Code Health, Aliases, and sidebar controls now
  explain ambiguous terms without overloading the main UI.

### Fixed

- Core accessibility affordances now include a skip link, visible focus styles,
  live-region toast semantics, chart summaries, and clearer ARIA labels for
  icon-only controls.

## [0.2.0-rc.8] - 2026-04-27

### Fixed

- Alias merges and alias moves are now blocked while a repository scan is
  running to avoid SQLite write-lock conflicts during indexing.
- GitPulse now enforces a single running scan at a time, with both backend
  protection and disabled scan controls in the UI.

## [0.2.0-rc.7] - 2026-04-27

### Fixed

- Git scan rename handling now avoids `UNIQUE constraint failed:
  files.repo_id, files.current_path` when a rename target path already exists
  in the local file index.

## [0.2.0-rc.6] - 2026-04-27

### Added

- Settings now includes a confirmed "Delete all my data" action that clears
  local SQLite app data and GitPulse browser storage without touching scanned
  Git repositories.
- The app icon now uses the Git branch symbol inside an orange basketball,
  generated into Tauri desktop icon assets.
- Design documentation now captures the app palette, icon direction, landing
  parity, and destructive data-reset UX.

### Changed

- GitHub Actions workflows now use Node 24-compatible action versions to avoid
  Node 20 deprecation warnings.
- The GitHub Pages landing page now matches the dark navy and orange app
  palette instead of the previous teal/green visual treatment.
- Release docs and the landing page now explain the unsigned macOS install
  step: `xattr -cr /Applications/GitPulse.app`.

## [0.2.0-rc.5] - 2026-04-26

### Changed

- Release publish job now passes the repository explicitly to `gh release edit`
  so it can publish the draft created by matrix build jobs.
- Public release docs and the GitHub Pages site now point users to published
  release downloads instead of implying a manual draft-publish step.

## [0.2.0-rc.4] - 2026-04-26

### Changed

- Release workflow now uploads assets to a draft release first, then publishes
  the release after all platform bundles are attached.

## [0.2.0-rc.3] - 2026-04-26

### Changed

- GitHub Pages workflow now enables Pages automatically when the repository is
  configured to deploy from GitHub Actions.
- Windows MSI builds now use the Tauri app version `0.2.0-3` because the MSI
  target requires numeric-only prerelease identifiers.

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

[Unreleased]: https://github.com/Boblebol/GitPulse/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.9...v0.2.0
[0.2.0-rc.9]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.8...v0.2.0-rc.9
[0.2.0-rc.8]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.7...v0.2.0-rc.8
[0.2.0-rc.7]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.6...v0.2.0-rc.7
[0.2.0-rc.6]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.5...v0.2.0-rc.6
[0.2.0-rc.5]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.4...v0.2.0-rc.5
[0.2.0-rc.4]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.3...v0.2.0-rc.4
[0.2.0-rc.3]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.2...v0.2.0-rc.3
[0.2.0-rc.2]: https://github.com/Boblebol/GitPulse/compare/v0.2.0-rc.1...v0.2.0-rc.2
[0.2.0-rc.1]: https://github.com/Boblebol/GitPulse/compare/v0.1.0...v0.2.0-rc.1
[0.1.0]: https://github.com/Boblebol/GitPulse/releases/tag/v0.1.0
