// ----- Configuration -----
// Edit these for your city.
const CITY_CONFIG = {
  name: "Your City",
  center: [40.7128, -74.0060], // [lat, lng] — replace with your city center
  zoom: 12,
  storageKey: "citypulse.reports.v1",
  reportTTLms: 24 * 60 * 60 * 1000, // 24 hours
};

// ----- Seed data (sample incidents shown on first visit) -----
const SEED_REPORTS = [
  {
    id: "seed-1",
    type: "power",
    severity: "major",
    area: "Downtown",
    description: "Widespread outage affecting ~3 blocks around Main & 5th. Streetlights also out.",
    lat: 40.7138, lng: -74.0040,
    createdAt: Date.now() - 1000 * 60 * 22,
  },
  {
    id: "seed-2",
    type: "water",
    severity: "moderate",
    area: "North End",
    description: "Boil-water advisory issued after a main break on Oak Ave. Crews on scene.",
    lat: 40.7250, lng: -74.0010,
    createdAt: Date.now() - 1000 * 60 * 95,
  },
  {
    id: "seed-3",
    type: "road",
    severity: "minor",
    area: "West Side",
    description: "Tree down across Cedar Lane near the park. Single lane passable.",
    lat: 40.7180, lng: -74.0150,
    createdAt: Date.now() - 1000 * 60 * 15,
  },
  {
    id: "seed-4",
    type: "internet",
    severity: "moderate",
    area: "South District",
    description: "ComCast/Xfinity reporting fiber cut. ETA restore: 6pm.",
    lat: 40.7080, lng: -74.0030,
    createdAt: Date.now() - 1000 * 60 * 45,
  },
];

const TYPE_META = {
  power:    { icon: "⚡", label: "Power",    color: "#dc2626" },
  water:    { icon: "💧", label: "Water",    color: "#2563eb" },
  internet: { icon: "📡", label: "Internet", color: "#7c3aed" },
  road:     { icon: "🚧", label: "Road",     color: "#ea580c" },
};

// ----- Storage helpers -----
function loadReports() {
  const raw = localStorage.getItem(CITY_CONFIG.storageKey);
  let reports;
  if (!raw) {
    reports = SEED_REPORTS.slice();
    saveReports(reports);
  } else {
    try { reports = JSON.parse(raw); } catch { reports = []; }
  }
  // Prune expired
  const cutoff = Date.now() - CITY_CONFIG.reportTTLms;
  reports = reports.filter(r => r.createdAt > cutoff);
  saveReports(reports);
  return reports.sort((a, b) => b.createdAt - a.createdAt);
}

function saveReports(reports) {
  localStorage.setItem(CITY_CONFIG.storageKey, JSON.stringify(reports));
}

function addReport(report) {
  const reports = loadReports();
  reports.unshift({
    id: "r-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    createdAt: Date.now(),
    ...report,
  });
  saveReports(reports);
  return reports;
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
