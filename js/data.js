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

// Driving-condition levels from /api/roads (see poll-conditions.mjs)
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

// ----- Data loading -----
// The ?t= cache-buster matters: GitHub Pages' CDN caches files for up to
// 10 minutes and ignores the browser's no-store; a unique query string
// forces it to serve the newest deploy.
function fresh(url) {
  return url + '?t=' + Date.now();
}

async function loadReports() {
  try {
    const res = await fetch(fresh(REPORTS_URL), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.incidents || []);
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.warn('loadReports failed, returning empty list:', e);
    return [];
  }
}

async function loadWeather() {
  try {
    const res = await fetch(fresh(WEATHER_URL), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    return await res.json();
  } catch (e) {
    console.warn('loadWeather failed:', e);
    return null;
  }
}

async function loadRoads() {
  try {
    const res = await fetch(fresh(ROADS_URL), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    return await res.json();
  } catch (e) {
    console.warn('loadRoads failed:', e);
    return { conditions: [], cameras: [] };
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

function formatDayShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { weekday: 'short' });
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
