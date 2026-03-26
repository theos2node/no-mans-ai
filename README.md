# No Man's AI

Pixel-office simulation prototype with a full-screen map, animated staff, a dashboard view, and a visual settings panel for editing the active routing grid and location anchors.

## Current App

- full-screen office view with animated characters
- dashboard view with profile cards and live status text
- runtime controls for `Run`, `Pause`, `Test`, and `Live` / `Not live`
- backend simulation engine for employee task state, phase progression, and route assignment
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
src/api/simulationEngine.ts
```

## Run

```bash
npm install
npm run api
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

The API server runs on [http://localhost:8787](http://localhost:8787).

## API

- `GET /api/health`
- `GET /api/status`
- `GET /api/meta`
- `GET /api/employees`
- `POST /api/start`
- `POST /api/stop`
- `POST /api/reset`
- `POST /api/test`
- `POST /api/employees/sync`
- `GET /events`

## Notes

- The office UI is the active product surface in this repo.
- The old Riverside Pottery Studio simulation scaffold has been removed.
- The API layer now owns employee task logic and uses the frontend primarily for route playback and position sync.
