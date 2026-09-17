# MutiaLytics — CBMS Automated Data Conversion & Management System



**Municipal Planning and Development Office · Municipality of Mutia, Zamboanga del Norte**

MutiaLytics is an offline-first desktop application for authorized municipal personnel who need to read, validate, organize, analyze, compare, export, and print Community-Based Monitoring System (CBMS) data without writing code.

The project was created from a practical municipal need: official CBMS data can be technically difficult to turn into usable tables, and not every LGU employee has the time or programming background to write Python, JavaScript, or R scripts. The system turns the prepared CBMS JSON records into a guided interface with searchable people, household views, barangay summaries, sector rosters, statistical reports, comparative analysis, a Compendium, encrypted exports, print preview, and update management.

> **Important scope and safety statement:** the current MutiaLytics desktop application does **not** bundle municipal CBMS records, PSA-delivered `.RData` files, or PSA RSA decryption keys. It consumes JSON files supplied by the authorized operator at runtime. Any upstream RData decryption or conversion must be performed through an authorized PSA/LGU workflow using credentials and keys that the operator is authorized to use. MutiaLytics is not a PSA product and is not represented as PSA-endorsed.

---

## 1. What the software does

MutiaLytics supports the local processing lifecycle after an authorized CBMS data set has been prepared in JSON form:

1. **Import CBMS JSON files** for CBMS 2022 and/or CBMS 2024.
2. **Recognize file types** such as barangay, household, person, interview, child-mortality, and TVET records from their filenames and record structure.
3. **Normalize data** into a common in-memory model so both years can be viewed through the same screens.
4. **Cache imported data locally** in IndexedDB so users do not have to re-import the same files after every restart.
5. **Validate records and joins** between persons, households, and barangays.
6. **Search individuals** and, when the selected person is a household head, display household members and relationships.
7. **Generate barangay-sorted reports** using A–Z barangay ordering and A–Z person/household sorting where appropriate.
8. **Generate sector reports** using the standardized `Summary`, `By Barangay Summary`, and `By Barangay` structure.
9. **Generate comparative 2022 vs 2024 analysis** and charts where both data years are loaded.
10. **Generate a Report Compendium** with summary tables, barangay tables, graphs, notes, and calculation references.
11. **Export CSV, XLSX, PDF, DOCX, and protected HTML** through password-protected export workflows.
12. **Print using a common preview system** with printer selection, paper-size selection, portrait/landscape selection, page navigation, zoom, and a Windows printer handoff.
13. **Protect application startup** with an optional six-digit PIN, three-attempt lockout, and ten-hour persistent lockout.
14. **Check for application updates** when a packaged desktop build is online and install releases distributed through GitHub Releases.

---

## 2. Current data years and source attribution

The application supports exactly these runtime CBMS years:

- **CBMS 2022**
- **CBMS 2024**

Generated reports use the selected data year. A 2022 report is labeled CBMS 2022; a 2024 report is labeled CBMS 2024. Comparative reports identify both years.

The standard report source watermark is:

> **Source: Municipal Planning and Development Office · CBMS 2022 dataset · Municipality of Mutia, Zamboanga del Norte**
>
> or
>
> **Source: Municipal Planning and Development Office · CBMS 2024 dataset · Municipality of Mutia, Zamboanga del Norte**

The source statement is an institutional/reporting attribution used by this software. It does not change the legal ownership, custody, or official provenance of the underlying CBMS dataset.

---

## 3. Upstream data preparation versus this application

### 3.1 PSA-delivered RData

In a typical authorized workflow, an LGU may receive PSA CBMS data in an R/RData-based distribution. The original municipal workflow may use PSA-authorized R/RStudio tools and an authorized PSA RSA key to decrypt or extract that data.

**MutiaLytics does not perform that decryption inside the current desktop application.** It does not contain a PSA RSA private key and does not bypass PSA encryption.

The safe separation is:

