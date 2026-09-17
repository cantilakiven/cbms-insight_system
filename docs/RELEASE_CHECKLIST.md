# Windows Release Checklist

## Required versioning

Keep these exactly aligned:

- `package.json` version: `1.2.4`
- Git tag: `v1.2.4`

The release workflow fails if they differ.

## Expected Windows artifacts

A successful release must contain:

- `Mutia-Insight-Setup-X.Y.Z.exe`
- `latest.yml`
- `Mutia-Insight-Setup-X.Y.Z.exe.blockmap`

The `.exe` is the desktop installer. The `.blockmap` is not an installer; it supports update delivery.

## Update metadata

electron-builder generates modern `latest.yml` metadata. Newer electron-builder releases may put the installer URL under `files[].url` instead of the legacy top-level `path`. The repository validation script accepts both formats and URL-encoded filenames.

## Publishing

```powershell
git add .
git commit -m "Release v1.2.4"
git push origin main
git tag v1.2.4
git push origin v1.2.4
```

GitHub Actions then builds the NSIS installer, validates the updater metadata, uploads the three Windows updater assets, and verifies the final GitHub Release.
