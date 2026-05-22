# CityPulse — Local Outage Tracker

A community-powered dashboard for power outages, water advisories, internet disruptions, and road closures. Pure HTML/CSS/JS. No backend required for MVP — reports persist in `localStorage`. Designed for one-click Netlify deploys from GitHub.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Live dashboard: status banner, 4 category cards, incidents list, map |
| `report.html` | Submit a new incident with a map pin |
| `alerts.html` | Email subscription form (Netlify Forms) |
| `about.html` | Project info, data sources, disclaimer |
| `thanks.html` | Post-subscribe confirmation |

## Stack
- Vanilla HTML / CSS / JS — no build step
- [Leaflet](https://leafletjs.com/) for maps (free, OpenStreetMap tiles, no API key)
- `localStorage` for community reports (MVP)
- Netlify Forms for email signups

## Customize for your city

Edit `js/data.js`:

```js
const CITY_CONFIG = {
  name: "Your City",              // shown in header
  center: [40.7128, -74.0060],    // [lat, lng] — your city center
  zoom: 12,
  storageKey: "citypulse.reports.v1",
  reportTTLms: 24 * 60 * 60 * 1000, // reports expire after 24h
};
```

Update `SEED_REPORTS` in the same file with realistic local examples (or empty array `[]` for a clean start).

## Going beyond MVP

The localStorage model means each visitor sees their own reports + seed data. To make it a true community feed:

1. **Add Netlify Functions** in `netlify/functions/`:
   - `reports.js` — GET/POST to a database (Supabase, FaunaDB, Netlify Blobs)
2. **Swap `addReport()` / `loadReports()`** in `js/data.js` to call those endpoints
3. **Add real data feeds** via scheduled functions:
   - Local power utility outage JSON
   - 511 traffic API
   - Water advisory RSS

## Deploy

```bash
git init
git add .
git commit -m "Initial CityPulse site"
git branch -M main
gh repo create citypulse --public --source=. --remote=origin --push
```

Then on Netlify: **Add new site → Import from GitHub** → pick `citypulse` → Deploy. No build settings needed; `netlify.toml` handles publish dir + security headers.

## Local preview

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Notes

- Reports older than 24h auto-purge on every page load.
- Map pin coordinates are optional — reports without pins still show in the list.
- The form's "Use My Location" button requires HTTPS (works on Netlify; on localhost, requires `http://localhost` exactly).