```text
PSA / authorized LGU data delivery
            ↓
Authorized extraction/decryption workflow
            ↓
Authorized JSON conversion / preparation
            ↓
      MutiaLytics JSON Import
            ↓
Local normalization + analysis
            ↓
Reports / exports / print
```

This separation is intentional so that the public software package contains application logic rather than municipal raw records or decryption secrets.

### 3.2 CBMS 2024 JSON folder

The application recognizes the current normalized 2024 file naming convention used by the project, including records such as:

```text
cbms_barangay_record.json
cbms_barangay_record_list.json
cbms_household_record.json
cbms_household_record_child_mortality.json
cbms_interview_record.json
cbms_person_record.json
cbms_person_record_tvet.json
```

Additional files may be accepted when they match the system's recognized naming pattern, but unrecognized files are reported rather than silently treated as CBMS data.

### 3.3 CBMS 2022 JSON folder

The 2022 adapter accepts legacy household-level JSON records, including legacy CSPro-style exports whose filenames end with forms such as:

```text
000000 Municipal, Province Name_A.json
000000 Municipal, Province Name_B.json
000000 Municipal, Province Name_C.json
```

The import layer also detects legacy 2022 structure from the JSON record itself. The `_A`, `_B`, and `_C` records are merged by a deterministic key before conversion into the application's normalized model.

---

## 4. How the application reads raw JSON data

The import process is intentionally local and deterministic.

### Step 1 — User selects the folder/files

The Import Data screen allows the authorized operator to choose the prepared JSON files. The files are not uploaded to a remote server by the application.

### Step 2 — JSON parsing

Each file is read in the renderer using the browser File API and parsed with `JSON.parse()`.

Invalid JSON is reported in the Import Data validation report. The application does not silently treat an invalid file as valid data.

### Step 3 — Year detection

Files are classified as 2022 or 2024 using filename/record structure. A legacy 2022 record can be recognized from its structure even when the filename is not perfect.

### Step 4 — Dataset classification

2024 files are classified by filename into:

| Dataset | Example naming pattern |
| --- | --- |
| Barangays | `cbms_barangay_record*.json` |
| Barangay List | `cbms_barangay_record_list*.json` |
| Households | `cbms_household_record*.json` |
| Child Mortality | `cbms_household_record_child_mortality*.json` |
| Interviews | `cbms_interview_record*.json` |
| Persons | `cbms_person_record*.json` |
| Persons — TVET | `cbms_person_record_tvet*.json` |

2022 legacy household records are converted by `src/data/cbms-legacy-2022.ts`.

### Step 5 — 2022 normalization

The 2022 adapter:

- removes legacy `{ code: ... }` wrappers where present;
- interprets legacy numeric codes into human-readable labels;
- extracts household, person, barangay, employment, education, relationship, and related fields;
- preserves legacy/raw information needed by the application for traceability;
- merges A/B/C records deterministically;
- produces the same normalized dataset shape used by the application screens.

### Step 6 — 2024 normalization

The 2024 importer keeps the normalized arrays for barangays, households, persons, interviews, child mortality, and TVET records. If a dedicated barangay file is absent, the application can reconstruct the visible barangay list from person/household area information.

### Step 7 — Local cache

After successful import, the normalized dataset is stored in browser IndexedDB under the application database:

```text
mutialytics-cbms-runtime
  ├── years
  │    ├── 2022
  │    └── 2024
  └── meta
```

This is a local application cache. It is not uploaded by the application.

### Step 8 — Reporting model

All screens use the normalized year-specific store rather than directly reading arbitrary JSON properties throughout the UI. This gives the reports a predictable data model and allows 2022 and 2024 to use common report definitions.

---

## 5. Folder and source-code structure

