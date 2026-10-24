// ----- Configuration -----
const CITY_CONFIG = {
  name: "Neepawa, Manitoba",
  center: [50.2289, -99.4661],
  zoom: 10,
};

const TYPE_META = {
  road:    { icon: "🚧", label: "Road",    color: "#eb6834" },
  weather: { icon: "🌩", label: "Weather", color: "#2a78d6" },
};

// Driving-condition levels from data/roads.json (see scripts/fetch-data.mjs).
const CONDITION_META = {
  good:    { label: "Good driving",   badge: "Good",     cls: "ok" },
  fair:    { label: "Use caution",    badge: "Caution",  cls: "warn" },
  poor:    { label: "Poor — icy/snow", badge: "Poor",    cls: "bad" },
  closed:  { label: "Closed / not recommended", badge: "Closed", cls: "bad" },
  unknown: { label: "No report",      badge: "No report", cls: "muted" },
};

// Static JSON written by GitHub Actions (scripts/fetch-data.mjs).
// Relative paths so the site works at any base path (e.g. user.github.io/citypulse/).
const REPORTS_URL = 'data/incidents.json';
const WEATHER_URL = 'data/weather.json';
const ROADS_URL   = 'data/roads.json';
const HAZARDS_URL = 'data/hazards.json';

// ----- Data loading -----
// The ?t= cache-buster matters: GitHub Pages' CDN caches files for up to
// 10 minutes and ignores the browser's no-store; a unique query string
// forces it to serve the newest deploy.
function fresh(url) {
  return url + '?t=' + Date.now();
}

// Loaders return null when their file can't be loaded — never an empty
// result. "We couldn't check" must stay distinguishable from "nothing to
// report", or a failed load renders as "All clear".
async function loadReports() {
  try {
    const res = await fetch(fresh(REPORTS_URL), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.incidents || []);
    return {
      fetchedAt: Array.isArray(data) ? null : (data.fetchedAt ?? null),
      items: list.sort((a, b) => b.createdAt - a.createdAt),
    };
  } catch (e) {
    console.warn('loadReports failed:', e);
    return null;
  }
}

