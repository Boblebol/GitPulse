# Contributing To GitPulse

Thanks for helping improve GitPulse. This project is a local-first desktop app,
so changes should preserve user privacy, offline usefulness, and clear
explainability.

## Development Setup

Install Node, pnpm, Rust, and the Tauri platform prerequisites for your OS.

```bash
pnpm install
pnpm tauri dev
```

For frontend-only work:

```bash
pnpm dev
```

## Verification

Run the relevant checks before opening a pull request. For release-facing or
cross-cutting changes, run the full suite:

```bash
pnpm exec jest --runInBand
pnpm build
pnpm run site:build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Product Principles

- Keep GitPulse local-first. Do not add telemetry or network calls without a
  clear opt-in design.
- Prefer codebase health insights over individual surveillance.
- Keep metrics explainable. A user should understand why a file, repo, or
  period is highlighted.
- Keep UI states complete: loading, empty, error, and scoped data behavior.
- Favor focused changes and tests over broad refactors.

## Pull Requests

1. Describe the problem and the user-facing outcome.
2. List the tests or commands you ran.
3. Include screenshots for UI changes when possible.
4. Call out migrations, release impacts, or data model changes.

Small, reviewed changes are easier to merge than large mixed refactors.
