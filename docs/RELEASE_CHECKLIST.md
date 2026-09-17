# Windows Release Checklist

## Before commit

```powershell
npm install
npm run lint
npm run validate:project
npm run build
```

## Version

Update `package.json` first. Example:

```text
package.json = 1.2.6
tag = v1.2.6
```

## Release

```powershell
git add .
git commit -m "Release v1.2.6"
git push origin main
git tag v1.2.6
git push origin v1.2.6
```

## Expected GitHub assets

- `Mutia-Insight-Setup-1.2.6.exe`
- `latest.yml`
- `Mutia-Insight-Setup-1.2.6.exe.blockmap`

## Auto-update test

Install the previous version, publish the new version, run the previous installed application while online, click **Check updates**, download, restart, and verify the new version.
