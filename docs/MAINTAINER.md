# Maintainer Guide

## Source organization

- `src/routes/` contains page-level modules.
- `src/components/` contains reusable UI, export, print and modal components.
- `src/lib/` contains calculations, CBMS recognition, verification, exports and utility logic.
- `src/data/` contains the 2022/2024 dataset adapters and runtime data layer.
- `src/assets/` contains only application branding/assets required at runtime.
- `docs/archive/` contains historical implementation notes only.

## Printing

All system print actions should call `printPayload()` from `src/lib/cbms-export.ts`. This routes the report into the shared `PrintPreviewModal`, which lists printers and printable Folio pages consistently across modules.

Do not create page-specific Electron print implementations unless there is a documented hardware requirement.

## Sector views

Sector navigation is intentionally barangay-based. Public sector indicators should end in `by Barangay` or use a dedicated barangay grouping component. Non-barangay roster tabs should not be added back to the main sector selector.

## Security

The startup PIN is six numeric digits. Verification and lockout logic run in the Electron main process. The current policy is three consecutive incorrect entries followed by a persistent ten-hour lockout.

## Exports

Exports use descriptive document identifiers containing the CBMS year, municipality, report code, timestamp and document reference. Desktop saving uses the native Save As dialog.
