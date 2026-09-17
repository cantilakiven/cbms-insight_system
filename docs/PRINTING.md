# Printing behavior

CBMS Insights uses one shared Electron printing path from the system-wide Print Preview modal.

## Paper sizes

- Folio — 215.9 × 330.2 mm
- A4 — 210 × 297 mm
- Letter — 215.9 × 279.4 mm
- Legal — 215.9 × 355.6 mm
- A3 — 297 × 420 mm

## Orientation

The application preview reflects the selected portrait or landscape orientation. The physical printer handoff uses the selected paper dimensions and the Windows printer dialog so the manufacturer driver can apply the final media/orientation settings.

## Zoom

Fit view shows the whole page. At higher zoom, the preview is a two-dimensional scroll surface so the user can reach the top, bottom, left, and right edges of portrait and landscape pages.

## Troubleshooting

If a printer still outputs portrait when landscape was selected:

1. Confirm the selected paper size is supported by the printer.
2. Confirm **Landscape** is selected in the final Windows printer dialog.
3. Prefer the printer manufacturer's Windows driver over a generic driver where applicable.
4. Test the same paper size from another Windows application to distinguish driver behavior from application behavior.
