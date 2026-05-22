// ----- Configuration -----
// Edit these for your city.
const CITY_CONFIG = {
  name: "Neepawa, Manitoba",
  center: [50.2289, -99.4661], // Neepawa town center
  zoom: 14,
};

const TYPE_META = {
  power:    { icon: "⚡", label: "Power",    color: "#dc2626" },
  water:    { icon: "💧", label: "Water",    color: "#2563eb" },
  internet: { icon: "📡", label: "Internet", color: "#7c3aed" },
  road:     { icon: "🚧", label: "Road",     color: "#ea580c" },
};

const API_URL = '/api/reports';

// ----- Backend calls -----
async function loadReports() {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch (e) {
    console.warn('loadReports failed, returning empty list:', e);
    return [];
  }
}

async function addReport(report) {
  const res = await fetch(API_URL, {
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

function summarize(reports) {
  const counts = { power: 0, water: 0, internet: 0, road: 0 };
  let worst = "ok";
  for (const r of reports) {
    counts[r.type] = (counts[r.type] || 0) + 1;
    if (r.severity === "major") worst = "bad";
    else if (r.severity === "moderate" && worst !== "bad") worst = "warn";
  }
  return { counts, worst, total: reports.length };
}
