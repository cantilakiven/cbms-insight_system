# GitHub, Source, Release, and Update Security

## The most important fact

A public GitHub repository is a public source repository. An Electron `.exe` does not hide TypeScript/JavaScript source that is already public, and Electron packages normally contain an `app.asar` archive that can be inspected by someone who has the installed application.

The `"private": true` field in `package.json` is an npm publication control; it does **not** make a GitHub repository private. Repository visibility must be controlled in GitHub.

### Recommended production architecture

For source confidentiality, use two repositories:

```text
PRIVATE SOURCE REPOSITORY
        │
        └── GitHub Actions release workflow
                       │
                       ▼
PUBLIC RELEASE-ONLY REPOSITORY
        ├── Mutia-Insight-Setup-X.Y.Z.exe
        ├── latest.yml
        └── Mutia-Insight-Setup-X.Y.Z.exe.blockmap
```

The current project configuration intentionally remains compatible with the existing repository. Migrating the public updater feed to a separate release-only repository requires creating that repository first and changing the owner/repo configuration in `package.json` plus the release workflow.

Do not put a GitHub write token in the desktop application.

## Repository hardening

Enable:

- branch protection for `main`;
- CodeQL code scanning;
- Dependabot alerts/updates;
- secret scanning where available;
- least-privilege Actions permissions;
- required review for release workflow changes.

Do not commit:

- raw CBMS JSON;
- `.RData`, `.Rda`, `.RDS`;
- PSA RSA/private keys;
- `.pfx`, `.p12`, `.pem`, `.key`;
- GitHub tokens;
- `.env` secrets;
- Windows installer binaries;
- `.blockmap` or `latest.yml` generated artifacts.

## Automated repository safety check

Run:

```powershell
npm run validate:project
```

The same check runs in GitHub Actions before the release build and security workflow.

## Automatic updater

The packaged Windows build uses `electron-updater` and NSIS. A correct release contains the installer, `latest.yml`, and blockmap. The client must never need a secret token to download a public release.

## Code signing

The current updater architecture should be paired with an Authenticode code-signing certificate for production distribution. Without code signing, Windows cannot give users the same publisher-identity assurance as a signed installer.

## Duplicate releases

Only one workflow is allowed to publish the release. The current workflow builds with `electron-builder --publish never` and then explicitly creates/updates the GitHub Release. Do not reintroduce `--publish always` or a second publisher for the same tag.

## Sensitive historical data

Deleting a sensitive file from the current branch does not necessarily remove it from Git history. If raw CBMS data, a token, or a private key was committed previously, treat it as compromised and follow GitHub's sensitive-data removal process and rotate the credential/key.