```text
cbms-mutia_system/
├── .github/
│   ├── workflows/
│   │   ├── release.yml          # Windows release + updater assets
│   │   └── security.yml         # CodeQL + repository safety checks
│   └── dependabot.yml           # Dependency update configuration
│
├── docs/
│   ├── EULA.txt                # Single installer EULA
│   ├── AGRICULTURE_SECTORS.md  # Agriculture sector methodology
│   ├── AUTO_UPDATE_GITHUB.md   # Release/update procedure
│   ├── CODEQL_GITHUB_SETUP.md  # CodeQL setup
│   ├── GITHUB_SECURITY.md      # Repository/release security
│   ├── MAINTAINER.md           # Code maintenance rules
│   ├── PRINTING.md             # Printing architecture
│   └── RELEASE_CHECKLIST.md    # Release verification
│
├── public/                     # Static browser assets only
├── scripts/                    # Build/release validation scripts
├── src/
│   ├── assets/                 # Logo, hall image, icons; no CBMS records
│   ├── components/             # Shared UI, dialogs, export/print controls
│   ├── data/                   # Runtime data layer + year adapters
│   ├── hooks/                  # React hooks
│   ├── lib/                    # Algorithms, reports, exports, security helpers
│   └── routes/                 # Application pages/modules
│
├── main.cjs                    # Electron main process
├── preload.cjs                 # Secure renderer ↔ main IPC bridge
├── package.json                # Scripts, dependencies, builder/updater config
├── README.md                   # Main documentation and tutorial
├── tsconfig.json
├── vite.config.ts
└── components.json
```

### Files that are intentionally NOT stored in the source tree

The repository must not contain:

```text
Raw CBMS *.json files
.RData / .Rda / .RDS files
PSA RSA/private keys
.p12 / .pfx / .pem / .key credentials
Generated .exe installers
.blockmap files
latest.yml
```

The repository now has an automated safety check that fails CI if these appear.

---

## 6. Main application modules

### Dashboard

Provides the primary municipal overview, dataset context, counts, and navigation into the analysis modules.

### Comparative Analysis

Compares CBMS 2022 and 2024 when both years are loaded. The page includes comparable indicators, change views, visual graphs, and year-aware source labels.

### Person Search

Searches normalized person records. Selecting a household head can display household members and relationships such as spouse, son, daughter, grandson, granddaughter, parents, siblings, and other relationships, for both 2022 and 2024.

### Households

Presents households by barangay, sorted A–Z. Household information is available for reporting and export, including household income where a valid reported value exists.

### Barangays

Displays the municipality's barangays in A–Z order and provides barangay-based summary and reporting functions.

### Demographics

Includes population and demographic rosters such as the Indigenous Cultural Communities / Indigenous Peoples (ICC/IP) roster, organized by barangay and sorted A–Z for reporting.

### Sector Rosters

Sector reporting is standardized around:

1. **Summary**
2. **By Barangay Summary**
3. **By Barangay**

The sector system is deliberately barangay-oriented instead of maintaining duplicate municipality-wide roster screens for the same population.

The agriculture/rural group includes:

- Farming & Non-Farming Households by Barangay
- Farming Household Poverty / Low-Income proxy by Barangay
- Agricultural vs Non-Agricultural Employment by Barangay
- Agricultural Household Income by Barangay
- Farming Households with Reported Income by Barangay

The system uses actual reported household-income fields when available and does not invent missing income values.

### Cross-tabulation

Generates configurable comparisons across dimensions supported by the normalized data model.

### Statistical Reports

Provides reusable report definitions for common CBMS distributions and indicators.

### Report Compendium

Builds a consolidated municipal report containing report sections, summaries, barangay tables, graphs, methodology/reference notes, and year-aware source attribution. Sections with no meaningful records can be omitted instead of producing empty zero-only pages.

### Data Validation

Reports file counts, records, joins, missing fields, duplicate keys, malformed files, and import observations.

### Dataset Inspector

Shows the runtime data actually loaded for each year rather than relying only on filenames.

### Export Log

