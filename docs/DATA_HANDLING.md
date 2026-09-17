# Data Handling and Privacy Notes

## What the published application contains

The source tree contains application logic, report definitions, adapters, and local-area branding. It does not contain the operator's raw CBMS JSON data, `.RData`/`.RDS` files, PSA RSA keys, or generated release binaries.

## What remains on the authorized workstation

When an operator imports CBMS JSON, the normalized records are held in memory and cached in local IndexedDB so the application can continue to work offline and across restarts. Exported archives and passwords are also managed locally.

## Operational safeguards

The LGU should determine appropriate:

- authorized users;
- user access levels;
- retention periods;
- export/sharing approvals;
- secure storage locations;
- backup and destruction procedures;
- DPO and records-management oversight.

## Public repository rule

Never upload local-area raw data to GitHub, even to a private repository unless the LGU's authorization explicitly allows it. Do not put data into issues, pull requests, workflow logs, screenshots, or test fixtures.

## Legal context

See the official National Privacy Commission and PSA references linked in the root README. This document is operational guidance and does not replace LGU legal/privacy advice.
