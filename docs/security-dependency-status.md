# Security Dependency Status

Last reviewed: 2026-05-03.

This document tracks current Dependabot security alerts that remain in the
Tauri/Rust dependency graph after compatible updates. The recommended decision
for the current release is to monitor these alerts with explicit blockers, not
force a risky Tauri, GTK, or Cargo patch override.

## Current Alerts

### `glib 0.18.5`

- Severity: medium.
- Status: open, upstream blocked.
- Path: Linux desktop stack through `gtk 0.18.2`, `webkit2gtk 2.0.2`,
  `wry 0.54.4`, `tauri-runtime-wry 2.10.1`, and `tauri 2.10.3`.
- Decision: do not force `glib 0.20.x` with `[patch]` or a direct override. The
  current GTK line requires `glib = "^0.18"`, so a safe fix needs an
  upstream-compatible Tauri/wry/GTK update.

### `rand 0.7.3`

- Severity: low.
- Status: open, upstream blocked.
- Path: build-time transitive path through `selectors 0.24.0`,
  `kuchikiki 0.8.8-speedreader`, and `tauri-utils 2.8.3`.
- Decision: keep monitoring `selectors`, `kuchikiki`, and `tauri-utils`. The
  graph already also contains `rand 0.8.6`; the remaining alert is the older
  transitive build dependency.

These are not direct GitPulse dependencies. They should not be dismissed as
"ignored"; if GitHub requires a dismissal, link to this document and use an
upstream-blocked rationale with a release or date to recheck.

## Verification Commands

Check the local dependency paths:

```bash
cargo tree --manifest-path src-tauri/Cargo.toml --target all -i glib@0.18.5
cargo tree --manifest-path src-tauri/Cargo.toml -i rand@0.7.3
cargo tree --manifest-path src-tauri/Cargo.toml -i rand@0.8.6
```

Check whether upstream packages have a compatible update available without
writing `Cargo.lock`:

```bash
cargo update --manifest-path src-tauri/Cargo.toml --dry-run \
  tauri tauri-runtime-wry wry gtk webkit2gtk tauri-utils kuchikiki selectors
```

When a compatible update appears, apply it on a dedicated branch and run:

```bash
pnpm exec jest --runInBand
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm tauri build
```

If the GitHub CLI token has access to Dependabot alerts, confirm the remote
state with:

```bash
gh api repos/Boblebol/GitPulse/dependabot/alerts \
  --jq '
    .[]
    | select(
        .dependency.package.name == "glib"
        or .dependency.package.name == "rand"
      )
    | {
        state,
        package: .dependency.package.name,
        severity: .security_advisory.severity
      }
  '
```

## Decision Policy

- Keep Dependabot enabled for Cargo, npm, and GitHub Actions.
- Prefer ordinary compatible updates over `[patch.crates-io]`, `--precise`
  overrides, or SemVer-breaking dependency jumps.
- Recheck this status before each release candidate and whenever Dependabot
  opens a Tauri, wry, GTK, WebKit, `tauri-utils`, `kuchikiki`, or `selectors`
  update.
- Escalate from monitored risk to active remediation if either alert becomes a
  direct runtime exposure for GitPulse, the severity increases, or an upstream
  compatible fix lands.

## Minimal Desktop E2E Roadmap

Current QA covers frontend Jest tests, Rust tests, strict Rust clippy, and
desktop packaging. The remaining gap is that CI does not launch a real Tauri
desktop WebView and drive the UI through the Rust command boundary.

Use Tauri WebDriver for the first real desktop E2E lane. Tauri documents
desktop WebDriver support for Linux and Windows through `tauri-driver`; macOS is
not a blocking target because it does not provide a desktop WKWebView driver.

Actionable roadmap:

1. Add a small `e2e` harness using WebdriverIO or Selenium plus `tauri-driver`.
   Start with Linux because it matches the existing Ubuntu CI environment.
2. Create an isolated fixture Git repository during test setup with a few commits,
   files, and authors. Point app data and config directories at temporary paths
   so the test never reads or writes a developer's real GitPulse data.
3. Add one smoke test: launch the Tauri app, add the fixture repository, run a
   scan, wait for completion, and assert that Dashboard or Reports shows the
   scanned repository data.
4. Add a Linux CI job using `webkit2gtk-driver`, `xvfb`, and
   `cargo install tauri-driver --locked`. Keep it non-blocking until it has a
   short green history, then make it required for pull requests.
5. Add Windows coverage only after the Linux lane is stable. Keep macOS to manual
   packaged-build smoke checks unless upstream Tauri desktop WebDriver support
   changes.

Useful upstream references:

- Tauri WebDriver: https://v2.tauri.app/develop/tests/webdriver/
- Tauri WebDriver CI: https://v2.tauri.app/develop/tests/webdriver/ci/
