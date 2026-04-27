# Release Process

This document describes how to publish GitPulse desktop releases from the
`master` branch.

## Release Model

- `master` is the release branch used by CI, GitHub Pages, and release workflows.
- Stable releases are created from Git tags named `vX.Y.Z`.
- Release candidates are created from Git tags named `vX.Y.Z-rc.N`.
- `CHANGELOG.md` is edited manually before a tag is created.
- The GitHub Actions release workflow publishes a GitHub Release or prerelease
  after uploading packaged Tauri artifacts to a draft release.
- The `Desktop Build` workflow also runs on every `master` push and uploads
  temporary downloadable artifacts for validation.

## Public Surfaces

- GitHub Pages documentation is published from the `master` branch workflow:
  `https://Boblebol.github.io/GitPulse/`.
- Desktop downloads are published from tag workflows:
  `https://github.com/Boblebol/GitPulse/releases`.
- Keep the GitHub default branch, workflow branch filters, README badges, and
  release docs aligned. The current public release branch is `master`.
- Pages must be configured in GitHub repository settings to deploy from GitHub
  Actions. If `actions/configure-pages` cannot create the Pages site, enable
  Pages once from repository settings, then rerun the workflow.

## Prepare A Release

1. Make sure the working tree is clean:

   ```bash
   git status --short --branch
   ```

2. Update versions:

   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
   - any future package metadata that carries the product version

3. Move relevant entries from `CHANGELOG.md` `Unreleased` into a new version
   section:

   ```markdown
   ## [0.2.0] - YYYY-MM-DD
   ```

   For a release candidate, use:

   ```markdown
   ## [0.2.0-rc.1] - YYYY-MM-DD
   ```

   The Tauri app version in `src-tauri/tauri.conf.json` must remain compatible
   with Windows MSI packaging. For release candidates, use a numeric-only
   prerelease identifier such as `0.2.0-5` while the Git tag remains
   `v0.2.0-rc.5`.

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
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md
   git commit -m "chore(release): prepare v0.2.0"
   ```

   For a release candidate, use:

   ```bash
   git commit -m "chore(release): prepare v0.2.0-rc.1"
   ```

## Publish A Release

1. Tag the release:

   ```bash
   git tag v0.2.0
   ```

   For a release candidate:

   ```bash
   git tag v0.2.0-rc.1
   ```

2. Push `master` and the tag:

   ```bash
   git push origin master
   git push origin v0.2.0
   ```

   Or for a release candidate:

   ```bash
   git push origin v0.2.0-rc.1
   ```

3. Wait for the `Release` workflow to finish.

4. Open the GitHub Release or prerelease, confirm the Linux, macOS, and Windows
   assets are attached, and refine release notes from `CHANGELOG.md` if needed.
   Tags containing `-rc.` are marked as prereleases by the workflow.

## Find Downloads

- For tagged builds, open GitHub Releases and select the matching tag, for
  example `v0.2.0-rc.2`. Desktop bundles are attached to that release.
- macOS builds are currently unsigned. After dragging `GitPulse.app` to
  `/Applications`, run this once in Terminal before opening the app:

  ```bash
  xattr -cr /Applications/GitPulse.app
  ```

  The command removes the quarantine attribute added by macOS to downloaded
  unsigned apps. It does not change GitPulse data or scanned repositories.
- For untagged `master` builds, open GitHub Actions, select `Desktop Build`,
  open the latest successful run, and download the `gitpulse-linux`,
  `gitpulse-macos`, or `gitpulse-windows` artifact.

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
- If macOS Gatekeeper refuses to open a downloaded release candidate, make sure
  the app was moved to `/Applications`, then rerun
  `xattr -cr /Applications/GitPulse.app`.
- If macOS or Windows signing is required later, add signing credentials as
  repository secrets and keep unsigned local builds available for contributors.
- If the release workflow creates a draft with missing assets, rerun only the
  failed matrix job before publishing the release.
- If GitHub Pages fails during `Configure Pages` with `Resource not accessible
  by integration`, check that the repository default branch is `master` and that
  Pages is enabled with `GitHub Actions` as the source.