Keeps a local history of generated protected exports, including file name, format, document number, and the generated export password for authorized retrieval.

### Import Data

Loads JSON files at runtime, validates them, normalizes them, and caches the result locally.

### Settings

Controls the six-digit startup PIN, update checking, security state, and other system preferences.

---

## 7. Sector methodology and agriculture algorithms

### Farming household classification

A household is treated as farming when at least one linked household member is identified as a farmer or has an agriculture-related occupation/industry indicator recognized by the project's normalization logic.

### Farming & non-farming population

The household classification is applied at household level. Household counts and linked population counts are kept separate so a person count is not accidentally treated as a household count.

### Farming household reported income

The application reads the normalized `H06 Total Family Income` household value when available. Blank, null, non-numeric, or invalid values are excluded from income statistics rather than estimated.

The report distinguishes **household income** from an individual's salary. When a farming person is listed in a household roster, the household's reported family income may appear for relationship/context purposes; it must not be interpreted as that person's personal earnings.

### Income statistics

For valid numeric reported household income values:

```text
Average reported family income
= sum(valid reported household incomes)
  ÷ number of valid reported-income households
```

The median is the middle value after sorting valid reported incomes numerically (or the arithmetic mean of the two middle values for an even count).

### Income-based low-income proxy

Where the report uses the project's ₱20,000 threshold, it is explicitly labeled an **income-based proxy** and not an official PSA poverty classification:

```text
Low-income farming households
÷
Farming households with reported income
× 100
```

### Agricultural employment

The classifier combines normalized employment status with agriculture-related farmer, occupation, and industry indicators. Agricultural and non-agricultural employment are kept distinct from the overall labor-force denominator.

### Barangay sorting

Barangay names are normalized and sorted with locale-aware A–Z ordering. Within detailed barangay reports, people/heads are additionally sorted A–Z by name where the report requires person-level ordering.

---

## 8. Percentage calculation rules

The software avoids the generic word **“Share”** where a more precise denominator can be stated. Reports use labels such as:

- **Percentage Rate (%Rate)**
- **Percentage of population (%Population)**
- **Percentage of households (%Households)**
- **Percentage of ICC/IP population**

The general formula is:

```text
Percentage / Rate (%)
= numerator ÷ applicable denominator × 100
```

The denominator is chosen from the actual statistical base of the table. It is not automatically the municipal total in every report.

Examples:

```text
Senior citizen rate
= senior citizens ÷ applicable population base × 100

Barangay household rate
= qualifying households ÷ applicable household base × 100

Agricultural employment rate
= agricultural employed persons ÷ applicable employment/labor-force base × 100

ICC/IP share
= ICC/IP count for the category ÷ applicable ICC/IP base × 100
```

Generated books and exports include method/reference notes so a municipal reviewer can inspect the calculation basis instead of relying on an unexplained percentage.

---

## 9. Export system

Supported protected document exports include:

- CSV
- XLSX / Excel
- PDF
- DOCX / Word
- Protected HTML for Compendium reports

### AES-256 export protection

The file-export functions use password-protected encryption:

- CSV/XLSX/PDF/DOCX: password-protected AES-256 ZIP container
- Protected Compendium HTML: AES-256-GCM encrypted payload with a PBKDF2-derived key

Export passwords are generated using the browser's cryptographically secure random number generator.

Each export receives a unique document identity, including the CBMS year, municipality, report code, timestamp, and document reference. Example:

```text
CBMS2024-MUTIA_PWD_2026-09-17_13-45-20_A1B2C.protected.zip
```

The inner report also carries the appropriate source year and document number.

### Password handling

The password is shown in the secure export dialog and recorded in the local Export Log so an authorized operator can retrieve it later. Do not send the archive and its password through the same channel when confidentiality matters.

### Save location

Desktop file exports use a native Windows Save As dialog rather than silently dropping files into Downloads.

---

## 10. Printing

