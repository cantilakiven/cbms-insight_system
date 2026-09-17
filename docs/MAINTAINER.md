# Maintainer Guide

## Source organization

- `src/routes/` — page-level modules.
- `src/components/` — reusable UI, export, print, and modal components.
- `src/lib/` — calculations, CBMS recognition, verification, exports, Compendium, and security-adjacent helpers.
- `src/data/` — 2022/2024 runtime data adapters and IndexedDB cache layer. **Do not put raw datasets here.**
- `src/assets/` — application branding and runtime images only.
- `scripts/` — project/release validation.
- `docs/` — current maintainer/user/security documentation.

Historical patch notes are intentionally not kept in the repository. The root `README.md` is the operational source of truth.

## Data safety

Never commit municipal CBMS JSON, `.RData`, `.Rda`, `.RDS`, PSA RSA keys, signing certificates, tokens, or generated release artifacts. Run:

```powershell
npm run validate:project
```

before committing.

## Printing

All system print actions should call the shared `printPayload()` route in `src/lib/cbms-export.ts` and reach the shared Print Preview modal. Avoid new page-specific printing implementations.

## Export encryption

Do not remove `packageProtected()` or bypass the protected-export workflow for CSV/XLSX/PDF/DOCX. Protected Compendium HTML uses its separate AES-GCM flow in `src/lib/cbms-compendium.ts`.

## Startup security

Startup PIN verification and lockout must remain in the Electron main process. Current policy: six numeric digits, three consecutive failures, persistent ten-hour lockout.

## Release hygiene

The release workflow must:

1. check repository safety;
2. verify `package.json` version == `v<version>` tag;
3. build the Windows NSIS installer;
4. validate `latest.yml` against the generated `.exe`;
5. create exactly one GitHub Release;
6. upload `.exe`, `latest.yml`, and `.blockmap`;
7. verify those assets after publishing.
