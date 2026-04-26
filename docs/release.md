# Release Process

This document describes how to publish GitPulse desktop releases from the
`master` branch.

## Release Model

- `master` is the release branch used by CI, GitHub Pages, and release workflows.
- Releases are created from Git tags named `vX.Y.Z`.
- `CHANGELOG.md` is edited manually before a tag is created.
- The GitHub Actions release workflow creates a draft GitHub Release and uploads
  packaged Tauri artifacts.

## Prepare A Release

1. Make sure the working tree is clean:

   ```bash
   git status --short --branch
   ```

2. Update versions:

   - `package.json`
   - `src-tauri/tauri.conf.json`
   - any future package metadata that carries the product version

3. Move relevant entries from `CHANGELOG.md` `Unreleased` into a new version
   section:

   ```markdown
   ## [0.2.0] - YYYY-MM-DD
   ```

4. Run local verification:

   ```bash
   pnpm exec jest --runInBand
   pnpm build
   pnpm run site:build
   cd src-tauri
   cargo test
   cargo clippy --all-targets -- -D warnings
   ```

5. Commit the version and changelog changes:

   ```bash
   git add package.json src-tauri/tauri.conf.json CHANGELOG.md
   git commit -m "chore(release): prepare v0.2.0"
   ```

## Publish A Release

1. Tag the release:

   ```bash
   git tag v0.2.0
   ```

2. Push `master` and the tag:

   ```bash
   git push origin master
   git push origin v0.2.0
   ```

3. Wait for the `Release` workflow to finish.

4. Open the draft GitHub Release, review generated assets, paste or refine
   release notes from `CHANGELOG.md`, then publish the release.

## Manual Desktop Builds

Use the `Desktop Build` workflow when you want packaged artifacts without
creating a release:

1. Open GitHub Actions.
2. Select `Desktop Build`.
3. Run the workflow on `master`.
4. Download artifacts from the completed workflow run.

## Troubleshooting

- If Linux builds fail before compiling Rust, check the installed Tauri system
  dependencies in the workflow.
- If macOS or Windows signing is required later, add signing credentials as
  repository secrets and keep unsigned local builds available for contributors.
- If the release workflow creates a draft with missing assets, rerun only the
  failed matrix job before publishing the release.
