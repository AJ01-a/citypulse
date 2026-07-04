# CityPulse — Neepawa Live Status

A **fully automated** status dashboard for **Neepawa, Manitoba**: live weather, Environment Canada severe-weather alerts, highway closures, driving conditions, and highway cameras.

Hosted entirely on **GitHub**: the site is static files on **GitHub Pages**, and a scheduled **GitHub Actions** workflow fetches fresh data every ~6 minutes and redeploys. Current weather is additionally fetched live in the browser straight from Open-Meteo (keyless, CORS), so it is real-time regardless of the pipeline. No servers, no database, no hosting bill.

## Architecture

```
GitHub Actions (cron every 6 min)
  └─ scripts/fetch-data.mjs
       ├─ Open-Meteo ──────────────► data/weather.json
       ├─ Environment Canada XML ──► data/incidents.json  (+ MB511 events)
       ├─ Manitoba 511 API ────────► data/roads.json      (conditions + cameras)
       └─ Hazard Watch ────────────► data/hazards.json
            ├─ Open-Meteo air quality  (AQHI / wildfire smoke)
            ├─ NRCan CWFIS hotspots    (active wildfires ≤200 km)
            └─ ECCC GeoMet hydrometric (Whitemud River gauge 05LL005)
  └─ deploy everything to GitHub Pages

Browser
  └─ index.html reads the three JSON files (same-origin)
  └─ + live current-conditions fetch direct from Open-Meteo (keyless, CORS)
```

The Manitoba 511 API key is used **only inside the workflow**. It never appears in the repo or in the browser.

## Setup (one time)

1. **Create the GitHub repo and push** (repo must be **public** — free GitHub Pages and unlimited Actions minutes require it, which is also why the key must never be in code):

   ```powershell
   git add -A
   git commit -m "Move to GitHub Pages + Actions"
   git remote add origin https://github.com/<you>/citypulse.git
   git push -u origin main
   ```

2. **Add the API key as a secret** — repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `MB511_API_KEY`
   - Secret: your Manitoba 511 key

   Never commit the key, never paste it into code or chat. If it's ever exposed, request a new one at manitoba511.ca.

3. **Enable Pages** — repo → **Settings → Pages → Source: GitHub Actions**.

4. **Run it once** — repo → **Actions → "Fetch data & deploy to Pages" → Run workflow**. After ~1 minute the site is live at `https://<you>.github.io/citypulse/` and keeps itself updated from then on.

## What runs automatically

