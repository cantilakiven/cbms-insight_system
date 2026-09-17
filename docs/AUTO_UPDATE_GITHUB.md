# GitHub Releases and Automatic Updates

> **Repository migration:** The updater feed is now `github.com/cantilakiven/cbms-insight_system`. Existing installations that were built with the former repository configuration will not automatically learn the new feed until they install a build containing this repository change; publish a bridge release on the old feed if seamless migration of already-installed builds is required.

## Production release assets

Every Windows release must contain exactly these updater assets:

- `CBMS-Insights-Setup-X.Y.Z.exe`
- `latest.yml`
- `CBMS-Insights-Setup-X.Y.Z.exe.blockmap`

The GitHub UI may also show its automatically generated source archives. Those source archives are a consequence of repository visibility; they are not uploaded by the release workflow.

## Versioning

Keep these identical:

```text
package.json version = 1.2.7
Git tag              = v1.2.7
```

## Release commands

```powershell
git add .
git commit -m "Release v1.2.7"
git push origin main
git tag v1.2.7
git push origin v1.2.7
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
Installed version: 1.2.6
New release:       1.2.7
```

1. Install 1.2.6.
2. Publish 1.2.7.
3. Start 1.2.6 while online.
4. Click **Check updates**.
5. Wait for **New update** / download progress.
6. Confirm **Update ready**.
7. Restart the application.
8. Confirm the installed version is 1.2.7.

## Public source versus public release

If the source repository is public, GitHub will make the tag source archive visible. For source confidentiality, move the source repository to private and publish binaries from a separate public release-only repository. See `docs/GITHUB_SECURITY.md`.

### npm dependency installation in GitHub Actions

The release workflow intentionally uses `npm install` and does not commit a `package-lock.json`. `actions/setup-node` dependency caching requires a lockfile when `cache: npm` is enabled, so the workflow explicitly sets `package-manager-cache: false`. This avoids the `Dependencies lock file is not found` failure while keeping the release reproducible through the exact `package.json` dependency ranges checked into the repository.