All major system print buttons use the shared print-preview workflow.

The print system supports:

- Printer selection
- Ready/default printer prioritization
- Folio: 215.9 × 330.2 mm
- A4
- Letter
- Legal
- A3
- Portrait
- Landscape
- Page-by-page preview
- Fit / zoom controls
- Two-dimensional scrolling at high zoom
- Windows printer dialog handoff

The application does not claim that a physical printout is encrypted. Printed paper must be handled under the LGU's physical-record security procedures.

---

## 11. Startup security

### Six-digit PIN

The application can be configured with a six-digit numeric PIN.

### PIN storage

The raw PIN is not stored. The verifier uses a memory-hard `scrypt` derivation. The authentication record is protected using authenticated AES-256-GCM, with an Electron/OS-protected key when available and a persistent development-safe fallback for restart testing.

### Wrong-password limit

```text
Wrong attempt 1 → 2 attempts remain
Wrong attempt 2 → 1 attempt remains
Wrong attempt 3 → 10-hour lockout
```

The lockout is persistent and enforced in the Electron main process. Restarting the application does not reset it.

### Physical workstation protection

For government data, application security should be combined with:

- unique Windows user accounts;
- strong Windows sign-in controls;
- BitLocker or equivalent full-disk encryption where appropriate;
- restricted folder permissions;
- controlled USB/removable-media use;
- secure backup and deletion procedures.

---

## 12. GitHub automatic updates

The packaged Windows installer uses `electron-updater` with GitHub Releases.

### Important: test with installed software

Do not test the real updater with:

```powershell
npm run electron:dev
```

Use the packaged Windows NSIS installer.

### Release assets

A healthy GitHub release contains:

```text
Mutia-Insight-Setup-X.Y.Z.exe
latest.yml
Mutia-Insight-Setup-X.Y.Z.exe.blockmap
```

The `.exe` is the installer. `latest.yml` is updater metadata. The blockmap supports update delivery.

### Release version rule

These must match exactly:

```text
package.json       1.2.6
Git tag            v1.2.6
```

Create a release:

```powershell
git add .
git commit -m "Release v1.2.6"
git push origin main
git tag v1.2.6
git push origin v1.2.6
```

The GitHub workflow builds the installer, validates `latest.yml`, creates one release, uploads the `.exe`, `latest.yml`, and `.blockmap`, and verifies the release assets.

### What happens on a coworker's computer

```text
Installed v1.2.5
       ↓
Internet connection
       ↓
Check for updates
       ↓
GitHub release v1.2.6 detected
       ↓
Download
       ↓
Update ready
       ↓
Restart
       ↓
Installed v1.2.6
```

### Why GitHub may show “Source code” archives

GitHub automatically provides source archives for tags in a repository. The release workflow itself uploads only the Windows updater assets. If the repository is public, GitHub's automatically generated tag source archives can still expose the repository's source code.

Therefore, **a public source repository cannot provide source-code confidentiality**. For a production municipal deployment where source confidentiality matters, use:

```text
PRIVATE SOURCE REPOSITORY
        │
        └── GitHub Actions
                 │
                 ▼
PUBLIC RELEASE-ONLY REPOSITORY
        ├── .exe
        ├── latest.yml
        └── .blockmap
```

The installed application must never contain a GitHub write token. The update feed must be readable without a secret on the client.

See `docs/GITHUB_SECURITY.md` for the migration plan.

---

## 13. GitHub security and repository hygiene

The repository contains automated checks for:

- CodeQL JavaScript/TypeScript scanning
- repository safety checks
- raw CBMS dataset detection
- RData/RDS/RDA detection
- private-key/certificate detection
- generated-release-artifact detection
- dependency update monitoring through Dependabot

Do not commit:

```text
municipal JSON records
PSA RSA keys
private keys
.p12 / .pfx signing certificates
GitHub tokens
.env secrets
installer binaries
blockmaps
latest.yml
```

