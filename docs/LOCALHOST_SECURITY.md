# Localhost Security Model

CBMS Insights uses a loopback-only HTTP server for the packaged Electron application. The server binds to `127.0.0.1`, never `0.0.0.0`.

## Renderer capability header

Each launch creates a random 256-bit session capability. Electron injects it into every request to the application origin as `X-CBMS-Session`. Requests that do not carry the matching capability receive HTTP 403. The capability is held only in process memory and is not included in the URL.

This prevents a dragged/copied `http://127.0.0.1:PORT/...` address opened in a normal browser from loading the application. It also prevents simple localhost scanners that do not know the per-launch capability.

## Additional renderer hardening

- Internal page dragging is disabled to prevent accidental URL exposure.
- External navigation is intercepted and opened through the operating system browser.
- New embedded webviews are blocked.
- Production DevTools shortcuts are disabled.
- Renderer filesystem debug reads are disabled in packaged builds and restricted to the export log in development.
- Local server responses are marked `no-store` and include basic security headers.

## Important limitation

This is defense in depth, not a guarantee against a machine-local attacker with the ability to inspect the running Electron process. An attacker with administrator-level access, code injection capability, or a way to capture the in-process capability can potentially access the running application. The strongest architecture for eliminating localhost exposure entirely would be to replace the TCP loopback server with an Electron custom protocol or an OS IPC/named-pipe transport.

Raw municipal CBMS JSON files must remain outside the public source repository and public release assets.

## Development mode

`npm run dev` deliberately opens a normal Vite development server in a browser, so a browser address such as `http://127.0.0.1:8080/...` is expected and cannot be hidden. Use the packaged Electron application for the hardened runtime; it uses the protected per-launch localhost capability described above.
