# MutiaLytics Release Checklist

## Before tagging

- [ ] `package.json` version is the intended next version.
- [ ] No release tag uses a lower version than the installed production build.
- [ ] `npm run build` works locally.
- [ ] `npm run electron:dev` works for a smoke test.

## Tagging

```powershell
git add .
git commit -m "Release v1.2.2"
git push origin main
git tag v1.2.2
git push origin v1.2.2
```

## GitHub Release assets

The workflow must publish all three updater assets:

- [ ] `Mutia-Insight-Setup-X.Y.Z.exe`
- [ ] `latest.yml`
- [ ] `Mutia-Insight-Setup-X.Y.Z.exe.blockmap`

GitHub may also show the automatic Source code ZIP/TAR.GZ assets. Those are not the desktop installer.

## Post-release test

- [ ] Install the released `.exe` on a clean Windows machine.
- [ ] Confirm the app opens normally.
- [ ] Publish the next patch version.
- [ ] Confirm the installed app detects the newer version.
- [ ] Confirm the update download/install completes.
