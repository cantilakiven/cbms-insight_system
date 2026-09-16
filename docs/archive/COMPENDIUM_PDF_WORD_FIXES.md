# Compendium PDF / Word fixes

The compendium export has been hardened for both PDF and Word output.

## PDF

- Every compendium table now starts on a dedicated page, eliminating heading/table collisions when a previous table or long intro leaves little vertical space.
- Tables with 8+ columns, including the sector matrix, automatically use landscape pages for readable column widths.
- All known table columns have explicit preferred widths, including the previously missing `income`, `status`, `band`, `basis`, `other`, `share_of_icc`, and `share_of_population` columns.
- Unknown/future columns receive a safe fallback width instead of AutoTable choosing an intrinsic width that can extend beyond the page.
- Widths are normalized to the actual printable page width before AutoTable renders, and `tableWidth: "auto"` is used so the table cannot run past the margins.
- Long values continue to wrap inside cells and table headers repeat on continued pages.
- Philippine peso text uses `P` in jsPDF built-in fonts to avoid broken glyphs.
- Footer placement follows the actual page orientation.

## Word

- Word table widths are normalized to a fixed printable width instead of allowing oversized grids (especially the 12-column sector matrix).
- All table columns have explicit widths or safe fallbacks, with repeat-header rows and non-splitting rows.
- Added standard `styles.xml`, `settings.xml`, core properties, and extended properties parts so the generated DOCX has a complete, standards-friendly OPC package.
- Image relationships are only emitted when the corresponding image data exists.
- XML content is sanitized/escaped before it is written into WordprocessingML.
- Internal TOC bookmarks/hyperlinks remain supported.

## Verification

The supplied 706-page CBMS 2022 PDF was visually inspected. The source PDF shows a right-edge clipping defect on detailed income pages because the `income` and `status` columns did not have widths; those columns are now explicitly sized and normalized.

A WordprocessingML smoke document using the revised table/package structure was rendered successfully with LibreOffice and produced clean table output.
## Electron Windows packaging fix

Windows packaging now uses the existing `src/assets/favicon.ico` instead of converting the 512px PNG with electron-builder's WebAssembly icon converter. This avoids `WebAssembly.Memory(): could not allocate memory` failures on lower-memory Windows machines during `electron:build`.

