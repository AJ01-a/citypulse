# CityPulse — Neepawa Live Status

A fully automated, free-to-run local dashboard combining live weather, official severe-weather alerts, and community-reported incidents (power, water, internet, roads). Configured for **Neepawa, Manitoba**.

## What runs automatically

| What | Source | Frequency | Cost |
|---|---|---|---|
| Current weather + 4-day forecast | [Open-Meteo](https://open-meteo.com) | Every 30 min | Free, no API key |
| Severe weather warnings (tornado, blizzard, freezing rain, etc.) | Environment Canada Datamart XML (Brandon station `s0000492`) | Every 15 min | Free, no API key |
| Community reports (power, water, internet, road) | Visitors via `/report.html` | On submission | Free |

**Net result:** Once deployed, the site stays useful with zero ongoing maintenance. The only manual action is occasional content tweaks (city name, layout, etc.).

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Live dashboard: weather hero, alert banner, status cards, incident list, map |
| `report.html` | Submit a community incident with a map pin |
| `alerts.html` | Email subscription (Netlify Forms) |
| `about.html` | Data sources & disclaimer |
| `thanks.html` | Post-subscribe confirmation |

## Project layout

```
citypulse/
├── *.html
├── css/style.css
├── js/
│   ├── data.js        # CITY_CONFIG, WMO code mapping, fetch() helpers
│   ├── main.js        # Dashboard render: weather, alerts, incidents, map
│   └── report.js      # Submit form
├── netlify/
│   └── functions/
│       ├── reports.mjs       # GET/POST /api/reports
│       ├── get-weather.mjs   # GET /api/weather (with live fallback)
│       ├── poll-weather.mjs  # Cron */30min — fetches Open-Meteo
│       └── poll-alerts.mjs   # Cron */15min — parses EC weather XML
├── netlify.toml
├── package.json       # @netlify/blobs, fast-xml-parser
└── .gitignore
```

## Customize for a different town

Three places to edit if pointing this at a different Canadian community:

1. **`js/data.js`** → `CITY_CONFIG.name`, `center`, `zoom`
2. **`netlify/functions/poll-weather.mjs`** → `LAT`, `LNG`, `TZ`
3. **`netlify/functions/poll-alerts.mjs`** → `SITE_CODE` (find your nearest at https://dd.weather.gc.ca/today/citypage_weather/MB/00/ — open files to identify the city, then copy the `s0000XXX` code)

Common Manitoba site codes:
- `s0000492` — Brandon (closest to Neepawa)
- `s0000193` — Winnipeg
- `s0000395` — Dauphin
- `s0000626` — Portage la Prairie

## API endpoints

| Endpoint | Method | Returns |
|---|---|---|
| `/api/reports` | GET | `[{id, type, severity, area, description, lat?, lng?, source, verified, createdAt, expiresAt?}]` |
| `/api/reports` | POST | Created report (community submissions only — server forces `source: "community"`) |
| `/api/weather` | GET | Cached weather (`{current, daily, hourly, fetchedAt}`); falls back to live fetch if cache is missing or >1h stale |

## Local development

```bash
npm install -g netlify-cli
npm install
netlify dev
```

First run links the directory to your Netlify site. Then everything runs at `http://localhost:8888` — the dev server proxies functions and serves static files together.

**To manually trigger scheduled functions while developing:**
```bash
netlify functions:invoke poll-weather --no-identity
netlify functions:invoke poll-alerts --no-identity
```

## Deploy

```bash
git add .
git commit -m "Add automated weather + EC alerts"
git push
```

Netlify auto-detects:
- Static site in repo root
- Functions in `netlify/functions/`
- `package.json` → installs `@netlify/blobs` and `fast-xml-parser`
- Schedule config inside each function file → registers cron jobs

After the first deploy, cron starts running. Check **Functions** in the Netlify dashboard — you'll see `poll-weather` and `poll-alerts` listed with invocation logs.

## Free-tier limits (Netlify)

- **Functions:** 125k invocations/month
- **Scheduled invocations:** 4 per hour from `poll-alerts` + 2 per hour from `poll-weather` = ~4,400/month, plus on-demand reads from visitors
- **Blobs:** 5 GB storage, 100 GB egress
- **Forms:** 100 submissions/month

For a town of ~3,500 people, you'll never come close to these limits.

## Data caveats

- **EC alerts** are pulled from **Brandon's** forecast region — the closest Environment Canada coverage to Neepawa. Brandon and Neepawa share most severe-weather alerts (thunderstorms, blizzards, tornadoes, freezing rain), but very localized warnings may not appear.
- **Open-Meteo** uses GFS/ECMWF model interpolation for Neepawa's exact coordinates. Accuracy is comparable to Environment Canada for general conditions; for ground-truth observations the nearest official station is Brandon Airport (~80km SW).
- **Community reports** are user-submitted and unverified. The badge ✓ Official appears only on EC-sourced alerts.

## Roadmap (optional future work)

- **Manitoba 511 road conditions** — public API exists at `manitoba511.ca/developers/doc` but requires a free developer key + 10 calls/min rate limit. Skipped per "zero maintenance" goal; add if you want road closure data.
- **Email alert sending** — `alerts.html` collects subscriptions, but actually sending alerts requires a 4th scheduled function + an email provider (SendGrid free tier = 100/day).
- **Push notifications** via the Web Push API + Netlify Functions.
- **Historical archive** by writing daily snapshots to a separate Blobs key.