If a sensitive file was committed previously, deleting it from the current tree is not enough to remove it from Git history. Follow GitHub's sensitive-data removal guidance and rotate the affected secret/key.

---

## 14. Tutorial — first installation and first launch

### Step 1 — Install

Run the Windows installer:

```text
Mutia-Insight-Setup-X.Y.Z.exe
```

The installer presents the single MutiaLytics EULA configured for NSIS.

### Step 2 — Open the application

The application opens maximized without covering the Windows taskbar.

### Step 3 — Set the startup PIN

Go to:

```text
System → Settings → Security PIN
```

Set a six-digit numeric PIN.

After restarting the application, the secure Mutia unlock screen requests the PIN.

### Step 4 — Import CBMS JSON files

Go to:

```text
System → Import Data
```

Choose the prepared 2022 and/or 2024 JSON files/folder.

Read the validation report and confirm that the expected record counts appear.

### Step 5 — Verify the year

Use the year selector to switch between:

```text
CBMS 2022
CBMS 2024
```

Only a successfully imported year is enabled.

### Step 6 — Check Dataset Inspector

Open:

```text
System → Dataset Inspector
```

Confirm persons, households, barangays, and total records are non-zero where expected.

### Step 7 — Search a person

Open:

```text
Community Data → Person Search
```

Search a name. Select the person. If the person is the household head, the modal also shows the household members and their relationships.

### Step 8 — Use sectors

Open:

```text
Community Data → Sector Rosters
```

Use the standard structure:

```text
Summary
By Barangay Summary
By Barangay
```

Barangays are sorted A–Z.

### Step 9 — Build a Compendium

Open:

```text
Analysis & Reports → Report Compendium
```

The system prepares the book, removes sections without meaningful data, and includes calculation/reference notes.

### Step 10 — Export

Choose PDF, Word, Excel, CSV, or protected HTML where available.

The system:

1. creates a unique document name;
2. generates protection credentials;
3. encrypts the export according to the supported workflow;
4. opens the Save As dialog;
5. records the export in the Export Log.

### Step 11 — Print

Click **Print**.

Choose:

```text
Printer
Paper size
Portrait / Landscape
```

Inspect the complete page preview. At high zoom, use the preview's vertical and horizontal scrolling to reach every part of the paper.

For a Windows printer that ignores a landscape preference, verify the final Windows printer dialog settings because the manufacturer driver controls the physical output.

### Step 12 — Check for updates

Use:

```text
Check updates
```

or open the Settings update panel. Internet access is required. The update system is only active in packaged desktop builds.

---

## 15. Tutorial — maintaining data safely

1. Keep the original PSA/LGU-delivered data in a restricted source folder outside the application repository.
2. Use the official/authorized upstream workflow to prepare JSON.
3. Import the JSON into MutiaLytics.
4. Verify the import report.
5. Keep exported archives and passwords under separate controls.
6. Do not attach raw CBMS JSON files to GitHub issues, pull requests, email threads, or public cloud folders.
7. Before sharing a report outside authorized municipal personnel, review whether names, addresses, IDs, health, education, income, or other personal information should be removed or aggregated.
8. Clear the application runtime cache when the workstation is transferred to a different authorized user and the local data should no longer remain there.

---

## 16. Tutorial — preparing a new GitHub release

Before releasing:

```text
1. Confirm tests/build work locally.
2. Confirm package.json version.
3. Run npm run validate:project.
4. Commit and push main.
5. Create matching v<version> tag.
6. Push the tag.
7. Wait for the release workflow.
8. Confirm .exe + latest.yml + .blockmap.
9. Install the new .exe on a test workstation.
10. Test updater from the previous installed version.
```

Never put raw CBMS datasets or decryption keys in the release repository.

---

## 17. Development setup

### Requirements

- Windows 10/11 for the desktop application
- Node.js 22 LTS recommended for the current CI/release configuration
- npm
- VS Code recommended

