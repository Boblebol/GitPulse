# CI, GitHub Pages, Releases Design

## Goal

Publish GitPulse from a real `master` branch with CI, GitHub Pages documentation, release automation, and a maintained changelog.

## Branching

- `master` is created from the current `main` tip.
- New CI, Pages, release, and documentation work lands on `master`.
- `origin/master` is pushed after verification.
- `main` remains available and is not deleted.

## CI

The repository gets a standard verification workflow:

- frontend install with pnpm
- Jest tests
- production frontend build
- GitHub Pages site build
- Rust tests
- Rust clippy with `-D warnings`

Linux Tauri dependencies are installed in CI before Rust commands so the Tauri crate can compile.

## GitHub Pages

GitHub Pages is a dedicated static React/Vite site in `site/`, separate from the Tauri app in `src/`.

The site includes:

- landing page
- product features
- architecture overview
- documentation hub
- tutorials
- build instructions
- release process
- changelog

The Pages workflow builds `site/` into `site-dist/` and deploys from `master`.

## Releases

Release automation is tag-driven:

- pushing `v*` tags runs release builds
- GitHub Actions builds desktop bundles on Linux, macOS, and Windows
- artifacts are attached to a GitHub Release draft
- release notes point to `CHANGELOG.md`

A separate manual desktop build workflow lets maintainers test packaged builds without publishing a release.

## Changelog

`CHANGELOG.md` is maintained manually in a Keep a Changelog style. The Pages site contains a public changelog section and links back to the source changelog.

## Testing

Required local verification before push:

- `pnpm exec jest --runInBand`
- `pnpm build`
- `pnpm run site:build`
- `cargo test` from `src-tauri`
- `cargo clippy --all-targets -- -D warnings` from `src-tauri`
