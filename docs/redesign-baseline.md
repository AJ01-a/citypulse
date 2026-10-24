# CityPulse redesign — baseline (2026-10-24)

Branch: `feature/citypulse-redesign` (from `main` @ 43231c7). Nothing pushed.

## How this was tested

A Playwright harness (headless Chromium, Manitoba timezone) served the repo
locally and replaced every data source with fixtures: `data/*.json`, the
Open-Meteo weather and air-quality APIs, and the 511 camera images. Fixtures
were copied from the live site on 2026-10-24, with timestamps shifted for each
scenario. The real pipeline was **not** run and production data was not touched.
Each scenario ran at 1280×900 (desktop) and 390×844 (phone).

## Scenario results (all actually run)

| Scenario | Result | Correct? |
|---|---|---|
| Fresh data | Renders fully; "Updated 5m ago"; no banners; 8 cameras; 18 map markers; no JS errors | Yes |
| Stale data (5 h) | Amber stale banner shows; status line "Updated 5h ago" | Yes |
| `weather.json` missing (404) | Weather card "Weather unavailable"; **status line says "Updated just now"**; no stale banner | **No**: claims freshness it can't know |
| `incidents.json` invalid JSON | Treated as zero incidents: "No active incidents right now", Road incidents tile **"CLEAR"** | **No**: failed load shown as all-clear |
| All four data files missing | **Banner green "All clear", "Updated just now"** | **No**: worst case; looks healthy while nothing loaded |
| Open-Meteo weather API down | Falls back to baked weather; weather footer honestly says "Updated 5m ago" | Yes |
| Weather API down + data stale | Stale banner says **"Weather and air quality below are still live"**, but they're 5 h old | **No**: banner text is wrong in this case |
| Camera images fail (404) | Each card shows "Camera offline" | Yes |
| No cameras in data | Cameras section hidden; tile shows **"LIVE · 0"** | Minor: "Live" badge with 0 cameras |
| All Hazard Watch sections null | Hazard cards show "No data" | Yes (cards); but overall status ignores the gap |
| `hazards.json` missing | Same as above | Same |
| Active EC severe alert | Red alert banner, banner turns red "Major disruptions", tile "Weather alerts 1" | Yes |
| Empty incident list | Empty state shown; **status says "Use caution on area highways"** | **No**: the caution came from a wildfire 55 km away, not highways |
| Browser reload | Re-renders identically | Yes |
| Mobile nav | Toggle opens/closes, `aria-expanded` updates, links reachable | Yes |
| Horizontal scroll | None at either width | Yes |

## Behaviour problems found (fix before visual work)

1. **"Unavailable" is shown as "clear"/"fresh".** When a data file fails to load,
   loaders return empty data, and the page reports "All clear" / "CLEAR" /
   "Updated just now". This breaks requirement 4 (keep fresh / stale /
   unavailable / cached distinct).
2. **The status line blames the wrong thing.** The overall level mixes incidents,
   road conditions and hazards, but the text only talks about incidents or
   highways. Live example: 6 *minor* road items plus a wildfire 55 km N gives
   "Some disruptions — 6 active".
3. **The stale banner claims weather is "still live" even when the live call failed.**
4. The pipeline cuts incident descriptions at 280 characters mid-word with no
   ellipsis ("…Riding Mountain Nati"). This can be fixed on the display side
   without changing the pipeline.

## Visual / UX / accessibility baseline

- **Contrast:** `--faint` (#898781) on cards is 3.5:1 and fails WCAG AA (4.5:1).
  It's used for every timestamp and meta line. The amber badge is 4.31:1, just under.
- **No visible focus styles, no `prefers-reduced-motion`** (the pulse dot animates
  forever), **no dark mode**, filter chips lack `aria-pressed`, status is shown by
  colour plus emoji only.
- **Phone layout is 8,556 px tall.** The forecast stacks one per row, cameras one
  per row, and long incident text runs in full.
- **Map:** fixed at zoom 10 around Neepawa, so most of the 18 markers (fires up to
  200 km, cameras up to 120 km) are off-screen. There's no legend.
- **Hierarchy:** the "why" behind the overall status isn't shown anywhere; the
  four tiles repeat counts that the incident list already shows.

## DOM IDs that must survive (consumed by js/main.js)

`year, statusCards, cityName, overallStatus, statusText, lastUpdate,
incidentList, weatherCard, alertBannerWrap, alertBanner, conditionsList,
conditionsUpdated, cameraGrid, camerasSection, hazardCards, staleBannerWrap,
staleBanner, map`, plus the `.nav-toggle`, `.nav-links`, `.chip[data-filter]`
and `.weather-footer` selectors.
