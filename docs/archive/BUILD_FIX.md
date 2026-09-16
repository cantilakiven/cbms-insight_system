# Build Fix — September 12, 2026

Fixed the Electron/Vite build error in `src/components/ExportTools.tsx`.

## Cause
`emitPrintPreview` is defined/exported by `src/lib/export-log.ts`, not by `src/lib/cbms-export.ts`.

## Fix
The import was corrected so `ExportTools.tsx` now imports:

- `buildPrintHtml` and `exportDOCX` from `@/lib/cbms-export`
- `emitPrintPreview` from `@/lib/export-log`

The `npm install` deprecation/install-script warnings shown previously are not the cause of this build failure.
