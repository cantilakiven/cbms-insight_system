# MutiaLytics GitHub Releases and Automatic Updates

This project is configured for Windows NSIS distribution with `electron-updater` and GitHub Releases.

## What coworkers install

Coworkers should install the **NSIS `.exe` installer** from the GitHub Release. They should **not** install the `.blockmap`, source-code ZIP, or source-code TAR.GZ.

Each complete Windows release must contain:

```text
Mutia-Insight-Setup-X.Y.Z.exe
latest.yml
Mutia-Insight-Setup-X.Y.Z.exe.blockmap
```

`latest.yml` tells `electron-updater` which installer to download and contains the checksum metadata for that exact build. The `.blockmap` supports differential update behavior. The Windows NSIS target is an auto-updatable target supported by electron-builder. See the official electron-builder documentation: https://www.electron.build/docs/features/auto-update/

## Why the old release showed only `.blockmap`

A release that contains only:

```text
*.exe.blockmap
```

is incomplete. A blockmap is **not** the desktop installer. The new GitHub Actions workflow explicitly verifies the generated `.exe`, `latest.yml`, and `.blockmap`, then explicitly uploads all three assets to the GitHub Release. The workflow fails if any required asset is missing.

## Important version rule

The version in `package.json` must exactly match the Git tag, including the numeric version without the `v` prefix.

Example:

```text
package.json → 1.2.2
Git tag      → v1.2.2
```

Do not create `v1.2.2` while `package.json` still says `1.2.1`.

## Recommended release process

### 1. Update the version

Edit `package.json`:

```json
"version": "1.2.2"
```

Commit and push the changes:

```powershell
git add .
git commit -m "Release v1.2.2"
git push origin main
```

### 2. Create and push the release tag

```powershell
git tag v1.2.2
git push origin v1.2.2
```

### 3. GitHub Actions builds the desktop installer

The workflow `.github/workflows/release.yml` will:

1. Install dependencies with `npm ci`.
2. Verify the tag/version match.
3. Build the web application.
4. Build the Windows NSIS installer.
5. Generate `latest.yml` and `.blockmap` updater metadata.
6. Ensure the GitHub Release exists.
7. Upload the `.exe`, `latest.yml`, and `.blockmap` explicitly.
8. Query the GitHub Release and fail if any required asset is missing.
9. Keep a temporary copy of the Windows release artifacts in GitHub Actions for troubleshooting.

## 4. What coworkers do

Install the `.exe` from the published release **once**.

They do not need to download every future release.

When a newer release is published, the packaged application checks GitHub automatically. When an update is available, it downloads it and follows the application's update prompt. The installed application must be a packaged NSIS build; `npm run electron:dev` is development mode and does not provide the production update behavior.

## 5. Testing automatic updates safely

Use two real versions, for example:

```text
Installed version: 1.2.2
New GitHub release: 1.2.3
```

Do not test by publishing a lower version such as `1.2.1` after `1.2.2`.

On the test workstation:

1. Install `Mutia-Insight-Setup-1.2.2.exe`.
2. Publish `v1.2.3`.
3. Open MutiaLytics.
4. Allow the update check to run.
5. Confirm that the update is downloaded and offered for installation.

## 6. If a GitHub release is missing the `.exe`

Open the Actions run and inspect the `Inspect generated release files` and `Verify GitHub Release contains installer and updater metadata` steps.

The job is intentionally designed to fail instead of publishing an incomplete update feed.

Also check the release page. A healthy Windows release should show:

```text
Mutia-Insight-Setup-X.Y.Z.exe
latest.yml
Mutia-Insight-Setup-X.Y.Z.exe.blockmap
Source code (zip)
Source code (tar.gz)
```

The two Source code items are automatically provided by GitHub and are not the desktop installer.

## 7. Never use a Personal Access Token in source code

The workflow uses GitHub Actions' `GITHUB_TOKEN` with `contents: write`. Do not commit a PAT/token into the repository.

## 8. Security note about automatic updates

Windows NSIS updates are intended to be signature-verified by `electron-updater` when the application is Authenticode signed. An unsigned application can still be distributed for internal use, but code-signature verification cannot establish publisher identity until a real Windows code-signing certificate is configured. See: https://www.electron.build/docs/win/


## In-app update check

The desktop app now shows a **Check updates** control in the top bar. When packaged and connected to the internet it queries the configured GitHub Releases feed. When a newer release is found, the app reports the version and the existing `electron-updater` download process runs in the background. The app also reports download progress and when the update is ready to install.
