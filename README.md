git add .
git commit -m "Release v1.2.4"
git push origin main

git tag v1.2.4
git push origin v1.2.4


# MutiaLytics — Local Municipal Data Analytics System

Offline CBMS analytics for the Municipality of Mutia, Zamboanga del Norte. The desktop application runs locally with Electron and supports the CBMS 2022 and CBMS 2024 datasets.

## Project layout

```text
src/
  assets/          Municipal branding and application images
  components/      Reusable UI and export/print controls
  data/            CBMS 2022/2024 data adapters and runtime dataset logic
  lib/             Export, calculation, validation, security-adjacent helpers
  routes/          Application pages/modules
  styles.css       Global application styling
docs/              Maintainer documentation and archived implementation notes
public/            Static browser assets
main.cjs           Electron main process
preload.cjs        Electron IPC bridge
package.json       Scripts and dependencies
README.md          Primary project documentation
LICENSE_EULA.txt   Application license
```

## Requirements

- Node.js 20 LTS or newer
- npm
- Windows 10/11 for the desktop application and installer
- VS Code recommended for development

## Development

Install dependencies:

```powershell
npm install
```

Run the web application:

```powershell
npm run dev
```

Run the Electron desktop application with hot reload:

```powershell
npm run electron:dev
```

Build the production web bundle:

```powershell
npm run build
```

Build the Windows desktop package:

```powershell
npm run electron:build
```

## Application modules

- Dashboard
- Comparative Analysis
- Person Search
- Households
- Barangays
- Demographics
- Sector Rosters (barangay-based views)
- Cross-tabulation
- Statistical Reports
- Report Compendium
- Data Validation
- Dataset Inspector
- Export Log
- Import Data
- Settings / 6-digit security PIN

## Data years

The application supports **CBMS 2022** and **CBMS 2024**. Reports identify the source year and use the selected year as the calculation basis.

## Export and print

Exports use descriptive, unique document names that include the CBMS year, municipality, report type, timestamp and document reference. Desktop exports always use a native Save As dialog.

The shared Print Preview workflow is used by the system-wide report buttons and provides printer selection plus Folio-size page preview before printing.

Protected PDF/Word/HTML export workflows use the application's encrypted archive/security mechanisms. Keep exported passwords separate from the file itself.

## Security

When configured, the application requires a 6-digit numeric PIN at startup. Three consecutive incorrect PIN entries trigger a persistent 10-hour lockout. PIN verification is handled in the Electron main process; the raw PIN is not stored.

For stronger workstation security, also use a protected Windows account and full-disk encryption such as BitLocker.

## Data handling

CBMS data is processed locally. Imported source data stays on the workstation unless a user intentionally exports a report.

## Documentation

Archived implementation notes are stored under `docs/archive/`. Use this root README as the current source of truth for installation, structure and operation.

## Notes for maintainers

Keep feature code grouped by responsibility. Avoid placing temporary documentation, screenshots or generated files inside `src/`. Generated release artifacts belong in the configured release/output directory.
## Automatic updates

The packaged Electron application uses GitHub Releases through `electron-updater`. Release and update setup is documented in [docs/AUTO_UPDATE_GITHUB.md](docs/AUTO_UPDATE_GITHUB.md). The printing architecture is documented in [docs/PRINTING.md](docs/PRINTING.md).

### Release command

For local packaging without publishing:

```powershell
npm run electron:build
```

For GitHub Releases, create a matching `v<version>` tag and let `.github/workflows/release.yml` publish the Windows installer and updater metadata.

## GitHub Releases and automatic updates

The Windows build uses `electron-updater` with the GitHub provider. The packaged NSIS target is the auto-updatable Windows target, and electron-builder publishes the installer together with `latest.yml` update metadata to the configured GitHub release.

### First release

1. Confirm the version in `package.json`, for example `1.2.0`.
2. Commit and push the code to `main`.
3. Create the matching tag: `git tag v1.2.0`.
4. Push the tag: `git push origin v1.2.0`.
5. GitHub Actions runs `.github/workflows/release.yml`, builds the web application, builds the Windows NSIS installer, checks that `.exe` and `latest.yml` exist, and publishes them to the GitHub Release.

### Future updates

For every update, increment `package.json` first, for example `1.2.1`, `1.3.0`, or `2.0.0`, then create and push the matching tag (`v1.2.1`, `v1.3.0`, or `v2.0.0`). Installed coworkers' copies of the packaged application check for GitHub updates while running and download a newer release automatically.

The application intentionally does not update while launched with `npm run electron:dev`; auto-update is enabled only for packaged installations.

### Release assets that must exist

A successful Windows release should contain the NSIS installer (`.exe`), `latest.yml`, and the related blockmap asset. Do not manually rename these files because the updater uses the metadata to locate and verify the correct package.

### Repository configuration

The application is configured for `cantilakiven/cbms-mutia_system` in `package.json`. GitHub Actions uses the repository-provided `GITHUB_TOKEN` with `contents: write`; no personal access token is required by the release workflow.

See `docs/AUTO_UPDATE_GITHUB.md` for the full release checklist and troubleshooting.



## Release and security

- GitHub updater guide: `docs/AUTO_UPDATE_GITHUB.md`
- GitHub/security hardening: `docs/GITHUB_SECURITY.md`
- Printing: `docs/PRINTING.md`

## Source-code security

The Windows installer contains the packaged Electron application code inside `app.asar`; JavaScript/TypeScript source included in a desktop Electron application is not cryptographically hidden by packaging. For confidentiality, keep the source repository private and use a separate public release repository containing only installers and updater metadata. See `docs/GITHUB_SECURITY.md`.
