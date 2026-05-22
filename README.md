# CityPulse — Local Outage Tracker

A community-powered dashboard for power outages, water advisories, internet disruptions, and road closures. Reports are shared across all visitors in real time via a Netlify Function + Netlify Blobs backend.

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
- [Leaflet](https://leafletjs.com/) for maps (free, OpenStreetMap tiles)
- **Netlify Functions** (`netlify/functions/reports.mjs`) — REST API at `/api/reports`
- **Netlify Blobs** — persistent shared storage for community reports
- Netlify Forms for email signups

## Project layout

```
citypulse/
├── index.html, report.html, alerts.html, about.html, thanks.html
├── css/style.css
├── js/
│   ├── data.js        # CITY_CONFIG, TYPE_META, fetch() helpers
│   ├── main.js        # Dashboard rendering, map, polling
│   └── report.js      # Submit form, picker map
├── netlify/
│   └── functions/
│       └── reports.mjs  # GET/POST /api/reports → Netlify Blobs
├── netlify.toml         # Headers, publish dir
├── package.json         # @netlify/blobs dependency
└── .gitignore
```

## Customize for your city

Edit `js/data.js`:

```js
const CITY_CONFIG = {
  name: "Your City",              // shown in header
  center: [40.7128, -74.0060],    // [lat, lng] — your city center
  zoom: 12,
};
```

## Local development

You need Node.js + Netlify CLI:

```bash
npm install -g netlify-cli
npm install
netlify dev
```

First run prompts you to link this folder to a Netlify site. Then the app + functions run together at `http://localhost:8888`.

## Deploy

```bash
git init
git add .
git commit -m "Initial CityPulse site"
git branch -M main
gh repo create citypulse --public --source=. --remote=origin --push
```

Then on Netlify: **Add new site → Import from GitHub** → pick `citypulse` → Deploy. Netlify auto-detects:
- Static site in repo root
- Function in `netlify/functions/`
- `package.json` — installs `@netlify/blobs` automatically

No environment variables or dashboard config needed. Blobs storage is provisioned on first write.

## API reference

`GET /api/reports` → `[{ id, type, severity, area, description, lat?, lng?, createdAt }, ...]`
`POST /api/reports` with the same shape (sans `id` and `createdAt`) → returns the created record

Server enforces:
- Type must be `power | water | internet | road`
- Severity must be `minor | moderate | major`
- Area 2–80 chars, description 5–280 chars
- Coords (if sent) must be valid lat/lng
- Body capped at 1 KB
- Reports older than 24h auto-purged on every read/write
- Max 500 reports retained globally

## Notes

- Dashboard polls `/api/reports` every 30s and on tab focus.
- Map pin coordinates are optional.
- "Use My Location" requires HTTPS (works on Netlify; localhost is exempt).
- Free tier covers ~125k function invocations/month — plenty for a neighborhood-scale deployment.
