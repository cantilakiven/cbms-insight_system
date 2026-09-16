# CBMS 2023 Sector Data Refactor

The 2023 legacy adapter now maps the 2023 CBMS Form 2 codes into the same human-readable normalized fields used by the 2024 sector screens.

## Corrected 2023 sector mappings

- Education level (`C02_HGC_LEVEL` / `C02_HGC`) is converted to the same labels used in 2024, including Senior High School, Junior High School, Elementary, College, postgraduate levels, and Not Stated.
- Occupation/industry uses the 2023 text fields (`E07_OCCUPATION`, `E09_KIND_OF_BUSINESS_OR_INDUSTRY`) instead of relying only on numeric PSOC/PSIC codes.
- Coconut farmer detection can use current occupation/industry and the legacy last-job text fields.
- Fisherfolk detection can use the 2023 agricultural/fishing indicators and occupation/industry text.
- 4Ps received-benefit status now reads the 2023 `P06_A` / `P06_B` benefit records instead of being forced to `null`.
- 2023 marital-status codes were corrected to match the 2023 CBMS questionnaire.

## Important data-integrity rule

A sector must not fabricate a value when the 2023 questionnaire did not collect that information. For example, the 2023 dataset does not contain the 2024 Food Stamp fields, so those fields remain unavailable rather than being inferred from unrelated assistance programs.

## Requested Sector Rosters — 
Added normalized Sector-tab rosters with municipality summary + barangay summary + named records for:
- Farmers
- Coconut Farmers
- Fisherfolk
- PWD with Disability
- Persons without Disability
- 4Ps Members
- Non-4Ps Members
- Solo Parents
- Social Pensioners
- Early Childhood
- Safe Walking at Night

Each roster is backed by the normalized 2023 fields and retains `legacy_raw` for auditability.

2023 public-safety item O01 is normalized to: Safe, Somewhat safe, Somewhat unsafe, Unsafe, Afraid to be alone.
2023 disability status is derived from A20 functional-difficulty responses.
2023 person-level 4Ps/SocPen benefit fields are populated from Section P02-P13 where a line-numbered benefit record exists.
