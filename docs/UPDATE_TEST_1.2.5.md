# MutiaLytics 1.2.5 — Auto-Update Test Release

This is a small maintenance release intended to verify the production GitHub auto-update path.

## What changed

- Bumped the desktop application version to **1.2.5**.
- Added the installed application version to **Settings → Update center**.
- Added a manual update check from the Settings page in addition to the existing top-bar updater control.
- Kept the existing GitHub Releases/NSIS auto-update flow unchanged.

## Test procedure

1. Install the existing **1.2.4** Windows build.
2. Connect the computer to the internet.
3. Close and reopen MutiaLytics if needed.
4. Open **Settings → Update center** or use **Check updates** in the top bar.
5. Publish the `v1.2.5` GitHub release produced by the release workflow.
6. The 1.2.4 installation should detect 1.2.5, download it, and display **Update ready**.
7. Choose **Restart Now** and confirm the application opens as **v1.2.5**.

Do not use `npm run electron:dev` for the real installer-to-installer update test; electron-updater is intended to be tested with the packaged Windows NSIS application.