| What | Source | Key needed |
|---|---|---|
| Current weather + 4-day forecast | [Open-Meteo](https://open-meteo.com) | No |
| Severe weather warnings | Environment Canada Datamart (Brandon station `s0000492`) | No |
| Road closures & events (≤60 km) | [Manitoba 511](https://www.manitoba511.ca) | `MB511_API_KEY` |
| Highway driving conditions (≤80 km) | Manitoba 511 | `MB511_API_KEY` |
| Highway cameras (≤120 km, nearest 8) | Manitoba 511 | `MB511_API_KEY` |
| Air quality / wildfire smoke (AQHI) | Open-Meteo Air Quality | No |
| Active wildfires (≤200 km, satellite) | [NRCan CWFIS](https://cwfis.cfs.nrcan.gc.ca) hotspot CSV | No |
| Whitemud River level & flow (gauge 05LL005) | [ECCC GeoMet](https://api.weather.gc.ca) hydrometric-realtime | No |

Features that could not be automated (community incident reports, email subscriptions) were removed.

## Security posture

- **No backend at all.** The published site is read-only static files — there are no endpoints to abuse, no forms, no database, no sessions. "Unusual HTTP requests" have nothing to hit.
- **DDoS**: GitHub Pages sits behind GitHub's global CDN, which absorbs volumetric attacks. There is no per-site rate limiting to configure (and none needed — a request can only ever fetch a cached file).
- **Secret handling**: the 511 key lives in an encrypted Actions secret, masked in logs, used ~3 requests per run (every ~6 minutes) from GitHub's runners only.
- **Browser hardening**: strict Content-Security-Policy via `<meta>` (GitHub Pages can't set HTTP headers), no inline scripts, Subresource Integrity on the Leaflet CDN files, `rel="noopener"` on external links, a JS frame-busting guard, `referrer` policy set.
- **Workflow hardening**: least-privilege permissions (`contents: read` + Pages deploy), pinned major action versions, 10-minute timeout, concurrency lock.

Known limitations of static hosting: real HTTP security headers (HSTS, X-Frame-Options) can't be customized on GitHub Pages, and `frame-ancestors` is ignored in meta CSP — the JS frame guard is the fallback. If you ever need those, put Cloudflare (free) in front of the Pages site.

## GitHub Actions notes

- **GitHub's cron scheduler is best-effort**: firings are routinely delayed minutes and often dropped entirely under load (observed: a 20-min cron firing only ~once an hour). The schedule is intentionally dense (every 6 min) so that even heavy dropping keeps real-world updates ~10 minutes apart.
- **60-day auto-disable is self-healing**: each scheduled run re-enables the workflow via the API (`actions: write` + the `Keep scheduled runs alive` step), which resets GitHub's inactivity timer — no human ever needs to click re-enable.
- Usage: up to ~240 runs/day × ~30 s. Public repos get unlimited Actions minutes.
- Each run "fails soft": if one source is down, the other files still update and the previous data stays live. Every upstream request has a 30 s timeout so a hung source can never stall the whole deploy.

### Optional: guaranteed clockwork updates

If GitHub's scheduler drops too many firings for your taste, an external pinger makes updates fire like clockwork (one-time, 10-minute setup):

1. Create a **fine-grained personal access token** (GitHub → Settings → Developer settings) scoped to only this repo with **Actions: Read and write** permission.
2. On [cron-job.org](https://cron-job.org) (free), create a job that runs every 5–10 minutes:
   - URL: `https://api.github.com/repos/<you>/citypulse/actions/workflows/deploy.yml/dispatches`
   - Method: `POST`, body: `{"ref":"main"}`
   - Headers: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`

The workflow already accepts `workflow_dispatch`, so no code change is needed.

## Local development

```bash
npm install
node scripts/fetch-data.mjs      # fetch real data into data/ (weather + EC work without a key)
npx serve .                      # any static server works; then open http://localhost:3000
```

To test the 511 sources locally (PowerShell):

```powershell
$env:MB511_API_KEY = "your-key"
node scripts/fetch-data.mjs
```

## Project layout

```
citypulse/
├── index.html / about.html
├── css/style.css
├── js/
│   ├── data.js               # CITY_CONFIG, WMO mapping, JSON loaders
│   └── main.js               # Dashboard render: weather, alerts, incidents, conditions, cameras, map
├── data/                      # Machine-written by the workflow (seed files committed)
│   ├── weather.json
│   ├── incidents.json
│   ├── roads.json
│   └── hazards.json           # Hazard Watch: air quality + wildfires + river
├── scripts/fetch-data.mjs     # All upstream fetching + filtering
├── .github/workflows/deploy.yml
└── package.json               # fast-xml-parser (EC alerts XML)
```

## Customize for a different town

1. **`js/data.js`** → `CITY_CONFIG.name`, `center`, `zoom`
2. **`scripts/fetch-data.mjs`** → `CENTER`, radii, `NEARBY_KEYWORDS`/`NEARBY_HIGHWAYS`, `EC_SITE_CODE` (find yours at https://dd.weather.gc.ca/today/citypage_weather/MB/00/)

## Data caveats

- **EC alerts** come from **Brandon's** forecast region — the closest coverage to Neepawa; very localized warnings may not appear.
- **Open-Meteo** interpolates model data to Neepawa's coordinates; nearest official station is Brandon Airport.
- **Road conditions** are seasonal — Manitoba 511 publishes them mainly fall through spring; the dashboard shows a friendly empty state otherwise.
- MB511 v2 `roadconditions` field shapes vary; the fetcher parses defensively (polyline geometry → point coordinates → highway-name fallback). If the section stays empty in winter, check the Actions run log.
