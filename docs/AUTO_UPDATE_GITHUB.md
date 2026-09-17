# GitHub Releases and Automatic Updates

## Production release assets

Every Windows release must contain exactly these updater assets:

- `Mutia-Insight-Setup-X.Y.Z.exe`
- `latest.yml`
- `Mutia-Insight-Setup-X.Y.Z.exe.blockmap`

The GitHub UI may also show its automatically generated source archives. Those source archives are a consequence of repository visibility; they are not uploaded by the release workflow.

## Versioning

Keep these identical:

```text
package.json version = 1.2.6
Git tag              = v1.2.6
```

## Release commands

```powershell
git add .
git commit -m "Release v1.2.6"
git push origin main
git tag v1.2.6
git push origin v1.2.6
```

## Workflow

The workflow:

1. checks repository safety;
2. checks package/tag version equality;
3. builds the web application;
4. builds NSIS with publishing disabled;
5. validates `latest.yml` and the installer;
6. creates one GitHub Release;
7. uploads `.exe`, `latest.yml`, and `.blockmap`;
8. verifies the published assets.

This design avoids the duplicate-release race caused by having both electron-builder and `gh release create` publish independently.

## Real auto-update test

Use a packaged installation, not `npm run electron:dev`.

Example:

```text
Installed version: 1.2.5
New release:       1.2.6
```

1. Install 1.2.5.
2. Publish 1.2.6.
3. Start 1.2.5 while online.
4. Click **Check updates**.
5. Wait for **New update** / download progress.
6. Confirm **Update ready**.
7. Restart the application.
8. Confirm the installed version is 1.2.6.

## Public source versus public release

If the source repository is public, GitHub will make the tag source archive visible. For source confidentiality, move the source repository to private and publish binaries from a separate public release-only repository. See `docs/GITHUB_SECURITY.md`.
