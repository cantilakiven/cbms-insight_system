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
package.json = 1.2.7
tag = v1.2.7
```

## Release

```powershell
git add .
git commit -m "Release v1.2.7"
git push origin main
git tag v1.2.7
git push origin v1.2.7
```

## Expected GitHub assets

- `CBMS-Insights-Setup-1.2.7.exe`
- `latest.yml`
- `CBMS-Insights-Setup-1.2.7.exe.blockmap`

## Auto-update test

Install the previous version, publish the new version, run the previous installed application while online, click **Check updates**, download, restart, and verify the new version.
