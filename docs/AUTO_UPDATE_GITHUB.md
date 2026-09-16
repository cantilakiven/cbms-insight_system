# MutiaLytics GitHub Releases and Automatic Updates

## How to verify updates actually work

Automatic updates are available only in a **packaged Windows NSIS installer**, not `npm run electron:dev`. The application checks GitHub Releases shortly after startup and exposes **Check updates** in the top bar.

Test with two real versions:

1. Install the older release, for example `1.2.4`.
2. Publish a newer release, for example `1.2.5`, with a matching tag `v1.2.5`.
3. Start the installed `1.2.4` application while connected to the internet.
4. Click **Check updates**.
5. The app should show the newer version, download it, then show **Update ready**.
6. Restart the app and confirm `app.getVersion()` is `1.2.5`.

A release must contain all three Windows updater assets:

- `Mutia-Insight-Setup-X.Y.Z.exe`
- `latest.yml`
- `Mutia-Insight-Setup-X.Y.Z.exe.blockmap`

The `.blockmap` is not the installer. `latest.yml` is the updater manifest. electron-updater uses both together with the NSIS installer.

## Release flow

The workflow intentionally **does not let electron-builder publish**. It runs `electron-builder --publish never`, then creates/uploads a single GitHub Release. This prevents duplicate releases and publish races.

Use:

```powershell
git add .
git commit -m "Release v1.2.5"
git push origin main
git tag v1.2.5
git push origin v1.2.5
```

`package.json` version must exactly equal `1.2.5`. The workflow rejects mismatches.

## Recommended source/release security

If source confidentiality matters, keep the **source repository private** and publish only the Windows release assets to a separate public `cbms-mutia-releases` repository. Do not put a GitHub token in the installed app. See `docs/GITHUB_SECURITY.md`.
