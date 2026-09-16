# CBMS Insights Enhanced Release

## Included improvements

### Walkthrough
- Rebuilt the initial onboarding with a modern visual layout, progress indicator, animations and responsive mobile layout.
- Uses the system screenshots in `src/assets/application screenshots/`.
- Expanded the tour to cover Dashboard, Import, Person Search, Sectors, Demographics, Barangays, Cross Tabulation, Reports, Validation, Dataset Inspector, Export Logs and Households.
- First-launch completion is now stored in `localStorage` using `localdata.onboarding.done`.
- The old `sessionStorage` behavior was removed, so closing/reopening the application does not show the onboarding again.
- `Skip` and `Finish` both permanently complete the onboarding for that installation.

### Sector verification fixes
- PWD summary matching now uses the exact `Persons with Disability` summary label. The previous substring match could select `Non-PWD Population`, producing false totals such as `11892`.
- Sector records now preserve a stable `_person_key` when building grouped/export rows.
- Duplicate detection no longer relies primarily on displayed name/age/household fields.
- Sector recognition lists are deduplicated by stable person identity.
- Barangay group rows are deduplicated by the preserved person identity.
- Verify Counts vs Exports now compares filtered barangay lists against the correct category total.
- TOTAL rows are also checked against the corresponding filtered field, not only the whole table total.

### Visual polish
- Added application-level page entrance animation.
- Improved sidebar depth, hover states, active navigation, card shadows and transitions.
- Added a polished onboarding modal with glass/backdrop treatment and responsive layouts.
- Added reduced-motion support for accessibility.
- Added subtle background gradients and consistent selection/button interactions.

## Build note

The source changes are complete. The production `.output` bundle in the supplied ZIP was not regenerated in this environment because the project dependencies were not available and `npm install` could not complete within the build environment.

After extracting the project on the development machine:

```bash
npm install --legacy-peer-deps
npm run build
```

For development:

```bash
npm install --legacy-peer-deps
npm run dev
```

The next production build will regenerate `.output` with the enhanced source.


## Sector report presentation

Sector reports now use a simple report format: a two-column municipality Summary (Summary / Count), followed by every official barangay in A-Z order. Each barangay has its own heading, a count sentence such as “58 Senior Citizen(s) in this barangay”, and a detailed person table with names sorted A-Z. Zero-count barangays remain visible with an empty table.
