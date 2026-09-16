# Agriculture & Rural Livelihood Sector Views

The Sector Rosters now include four barangay-based views for both CBMS 2022 and CBMS 2024:

1. Farming & Non-Farming Households by Barangay
2. Farming Household Poverty / Low-Income by Barangay
3. Agricultural vs Non-Agricultural Employment by Barangay
4. Agricultural Household Income by Barangay

All four views provide a Summary, a By Barangay Summary, and A-Z barangay detail tables.

## Classification rules

A farming household is identified when at least one household member has the normalized farmer indicator (`e17_farmer`) or agriculture-related occupation/industry terms. The displayed method note in the application uses this rule explicitly.

The poverty view is deliberately labeled as an **income-based proxy**, not an official PSA poverty classification. It counts farming households with reported family income below ₱20,000 and calculates the proxy rate as: 

`low-income farming households / farming households with reported income × 100`

Agricultural employment uses employment status plus agriculture-related occupation/industry indicators. The agricultural employment rate is shown against the labor-force denominator and is separately distinguished from the agricultural share of employed persons.

Agricultural household income uses only numeric reported family income and calculates the arithmetic mean and median. Income source/industry details come from the identified agricultural household member; the report does not invent an unreported income source.


## Farming Households with Reported Income by Barangay

The sector `Farming Households with Reported Income by Barangay` is available for CBMS 2022 and CBMS 2024. It is built at household level from the normalized `H06 Total Family Income` field and classified farming households. The summary counts unique households; the detailed A–Z barangay roster lists agricultural/farming persons linked to those households.

Displayed person-level fields include Full Name, Sex, Age, Barangay, Household Head, Reported Family Income (household amount), Class of Work, Farmer/Agricultural Activity, Occupation, and Industry. The income amount must not be interpreted as that individual's salary.

For CBMS 2022, the adapter preserves the original agricultural engagement fields used to identify crop, livestock/poultry, and other farming activity. For CBMS 2024, normalized farmer/occupation/industry indicators are used when present. The report never invents an income value for a blank/non-numeric field.
