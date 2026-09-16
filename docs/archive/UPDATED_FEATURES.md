# CBMS Mutia – Update Notes

This build includes the requested improvements to the offline CBMS system.

## Included changes

- Sector Food Frequency now reports household heads explicitly identified as eating fewer than 3 meals per day (1 or 2 meals/day / explicit below-3 wording). The CBMS I02 food-consumption-expenditure frequency field is not interpreted as meals/day.
- The new under-3-meals household-head report is included in the generated compendium.
- Household filtering was redesigned around useful operational filters, search, and barangay selection.
- Barangay 4Ps counts now use household-level 4Ps indicators instead of the previous person-only check.
- Dataset Inspector detected-file counts and import metadata persist in IndexedDB across restarts.
- Mixed-folder import now auto-detects 2022 versus 2024 JSON files without overwriting the other year.
- Import Data keeps the requested 2022/2024 folder controls plus mixed-folder auto-detection, reload, and clear actions.
- Troubleshooting was removed from the main navigation.
- Export Log now stores the expected saved path for exports; Electron downloads are routed to the Windows Downloads folder.
- Compendium PDF and Word exports are delivered as AES-256-password-protected ZIP containers containing the original PDF/DOCX document.
- Compendium HTML exports are protected in-file with PBKDF2 + AES-256-GCM. Three failed passwords trigger a five-hour lockout in the browser profile.
- Compendium export filenames are unique to avoid same-day overwrites.

## Validation

- Modified TypeScript/TSX files: syntax parsing passed.
- Electron `main.cjs` / `preload.cjs`: Node syntax checks passed.
- Meal-frequency functional checks passed for 1/day, 2/day, 3/day exclusion, explicit below-3 wording, and I02 exclusion.
- Full dependency installation/build was not completed in this environment because `npm install --ignore-scripts --no-audit --no-fund` exceeded the available execution time; the supplied project did not contain `node_modules`.
