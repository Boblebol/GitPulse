# CI Pages Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `master` release branch with CI, GitHub Pages documentation, desktop build workflows, release automation, and changelog support.

**Architecture:** Keep the production Tauri app unchanged. Add a separate static React/Vite documentation site under `site/`, GitHub Actions workflows under `.github/workflows/`, and release documentation under `docs/release.md` plus `CHANGELOG.md`.

**Tech Stack:** GitHub Actions, pnpm, Vite, React 19, TypeScript, Tauri 2, Rust, Cargo, GitHub Pages.

---

## File Map

- `.gitignore`: ignore `.superpowers/` and `site-dist/`.
- `CHANGELOG.md`: public human-maintained release history.
- `docs/release.md`: maintainer release process.
- `.github/workflows/ci.yml`: frontend/site/Rust verification.
- `.github/workflows/pages.yml`: GitHub Pages deployment.
- `.github/workflows/desktop-build.yml`: manual packaged desktop builds.
- `.github/workflows/release.yml`: tag-driven GitHub Release workflow.
- `vite.site.config.ts`: Vite config for the public site.
- `tsconfig.site.json`: TypeScript settings for the public site.
- `site/index.html`: Pages entry point.
- `site/src/main.tsx`: public site application content.
- `site/src/styles.css`: public site layout and responsive styling.
- `package.json`: add site scripts.

## Tasks

### Task 1: Branch And Planning Docs

- [x] Create `master` from `main`.
- [x] Ignore `.superpowers/` and `site-dist/`.
- [x] Save this implementation plan and the design spec.
- [ ] Commit with `docs: plan ci pages and releases`.

### Task 2: Release Documentation

- [ ] Create `CHANGELOG.md` with an unreleased section and the current `0.1.0` feature baseline.
- [ ] Create `docs/release.md` documenting version bump, changelog update, local verification, tag creation, and GitHub Release publication.
- [ ] Commit with `docs: add changelog and release process`.

### Task 3: GitHub Actions

- [ ] Create CI workflow for frontend tests, app build, site build, Rust tests, and clippy.
- [ ] Create Pages workflow that builds `site-dist/` from `master` and deploys to GitHub Pages.
- [ ] Create manual desktop build workflow that uploads platform bundle artifacts.
- [ ] Create tag-driven release workflow that uploads Tauri artifacts to GitHub Releases.
- [ ] Commit with `ci: add verification pages and release workflows`.

### Task 4: Public GitHub Pages Site

- [ ] Add the Vite site config and TypeScript site config.
- [ ] Add package scripts `site:dev`, `site:build`, and `site:preview`.
- [ ] Build the public site with landing, architecture, docs, tutorials, build guide, release guide, and changelog sections.
- [ ] Commit with `feat(site): add github pages documentation site`.

### Task 5: Verification And Push

- [ ] Run `pnpm exec jest --runInBand`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm run site:build`.
- [ ] Run `cargo test` in `src-tauri`.
- [ ] Run `cargo clippy --all-targets -- -D warnings` in `src-tauri`.
- [ ] Start a local site preview URL.
- [ ] Push `master` to `origin/master`.
