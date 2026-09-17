# Agriculture & Rural Livelihood Sector Views

The Sector Rosters include barangay-based views for CBMS 2022 and CBMS 2024:

1. Farming & Non-Farming Households by Barangay
2. Farming Household Poverty / Low-Income by Barangay
3. Agricultural vs Non-Agricultural Employment by Barangay
4. Agricultural Household Income by Barangay
5. Farming Households with Reported Income by Barangay

Each provides Summary, By Barangay Summary, and A–Z By Barangay detail where the source records support it.

## Farming household classification

A farming household is identified when at least one linked household member has the normalized farmer indicator or agriculture-related occupation/industry indicator recognized by the adapter/report logic.

## Reported family income

Reported household income comes from the normalized `H06 Total Family Income` field when it is numeric and present. Blank, null, or non-numeric values are not estimated.

## Farming households with reported income

The report counts unique farming households with a valid reported family income and shows a separate rate against all farming households where appropriate.

Detailed barangay rows can show linked farming persons with:

- Full Name
- Sex
- Age
- Household / Household Head context
- Reported Family Income (household amount)
- Class of Work
- Farmer / Agricultural Activity
- Occupation
- Industry

The income value is a household amount; it must not be interpreted as the individual's personal salary.

## Low-income proxy

Where the report uses the project's ₱20,000 threshold, the calculation is:

`low-income farming households / farming households with reported income × 100`

This is an **income-based project proxy**, not an official PSA poverty-incidence calculation.

## Agriculture classification

Agricultural employment uses employment status plus farmer, occupation, and industry indicators. The report distinguishes the agricultural rate denominator from the overall dataset population denominator.
