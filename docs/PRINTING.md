# Printing behavior

MutiaLytics uses one shared Electron printing path from the system-wide Print Preview modal.

## Paper sizes

- Folio — 215.9 × 330.2 mm
- A4 — 210 × 297 mm
- Letter — 215.9 × 279.4 mm
- Legal — 215.9 × 355.6 mm
- A3 — 297 × 420 mm

## Orientation

The preview reflects the selected portrait or landscape orientation. For the physical printer job, the application intentionally opens the native Windows print dialog instead of using a silent background print call.

This is deliberate: some Windows printer drivers ignore or reinterpret Chromium's silent-print orientation settings. The native Windows print dialog lets the installed printer driver negotiate the final media/orientation settings while the application still supplies the selected paper size and landscape/portrait preference.

The application therefore keeps the following sequence:

`Print Preview → select paper/orientation/printer → Print document → Windows printer dialog → Print`

## Troubleshooting a driver that ignores landscape

If a printer still shows portrait inside the Windows print dialog after selecting landscape in MutiaLytics:

1. Confirm the printer's Windows driver is installed and current.
2. Confirm the selected paper size is supported by that printer.
3. In the Windows print dialog, set **Landscape** before clicking the final Print button.
4. Prefer the printer's manufacturer driver over a generic Windows driver when both are available.

The custom app preview does not replace the printer manufacturer's driver settings.
