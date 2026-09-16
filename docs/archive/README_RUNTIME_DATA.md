# Mutia Insight — CBMS 2022 / 2024 Runtime Data

## Data loading

The application does **not** bundle the CBMS JSON datasets. Import them after launching the application:

1. In **Import CBMS Data**, choose the complete **2022 CBMS folder**. The importer recognizes the legacy A/B/C JSON exports, merges overlapping household keys, and converts the legacy structure into the common application model.
2. Choose the complete **2024 CBMS folder**. The importer recognizes the normalized CBMS 2024 JSON files automatically.
3. The two years are stored separately in browser/Electron IndexedDB, so restarting the application does not require re-importing them.

### 2022 legacy merge

The supplied 2022 dataset contains overlapping `_A`, `_B`, and `_C` snapshots. The importer deduplicates by the CBMS household key and recursively combines non-empty fields before normalization. With the supplied dataset this results in 3,265 unique households and 11,261 person records across 16 barangays.

### Food-security indicator note

The 2022 `I02_FREQUENCY_OF_FOOD_CONSUMPTION` field is represented as a **food-consumption/expenditure frequency**, not a direct count of meals eaten per day. The sector page therefore labels the filters **Per Day** and **Per Week** rather than claiming that they mean one meal/day or two meals/day. The separate **Households That Skipped a Meal** sector uses the 2022 skipped-meal field.

## Exports

Sector pages use one **Download Complete Report** action. The generated PDF combines the summary, barangay-level summary, and detailed records where available. Individual table-level CSV/XLSX/PDF export controls are hidden on those sector tables.

## Comparative analysis

The comparison page uses 2022 and 2024 side-by-side with population/work/protection indicator groups, age/sex pyramids, barangay change bars, and a ranked change view. Indicators that do not exist in one source year are shown as **N/A** rather than being fabricated as zero.

## Lightweight build

The large JSON files were removed from `public/` and `src/data/` in this package. Only the importer, adapters, and application code are shipped. This keeps the packaged app smaller and prevents the CBMS JSON from entering the Vite module graph at build time.
