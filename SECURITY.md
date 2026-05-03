# Security Policy

GitPulse is a local desktop application that scans repositories selected by the
user and stores analytics in a local SQLite database.

## Supported Versions

Security fixes target the latest published release and the `master` branch.
Pre-release builds are supported on a best-effort basis.

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability.

Report security concerns through GitHub private vulnerability reporting if it is
enabled for the repository. If that is not available, open a minimal public
issue asking for a private contact channel without including exploit details.

Useful reports include:

- affected version or commit
- operating system
- reproduction steps
- expected impact
- whether local repository contents or filesystem paths are exposed

## Scope

Security-sensitive areas include:

- local file and Git repository access
- Tauri command boundaries
- SQLite database handling
- release artifacts and GitHub Actions workflows
- any future import/export or sharing feature

GitPulse should not transmit repository data by default.

## Dependency Alert Handling

Current transitive Dependabot alerts, verification commands, and the recommended
no-forced-upgrade decision are tracked in
[docs/security-dependency-status.md](docs/security-dependency-status.md).

Do not dismiss transitive dependency alerts without recording the upstream
blocker, the verification command, and the condition that will trigger a recheck.
