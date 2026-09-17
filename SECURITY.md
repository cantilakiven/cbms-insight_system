# Security Policy

## Reporting a security issue

Do not report a vulnerability by attaching CBMS records, passwords, PSA keys, private keys, or other sensitive municipal data to a public GitHub issue.

Use the repository's private security reporting mechanism where available, or contact the project maintainer through the official contact channel established for the deployment.

## Never disclose these in issues or pull requests

- raw CBMS JSON;
- `.RData`, `.Rda`, `.RDS`;
- PSA RSA/decryption keys;
- Windows signing certificates/private keys;
- GitHub tokens;
- export passwords;
- employee or household personal information.

## Supported security controls

The project includes CodeQL configuration, repository safety scanning, Dependabot configuration, protected export workflows, and the Electron startup PIN/lockout system.
