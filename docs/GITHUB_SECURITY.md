# GitHub and Update Security

## Important
If the GitHub repository containing this source code is public, the source code is public. The Windows `.exe` release does not hide the source that is present in a public repository.

For a municipal deployment, the recommended free architecture is:

1. Make the application/source repository **private**.
2. Create a separate public repository named something like `cbms-mutia-releases` that contains only release binaries and updater metadata.
3. Store a fine-grained GitHub token as a secret in the private source repository (for example `RELEASES_TOKEN`) with access only to the release repository's contents.
4. Publish only `*.exe`, `latest.yml`, and `*.blockmap` to the public release repository.
5. Configure `electron-updater` to read updates from that public release repository.

Do **not** put a GitHub token inside the desktop application. A public updater feed must not require a secret on the client.

## Repository hardening
Enable branch protection for `main`, require pull requests for changes when appropriate, and keep Actions permissions at the minimum required. The release workflow should keep `permissions: contents: write` only because it must create/update releases. Never print secrets in workflow logs.

Enable GitHub Dependabot alerts/updates and secret scanning for the private source repository. Do not commit `.pfx`, `.p12`, private keys, GitHub tokens, or `.env` files.

## Windows code signing
The current updater can verify update signatures **only after the Windows installer is Authenticode-signed**. Without a real code-signing certificate, the application does not have publisher-identity verification. See the electron-builder Windows signing documentation.

## Duplicate GitHub releases
The previous workflow used `electron-builder --publish always` and then a second manual `gh release create/upload` phase. That creates two competing publishers and can race. It also had `workflow_dispatch`, which could run without a release tag.

The current workflow fixes this by:

- running only when a `v*` tag is pushed;
- building with `--publish never`;
- creating the GitHub Release exactly once;
- uploading `.exe`, `latest.yml`, and `.blockmap` explicitly; and
- verifying those three assets afterward.
