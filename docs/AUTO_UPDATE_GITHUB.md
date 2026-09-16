# MutiaLytics GitHub Auto-Update Guide

This project is configured for Windows NSIS releases through GitHub Releases and `electron-updater`. The packaged desktop application checks for newer releases automatically; development mode does not perform update checks.

## Repository

`https://github.com/cantilakiven/cbms-mutia_system`

The publish provider is configured in `package.json` under `build.publish`.

## Release flow

1. Make and test your code changes.
2. Update `package.json` version. Do not reuse an already-published version.
3. Commit and push the changes to `main`.
4. Create a matching semantic tag, for example:

```powershell
git tag v1.2.1
git push origin v1.2.1
```

5. GitHub Actions runs `.github/workflows/release.yml`.
6. The workflow installs dependencies, verifies the tag/version match, runs `npm run build`, runs electron-builder for Windows NSIS, verifies the generated installer metadata, and publishes the release.

## Why `latest.yml` matters

`electron-updater` needs the generated update metadata (`latest.yml`) alongside the Windows installer. Do not upload only the `.exe`; a release without `latest.yml` will not provide a complete updater feed.

## What coworkers do

They install the published NSIS `.exe` once. Later, when a newer tagged GitHub release is published, the packaged application checks for it automatically, downloads it, and offers **Restart Now** or **Later**. If they choose Later, the update is installed on the next application close.

## Important version rule

These two values must match:

```text
package.json      1.2.1
Git tag            v1.2.1
```

The workflow stops the release if they do not match.

## Manual GitHub release alternative

You normally do not need to create the release manually. Push the tag and let GitHub Actions publish it. If you create releases manually, keep the generated `.exe`, `latest.yml`, and `.blockmap` together as release assets and preserve their filenames.

## Troubleshooting

### The app says no update is available

Verify that the installed application is a packaged NSIS build, not `npm run electron:dev`, and that the GitHub Release contains a newer version plus `latest.yml`.

### The workflow fails on the version check

Update `package.json` to the exact version represented by the tag, then create a new tag instead of reusing the failed tag.

### The workflow publishes an EXE but no `latest.yml`

Do not distribute that release. Fix the electron-builder build and republish a new version. The included workflow has an explicit artifact check so this should fail the job rather than silently publishing an incomplete updater release.

### Private repository

This configuration is intended for a normal public GitHub release feed. A private GitHub provider requires additional authentication and is not recommended for this deployment pattern.
