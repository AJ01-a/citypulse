// ----- Configuration -----
// Edit these for your city.
const CITY_CONFIG = {
  name: "Neepawa, Manitoba",
  center: [50.2289, -99.4661],
  zoom: 14,
};

const TYPE_META = {
  power:    { icon: "⚡",  label: "Power",    color: "#dc2626" },
  water:    { icon: "💧", label: "Water",    color: "#2563eb" },
  internet: { icon: "📡", label: "Internet", color: "#7c3aed" },
  road:     { icon: "🚧", label: "Road",     color: "#ea580c" },
  weather:  { icon: "🌩", label: "Weather",  color: "#0891b2" },
};

const REPORTS_URL = '/api/reports';
const WEATHER_URL = '/api/weather';

// ----- Backend calls -----
async function loadReports() {
  try {
    const res = await fetch(REPORTS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch (e) {
    console.warn('loadReports failed, returning empty list:', e);
    return [];
  }
}

async function addReport(report) {
  const res = await fetch(REPORTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || ('Submit failed: ' + res.status));
  }
  return res.json();
}

async function loadWeather() {
  try {
    const res = await fetch(WEATHER_URL);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    return await res.json();
  } catch (e) {
    console.warn('loadWeather failed:', e);
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
  const counts = { power: 0, water: 0, internet: 0, road: 0, weather: 0 };
  let worst = "ok";
  for (const r of reports) {
    counts[r.type] = (counts[r.type] || 0) + 1;
    if (r.severity === "major") worst = "bad";
    else if (r.severity === "moderate" && worst !== "bad") worst = "warn";
  }
  return { counts, worst, total: reports.length };
}
