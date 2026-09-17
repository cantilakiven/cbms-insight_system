# CodeQL / GitHub Code Scanning Setup

The repository includes an advanced CodeQL workflow under `.github/workflows/security.yml`.

## Why the CodeQL job can show an error even when the scan itself succeeds

CodeQL can successfully extract and analyze the TypeScript/JavaScript code but fail when uploading the SARIF results if GitHub Code Scanning is not enabled for the repository. This is a GitHub repository setting, not a TypeScript or CodeQL query failure.

## Enable Code Scanning

For a public repository on GitHub.com:

1. Open the repository.
2. Go to **Settings**.
3. Open **Security & analysis / Code security** (the exact label can vary in the GitHub UI).
4. Enable **Code scanning / CodeQL**.
5. Keep the advanced workflow in `.github/workflows/security.yml` enabled.
6. Re-run the failed workflow from **Actions**.

GitHub documents CodeQL code scanning for public repositories and the advanced-setup workflow here:
https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning

## Required Actions permissions

The workflow requests only the permissions needed for this scan:

```yaml
permissions:
  contents: read
  security-events: write
  actions: read
```

Do not put a personal access token or GitHub password in the repository. The workflow uses the repository-provided `GITHUB_TOKEN`.

## Current fail-safe behavior

The CodeQL analysis step uses `continue-on-error: true` so a repository that has not enabled code scanning does not block other CI/release work. Once Code Scanning is enabled, the same workflow can upload its SARIF results and surface CodeQL alerts in the repository.

This is intentionally not presented as a substitute for enabling Code Scanning. For the strongest setup, enable Code Scanning in repository settings and keep the workflow green with successful uploads.
