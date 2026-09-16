# MutiaLytics automatic updates with GitHub Releases

This project uses `electron-updater` with the GitHub provider. Installed copies of the packaged application check GitHub for a newer release when they start and every 30 minutes while running. When a newer release is found, it downloads automatically. After the download finishes, the user is asked whether to restart immediately; choosing Later installs it automatically the next time the application closes.

## Important: development vs packaged application

Auto-update is intentionally disabled during `npm run electron:dev`. It only runs in the packaged installer/application. This avoids development sessions trying to update from GitHub.

## GitHub repository

The project is configured for:

`https://github.com/cantilakiven/cbms-mutia_system`

The repository and owner are explicitly configured in `package.json`, so the update feed does not depend on whatever Git remote happens to be on a developer's PC.

## Free GitHub setup

The simplest free arrangement is a **public GitHub repository** using GitHub Releases. GitHub states that release assets can be distributed without a total-release-size or bandwidth cap, although individual files are limited to 2 GiB. GitHub Actions standard runners are free for public repositories. See the linked GitHub documentation in the project README.

If the source code must remain private, do not publish a private GitHub update feed for ordinary coworker installations without additional authentication planning. The simplest no-cost deployment model is a public release repository that contains the installer artifacts.

## First-time setup

1. Create the repository `cantilakiven/cbms-mutia_system` on GitHub.
2. Push this project to the `main` branch.
3. In GitHub, open **Settings → Actions → General** and allow GitHub Actions.
4. Confirm the repository's **Actions permissions** allow workflows to run and create releases.
5. The included workflow is `.github/workflows/release.yml`.
6. The workflow uses GitHub's built-in `GITHUB_TOKEN`; you do **not** need to paste a personal access token into the source repository.

The workflow has `contents: write` permission so it can publish the installer and updater metadata to GitHub Releases.

## Publish the first release

Change the version in `package.json`, for example:

```json
"version": "1.1.0"
```

Commit the change and push it:

```powershell
git add package.json

git commit -m "release: 1.1.0"

git push origin main
```

Then create and push the matching tag:

```powershell
git tag v1.1.0
git push origin v1.1.0
```

GitHub Actions will run the Windows build and publish the installer and updater metadata to the GitHub release for `v1.1.0`.

## Publish later updates

For every update:

1. Fix the code.
2. Increase `package.json` version, for example `1.1.1` or `1.2.0`.
3. Commit and push to `main`.
4. Create a matching tag: `v1.1.1` or `v1.2.0`.
5. Push the tag.
6. Wait for the **Build and Release MutiaLytics** workflow to finish.

Example:

```powershell
git add .
git commit -m "release: 1.1.1"
git push origin main

git tag v1.1.1
git push origin v1.1.1
```

Do not reuse an old version number. Installed applications only accept releases that are newer according to semantic version comparison.

## What coworkers need to do

They install the current MutiaLytics Windows installer once.

After that they do **not** need to download every new installer manually. The packaged application checks the configured GitHub Releases feed, downloads newer versions, and installs them when the application restarts.

Their PCs do not need Node.js, Git, or GitHub accounts for the updater to work.

## What the GitHub release should contain

For a Windows x64 release, electron-builder normally uploads:

- the NSIS installer (`.exe`)
- `latest.yml`
- the update blockmap (`.blockmap`)

The updater reads the release metadata and downloads the new installer automatically.

## Testing the updater safely

Do not test auto-update with two builds that have the same version.

Use a sequence such as:

```text
1. Build/install 1.1.0
2. Publish 1.1.1
3. Start the installed 1.1.0 application
4. Wait for the update check
5. Let it download 1.1.1
6. Restart when prompted
7. Confirm Help/About or the application version shows 1.1.1
```

For a quick test, the updater waits about 10 seconds after startup before its first check, then checks every 30 minutes.

## Security note

GitHub Releases are transport-secured over HTTPS, and electron-updater performs update verification appropriate to the packaged target. For production Windows deployment, code-signing the installer is strongly recommended because unsigned Windows software can trigger SmartScreen warnings and provides weaker publisher identity. A Windows code-signing certificate is a separate cost from the GitHub hosting/automation workflow.

Do not put a GitHub Personal Access Token in `main.cjs`, `preload.cjs`, `package.json`, or any repository file. The release workflow uses the temporary `GITHUB_TOKEN` supplied by GitHub Actions.

## If the GitHub repository name changes

Update these three places together before publishing a new release:

1. `package.json` → `repository.url`
2. `package.json` → `build.publish.owner`
3. `package.json` → `build.publish.repo`

Then create a newer application version and publish it.
