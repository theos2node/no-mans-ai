# No Man's AI

Pixel-office simulation prototype with a full-screen map, animated staff, a dashboard view, and a visual settings panel for editing the active routing grid and location anchors.

## Current App

- full-screen office view with animated characters
- dashboard view with profile cards and live status text
- runtime controls for `Run`, `Pause`, `Test`, and `Live` / `Not live`
- settings panel with:
  - live grid overlay
  - copy/apply grid selection
  - reveal locations
  - manual location placement on exact cells

## Main Files

```text
src/App.tsx
src/main.tsx
src/styles.css
src/officeNavigation.ts
src/default-grid-selection.json
src/default-location-selection.json
src/api/server.ts
```

## Run

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Notes

- The office UI is the active product surface in this repo.
- The old Riverside Pottery Studio simulation scaffold has been removed.
- The API bridge reports runtime status for the current app and no longer launches the deleted legacy simulation.