### Install

```powershell
npm install
```

### Development web app

```powershell
npm run dev
```

### Electron development

```powershell
npm run electron:dev
```

### Production web build

```powershell
npm run build
```

### Windows installer

```powershell
npm run electron:build
```

### Validation

```powershell
npm run lint
npm run validate:project
npm run validate:release
```

---

## 18. Algorithms and implementation principles

### Data normalization

2022 legacy records are converted into the normalized 2024-compatible internal model. The goal is a stable analytical interface, not modification of the original input file.

### Deterministic household/person keys

Household relationships use normalized area/household identifiers such as area code, HUSN, HSN, and person line/UUID fields where available. This reduces false matches while retaining year separation.

### A–Z sorting

Report sorting uses normalized text and locale-aware comparison, with totals kept after detail rows where appropriate.

### Percentage calculations

Percentages always specify the applicable denominator in the table title/note or methodology text.

### Empty-section suppression

Compendium/report builders can omit tables whose eligible population/records are zero, reducing empty pages and preventing misleading “all-zero” sections.

### Export encryption

Standard file exports use password-protected AES-256 ZIP encryption. Protected HTML uses PBKDF2 + AES-256-GCM in the browser's Web Crypto API.

### Application authentication

Startup PIN verification uses memory-hard scrypt; authentication state is stored in an authenticated AES-256-GCM record protected with an OS-level key where available.

### Auto-update

Packaged Windows builds use `electron-updater` with GitHub Release metadata (`latest.yml`) and NSIS installers.

---

## 19. Legal and policy considerations

MutiaLytics is intended as a processing/analytics utility. Users and the responsible LGU must ensure that each data-handling activity is authorized and appropriate under applicable law and policy.

### Republic Act No. 10173 — Data Privacy Act of 2012

The National Privacy Commission identifies personal information and sensitive personal information broadly and requires appropriate principles and safeguards for processing. Government users should therefore apply access controls, confidentiality, retention, security, and disclosure rules appropriate to the data.

Official references:

- https://privacy.gov.ph/data-privacy-act/
- https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/

### Republic Act No. 11315 — Community-Based Monitoring System Act

The PSA's official CBMS Act page describes CBMS as a technology-based system for collecting, processing, and validating disaggregated local data and explicitly recognizes privacy, data quality, legitimate purpose, transparency, and proportionality principles.

Official reference:

- https://psa.gov.ph/content/community-based-monitoring-system-act

### Important disclaimer

The README and EULA are project documentation, not legal advice. Municipal officials should coordinate with the LGU Data Protection Officer, records-management officials, PSA, NPC, and legal counsel as appropriate.

---

## 20. Project history and motivation

This project grew from the observation that municipal CBMS training and reporting can place a heavy technical burden on personnel who do not routinely write code. The developer used prior knowledge of Python and web development to prepare the JSON conversion/normalization workflow and build a desktop application that makes the prepared data usable through guided municipal interfaces.

The project therefore emphasizes:

- no-code municipal reporting;
- readable barangay tables;
- repeatable calculations;
- year-separated 2022/2024 analysis;
- secure exports;
- printable government-style reports;
- a maintainable local desktop workflow.

The application's current scope intentionally keeps raw municipal datasets outside the software repository and outside the published application package.

---

## 21. Credits

**Developer** — Kiven Cantila  
**UI/UX Designer** — Clifford Kevin Bohol  
**Tester** — Fredrich Cabasag  
**Institution / Intended Office** — Municipal Planning and Development Office, Municipality of Mutia, Zamboanga del Norte

---

## 22. Final source-tree safety rule

The project is intended to be publishable without municipal CBMS records.

Before every commit/release:

```powershell
npm run validate:project
```

A successful validation means the source tree contains no detected raw CBMS JSON/RData files, generated installers, blockmaps, updater manifests, private key material, or duplicate installer EULA files.