// Open-Meteo is keyless and CORS-enabled, so current conditions can come
// straight from the source on every page view — always real-time, no matter
// how long ago the Actions pipeline last ran. The baked weather.json stays
// the source for hourly data and the fallback if this fails. Daily is
// overlaid too: after midnight the baked daily[0] is yesterday, so a stale
// pipeline would otherwise show yesterday's high/low as "Today".
//
// The overlay records its own timestamp in `currentLiveAt` and must NEVER
// touch `fetchedAt`: `fetchedAt` is the *pipeline* clock that the rest of the
// page uses to decide whether alerts/roads/cameras are stale. Overwriting it
// here made a 24-day-frozen pipeline read "Updated just now" (Aug 2026).
const LIVE_WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${CITY_CONFIG.center[0]}&longitude=${CITY_CONFIG.center[1]}` +
  '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max' +
  '&forecast_days=4&timezone=America%2FWinnipeg';

async function loadWeather() {
  let baked = null;
  try {
    const res = await fetch(fresh(WEATHER_URL), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    baked = await res.json();
  } catch (e) {
    console.warn('loadWeather failed:', e);
    return null;
  }
  try {
    const res = await fetch(LIVE_WEATHER_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const live = await res.json();
      if (live && live.current) {
        baked.current = live.current;
        baked.currentLiveAt = Date.now();
      }
      if (live && live.daily && live.daily.time?.length) baked.daily = live.daily;
    }
  } catch (e) {
    console.warn('live weather overlay failed, using baked data:', e);
  }
  return baked;
}

// Canadian AQHI from pollutant concentrations (instantaneous variant —
// mirrors computeAqhi in scripts/fetch-data.mjs; keep the two in sync).
function computeAqhi(pm25, ozone, no2) {
  const o3ppb = (ozone ?? 0) / 1.963;
  const no2ppb = (no2 ?? 0) / 1.88;
  const raw = (1000 / 10.4) * (
    (Math.exp(0.000537 * o3ppb) - 1) +
    (Math.exp(0.000871 * no2ppb) - 1) +
    (Math.exp(0.000487 * (pm25 ?? 0)) - 1)
  );
  return Math.max(1, Math.round(raw));
}

function aqhiCategory(aqhi) {
  if (aqhi <= 3) return "Low";
  if (aqhi <= 6) return "Moderate";
  if (aqhi <= 10) return "High";
  return "Very high";
}

// Like the weather overlay: Open-Meteo's air-quality API is keyless and
// CORS-enabled, so smoke conditions are live even between pipeline runs.
const LIVE_AQ_URL =
  'https://air-quality-api.open-meteo.com/v1/air-quality' +
  `?latitude=${CITY_CONFIG.center[0]}&longitude=${CITY_CONFIG.center[1]}` +
  '&current=pm2_5,pm10,ozone,nitrogen_dioxide,us_aqi&timezone=America%2FWinnipeg';

async function loadHazards() {
  let baked = { airQuality: null, wildfires: null, river: null };
  try {
    const res = await fetch(fresh(HAZARDS_URL), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    baked = await res.json();
  } catch (e) {
    console.warn('loadHazards failed:', e);
  }
  try {
    const res = await fetch(LIVE_AQ_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const live = await res.json();
      const cur = live && live.current;
      if (cur && typeof cur.pm2_5 === 'number') {
        const aqhi = computeAqhi(cur.pm2_5, cur.ozone, cur.nitrogen_dioxide);
        baked.airQuality = {
          fetchedAt: Date.now(),
          observedAt: cur.time ?? null,
          pm25: cur.pm2_5,
          pm10: cur.pm10 ?? null,
          usAqi: cur.us_aqi ?? null,
          aqhi,
          category: aqhiCategory(aqhi),
          live: true,
        };
      }
    }
  } catch (e) {
    console.warn('live air-quality overlay failed, using baked data:', e);
  }
  return baked;
}

async function loadRoads() {
  try {
    const res = await fetch(fresh(ROADS_URL), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    return await res.json();
  } catch (e) {
    console.warn('loadRoads failed:', e);
    return null;
  }
}

// ----- WMO weather code → label + icon -----
// Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
const WMO = {
  0:  { label: "Clear",                 day: "☀️", night: "🌙" },
  1:  { label: "Mainly clear",          day: "🌤", night: "🌙" },
  2:  { label: "Partly cloudy",         day: "⛅️", night: "☁️" },
  3:  { label: "Overcast",              day: "☁️", night: "☁️" },
  45: { label: "Fog",                   day: "🌫", night: "🌫" },
  48: { label: "Freezing fog",          day: "🌫", night: "🌫" },
  51: { label: "Light drizzle",         day: "🌦", night: "🌧" },
  53: { label: "Drizzle",               day: "🌦", night: "🌧" },
  55: { label: "Heavy drizzle",         day: "🌧", night: "🌧" },
  56: { label: "Freezing drizzle",      day: "🌧", night: "🌧" },
  57: { label: "Freezing drizzle",      day: "🌧", night: "🌧" },
  61: { label: "Light rain",            day: "🌦", night: "🌧" },
  63: { label: "Rain",                  day: "🌧", night: "🌧" },
  65: { label: "Heavy rain",            day: "🌧", night: "🌧" },
  66: { label: "Freezing rain",         day: "🌧", night: "🌧" },
  67: { label: "Freezing rain",         day: "🌧", night: "🌧" },
  71: { label: "Light snow",            day: "🌨", night: "🌨" },
  73: { label: "Snow",                  day: "🌨", night: "🌨" },
  75: { label: "Heavy snow",            day: "❄️", night: "❄️" },
  77: { label: "Snow grains",           day: "🌨", night: "🌨" },
  80: { label: "Rain showers",          day: "🌦", night: "🌧" },
  81: { label: "Rain showers",          day: "🌧", night: "🌧" },
  82: { label: "Heavy rain showers",    day: "🌧", night: "🌧" },
  85: { label: "Snow showers",          day: "🌨", night: "🌨" },
  86: { label: "Heavy snow showers",    day: "❄️", night: "❄️" },
  95: { label: "Thunderstorm",          day: "⛈", night: "⛈" },
  96: { label: "Thunderstorm w/ hail",  day: "⛈", night: "⛈" },
  99: { label: "Severe thunderstorm",   day: "⛈", night: "⛈" },
};

function wmoMeta(code, isDay = 1) {
  const entry = WMO[code] || { label: "Unknown", day: "❓", night: "❓" };
  return { label: entry.label, icon: isDay ? entry.day : entry.night };
}

// ----- Formatting -----
function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Open-Meteo daily dates are bare "YYYY-MM-DD". new Date() parses those as
// UTC midnight, which west of UTC is the previous evening — every forecast
// card was labelled one day early. Read it as a calendar date instead.
function formatDayShort(iso) {
  if (!iso) return "";
  return new Date(iso + 'T00:00:00Z').toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
}

// Today's calendar date in Neepawa ("YYYY-MM-DD"), regardless of viewer TZ.
function localDateToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Winnipeg' });
}

// The pipeline cuts descriptions at 280 chars, often mid-word. Show that
// honestly with an ellipsis at the last word boundary.
function tidyDescription(s) {
  s = String(s || '');
  if (s.length < 280) return s;
  const cut = s.slice(0, 277);
  return cut.slice(0, cut.lastIndexOf(' ') > 200 ? cut.lastIndexOf(' ') : 277).replace(/[\s,.;:]+$/, '') + '…';
}

// When the pipeline last published anything: the newest timestamp it wrote.
// Mirrors the watchdog's rule. airQuality is excluded because the browser's
// live overlay stamps it with Date.now(), and weather's currentLiveAt is a
// separate field for the same reason (see loadWeather).
function pipelineTimestamp(weather, reports, roads, hazards) {
  const stamps = [
    weather?.fetchedAt, reports?.fetchedAt,
    roads?.camerasFetchedAt, roads?.conditionsFetchedAt,
    hazards?.wildfires?.fetchedAt, hazards?.river?.fetchedAt,
  ].filter(t => typeof t === 'number');
  return stamps.length ? Math.max(...stamps) : null;
}

function summarize(reports) {
  const counts = { road: 0, weather: 0 };
  let worst = "ok";
  for (const r of reports) {
    counts[r.type] = (counts[r.type] || 0) + 1;
    if (r.severity === "major") worst = "bad";
    else if (r.severity === "moderate" && worst !== "bad") worst = "warn";
  }
  return { counts, worst, total: reports.length };
}

// Worst driving-condition level across nearby segments.
function worstConditionLevel(segments) {
  const rank = ["closed", "poor", "fair", "good"];
  for (const level of rank) {
    if (segments.some(s => s.level === level)) return level;
  }
  return "unknown";
}
