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

