// Fetches all CityPulse data sources and writes static JSON into data/.
// Runs in GitHub Actions on a schedule (see .github/workflows/deploy.yml).
// The Manitoba 511 key comes from the MB511_API_KEY env var (Actions secret) —
// it is used only here, server-side, and never ships to the browser.
//
// Each source fails soft: if one upstream is down, its previous JSON file is
// left untouched and the rest still update.

import { writeFile, mkdir } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";

const CENTER = { lat: 50.2289, lng: -99.4661 }; // Neepawa
const TZ = "America/Winnipeg";

const EVENTS_RADIUS_KM = 60;
const CONDITIONS_RADIUS_KM = 80;
const CAMERAS_RADIUS_KM = 120;
const MAX_CAMERAS = 8;

const EC_SITE_CODE = "s0000492"; // Brandon — closest EC forecast region
const EC_PROV = "MB";

const MB511 = "https://www.manitoba511.ca/api/v2/get";
const API_KEY = process.env.MB511_API_KEY || "";

const DATA_DIR = new URL("../data/", import.meta.url);

// ---------- helpers ----------

function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const lat1 = aLat * Math.PI / 180;
  const lat2 = bLat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Google encoded polyline decoder. 511 feeds normally use precision 5; if the
// decoded points land outside Manitoba we retry at precision 6.
export function decodePolyline(str, precision = 5) {
  const factor = 10 ** precision;
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    for (const which of ["lat", "lng"]) {
      let shift = 0, result = 0, byte;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < str.length);
      const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (which === "lat") lat += delta; else lng += delta;
    }
    points.push([lat / factor, lng / factor]);
  }
  return points;
}

function inManitoba([lat, lng]) {
  return lat > 48 && lat < 61 && lng > -103 && lng < -88;
}

function polylinePoints(encoded) {
  if (!encoded) return [];
  const raw = Array.isArray(encoded) ? encoded.join("") : String(encoded);
  try {
    let pts = decodePolyline(raw, 5);
    if (pts.length && !inManitoba(pts[0])) pts = decodePolyline(raw, 6);
    return pts.filter(inManitoba);
  } catch {
    return [];
  }
}

function minDistanceKm(points) {
  let min = Infinity;
  const step = Math.max(1, Math.floor(points.length / 50));
  for (let i = 0; i < points.length; i += step) {
    const d = distanceKm(CENTER.lat, CENTER.lng, points[i][0], points[i][1]);
    if (d < min) min = d;
  }
  return min;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`upstream ${res.status} for ${url.split("?")[0]}`);
  return res.json();
}

async function fetch511(endpoint) {
  const data = await fetchJson(`${MB511}/${endpoint}?key=${encodeURIComponent(API_KEY)}&format=json&lang=en`);
  if (!Array.isArray(data)) throw new Error(`unexpected 511 response shape for ${endpoint}`);
  return data;
}

async function writeData(name, obj) {
  await writeFile(new URL(name, DATA_DIR), JSON.stringify(obj, null, 1));
  console.log(`wrote data/${name}`);
}

// When a source fails, don't deploy the stale copy committed in the repo —
// grab the currently-live file from the published site instead, so the site
// never regresses to older data. (In GitHub Actions, GITHUB_REPOSITORY is
// "owner/repo", which maps to https://owner.github.io/repo/.)
function liveSiteBase() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !repo.includes("/")) return null;
  const [owner, name] = repo.split("/");
  return `https://${owner.toLowerCase()}.github.io/${name}`;
}

async function preserveDeployed(name) {
  const base = liveSiteBase();
  if (!base) return;
  try {
    const res = await fetch(`${base}/data/${name}?t=${Date.now()}`);
    if (!res.ok) return;
    const json = await res.json();
    await writeFile(new URL(name, DATA_DIR), JSON.stringify(json, null, 1));
    console.log(`preserved currently-deployed data/${name}`);
  } catch (err) {
    console.warn(`could not preserve deployed ${name}:`, err.message);
  }
}

// ---------- weather (Open-Meteo, no key) ----------

async function buildWeather() {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${CENTER.lat}&longitude=${CENTER.lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max` +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=4`;
  const data = await fetchJson(url);
  await writeData("weather.json", {
    fetchedAt: Date.now(),
    location: { lat: CENTER.lat, lng: CENTER.lng, timezone: TZ },
    current: data.current,
    currentUnits: data.current_units,
    daily: data.daily,
    dailyUnits: data.daily_units,
    hourly: {
      time: data.hourly?.time?.slice(0, 24),
      temperature_2m: data.hourly?.temperature_2m?.slice(0, 24),
      precipitation_probability: data.hourly?.precipitation_probability?.slice(0, 24),
      weather_code: data.hourly?.weather_code?.slice(0, 24),
    },
  });
}

// ---------- Environment Canada alerts (no key) ----------

function ecSeverity(type, priority) {
  const t = (type || "").toLowerCase();
  if (t.includes("warning")) return "major";
  if (t.includes("watch")) return "moderate";
  return priority === "urgent" ? "moderate" : "minor";
}

// timeStamp is YYYYMMDDHHMMSS in UTC
function parseEcTimestamp(ts) {
  const m = String(ts || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

async function findLatestEcXmlUrl() {
  const now = new Date();
  const hours = [now.getUTCHours(), (now.getUTCHours() + 23) % 24, (now.getUTCHours() + 22) % 24];
  for (const h of hours) {
    const hh = String(h).padStart(2, "0");
    const dirUrl = `https://dd.weather.gc.ca/today/citypage_weather/${EC_PROV}/${hh}/`;
    let html;
    try {
      const res = await fetch(dirUrl);
      if (!res.ok) continue;
      html = await res.text();
    } catch { continue; }
    const re = new RegExp(`href="(\\d{8}T\\d{6}\\.\\d{3}Z_MSC_CitypageWeather_${EC_SITE_CODE}_en\\.xml)"`, "g");
    const matches = [...html.matchAll(re)].map(m => m[1]);
    if (matches.length) return dirUrl + matches.sort().pop();
  }
  return null;
}

async function buildEcAlerts() {
  const xmlUrl = await findLatestEcXmlUrl();
  if (!xmlUrl) throw new Error("no EC citypage XML found in recent hours");
  const res = await fetch(xmlUrl);
  if (!res.ok) throw new Error(`EC upstream ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
  const doc = parser.parse(xml);
  let events = doc?.siteData?.warnings?.event;
  if (!events) events = [];
  if (!Array.isArray(events)) events = [events];

  return events.map((ev, i) => {
    const type = ev["@_type"] || ev.type || "";
    const priority = ev["@_priority"] || ev.priority || "";
    const headline = ev["@_description"] || ev.description || ev.headline || "Weather alert";
    let text = "";
    if (typeof ev.text === "string") text = ev.text;
    else if (Array.isArray(ev.text)) text = ev.text.join(" ");
    const dt = Array.isArray(ev.dateTime) ? ev.dateTime[0] : ev.dateTime;
    const issued = parseEcTimestamp(dt?.timeStamp);
    return {
      id: `ec-${i}`,
      type: "weather",
      severity: ecSeverity(type, priority),
      area: "Westman / Parkland region",
      description: (text || headline).replace(/\s+/g, " ").trim().slice(0, 280),
      lat: CENTER.lat,
      lng: CENTER.lng,
      source: "ec-alerts",
      verified: true,
      createdAt: issued || Date.now(),
    };
  });
}

// ---------- Manitoba 511: traffic events ----------

function eventSeverity(ev) {
  if (ev.IsFullClosure) return "major";
  const s = (ev.Severity || "").toLowerCase();
  if (s.includes("major") || s.includes("severe")) return "major";
  if (s.includes("moderate") || s.includes("minor")) return "moderate";
  return "minor";
}

async function build511Events() {
  const events = await fetch511("event");
  return events
    .filter(ev => typeof ev.Latitude === "number" && typeof ev.Longitude === "number" &&
      distanceKm(CENTER.lat, CENTER.lng, ev.Latitude, ev.Longitude) <= EVENTS_RADIUS_KM)
    .map(ev => {
      const desc = (ev.Description || ev.Comment || "Road event").replace(/\s+/g, " ").trim();
      const subtype = ev.EventSubType ? ` (${ev.EventSubType})` : "";
      const updated = typeof ev.LastUpdated === "number" ? ev.LastUpdated * 1000
        : typeof ev.StartDate === "number" ? ev.StartDate * 1000 : Date.now();
      return {
        id: "mb511-" + ev.ID,
        type: "road",
        severity: eventSeverity(ev),
        area: ev.RoadwayName || "Unknown road",
        description: `${desc}${subtype}`.slice(0, 280),
        lat: ev.Latitude,
        lng: ev.Longitude,
        source: "mb-511",
        verified: true,
        createdAt: updated,
      };
    });
}

// ---------- Manitoba 511: road conditions + cameras ----------

export function classifyCondition(text) {
  const t = String(text || "").toLowerCase();
  if (!t || t.includes("no report")) return "unknown";
  if (t.includes("closed") || t.includes("not recommended") || t.includes("impassable")) return "closed";
  if (t.includes("partly")) return "fair";
  if (t.includes("icy") || t.includes("ice") || t.includes("snow covered") || t.includes("compacted")) return "poor";
  if (t.includes("slush") || t.includes("drift") || t.includes("loose snow") || t.includes("wet")) return "fair";
  if (t.includes("bare") || t.includes("dry") || t.includes("normal") || t.includes("good")) return "good";
  return "fair";
}

const NEARBY_KEYWORDS = [
  "neepawa", "minnedosa", "gladstone", "carberry", "brandon", "macgregor",
  "austin", "ste. rose", "ste rose", "mccreary", "eden", "franklin",
  "arden", "plumas", "rivers", "rapid city", "forrest",
];
const NEARBY_HIGHWAYS = new Set(["1", "5", "10", "16", "34", "50", "270", "352", "466"]);

function isNearbyCondition(seg) {
  const pts = polylinePoints(seg.EncodedPolyline);
  if (pts.length) return minDistanceKm(pts) <= CONDITIONS_RADIUS_KM;
  const lat = seg.PrimaryLatitude ?? seg.Latitude;
  const lng = seg.PrimaryLongitude ?? seg.Longitude;
  if (typeof lat === "number" && typeof lng === "number" && lat !== 0) {
    return distanceKm(CENTER.lat, CENTER.lng, lat, lng) <= CONDITIONS_RADIUS_KM;
  }
  const road = String(seg.RoadwayName ?? "").trim();
  const loc = String(seg.LocationDescription ?? seg.AreaName ?? "").toLowerCase();
  if (NEARBY_KEYWORDS.some(k => loc.includes(k))) return true;
  return NEARBY_HIGHWAYS.has(road.replace(/^(pth|ptr|hwy|highway)\s*/i, ""));
}

async function buildConditions() {
  const segments = await fetch511("roadconditions");
  const local = segments.filter(isNearbyCondition).map(seg => {
    const conditions = Array.isArray(seg.Condition)
      ? seg.Condition.map(String)
      : [String(seg.Condition ?? seg.PrimaryCondition ?? "")].filter(Boolean);
    const levels = conditions.map(classifyCondition);
    const level = ["closed", "poor", "fair", "good"].find(l => levels.includes(l)) || "unknown";
    return {
      roadway: String(seg.RoadwayName ?? "Unknown"),
      location: String(seg.LocationDescription ?? seg.AreaName ?? "").slice(0, 160),
      conditions,
      level,
      visibility: seg.Visibility ?? null,
      drifting: seg.Drifting ?? null,
      lastUpdated: typeof seg.LastUpdated === "number" ? seg.LastUpdated * 1000 : null,
    };
  });
  const rank = { closed: 0, poor: 1, fair: 2, good: 3, unknown: 4 };
  local.sort((a, b) => (rank[a.level] - rank[b.level]) ||
    String(a.roadway).localeCompare(String(b.roadway), undefined, { numeric: true }));
  return local.slice(0, 40);
}

async function buildCameras() {
  const cams = await fetch511("cameras");
  return cams
    .filter(c => typeof c.Latitude === "number" && typeof c.Longitude === "number" && c.Latitude !== 0)
    .map(c => ({ cam: c, dist: distanceKm(CENTER.lat, CENTER.lng, c.Latitude, c.Longitude) }))
    .filter(x => x.dist <= CAMERAS_RADIUS_KM)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_CAMERAS)
    .map(({ cam, dist }) => ({
      id: cam.Id,
      roadway: cam.Roadway || "",
      location: cam.Location || "",
      direction: cam.Direction || "",
      lat: cam.Latitude,
      lng: cam.Longitude,
      distanceKm: Math.round(dist),
      views: (cam.Views || [])
        .filter(v => v && v.Url && String(v.Status).toLowerCase() !== "disabled")
        .map(v => ({ id: v.Id, url: v.Url, description: v.Description || "" })),
    }))
    .filter(c => c.views.length > 0);
}

// ---------- main ----------

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const failures = [];
  let filesWritten = 0;

  // Weather (independent file)
  try {
    await buildWeather();
    filesWritten++;
  } catch (err) {
    failures.push("weather: " + err.message);
    await preserveDeployed("weather.json");
  }

  // Incidents: EC alerts + 511 events, one combined snapshot
  let ecAlerts = null, roadEvents = null;
  try { ecAlerts = await buildEcAlerts(); }
  catch (err) { failures.push("ec-alerts: " + err.message); }

  if (API_KEY) {
    try { roadEvents = await build511Events(); }
    catch (err) { failures.push("511-events: " + err.message); }
  } else {
    console.warn("MB511_API_KEY not set — skipping 511 events, conditions, cameras");
  }

  // Only rewrite incidents.json if at least one source succeeded.
  if (ecAlerts !== null || roadEvents !== null) {
    const incidents = [...(ecAlerts ?? []), ...(roadEvents ?? [])]
      .sort((a, b) => b.createdAt - a.createdAt);
    await writeData("incidents.json", { fetchedAt: Date.now(), incidents });
    filesWritten++;
  } else {
    await preserveDeployed("incidents.json");
  }

  // Roads: conditions + cameras
  if (API_KEY) {
    let conditions = null, cameras = null;
    try { conditions = await buildConditions(); }
    catch (err) { failures.push("511-conditions: " + err.message); }
    try { cameras = await buildCameras(); }
    catch (err) { failures.push("511-cameras: " + err.message); }
    if (conditions !== null || cameras !== null) {
      await writeData("roads.json", {
        conditions: conditions ?? [],
        conditionsFetchedAt: conditions !== null ? Date.now() : null,
        cameras: cameras ?? [],
        camerasFetchedAt: cameras !== null ? Date.now() : null,
      });
      filesWritten++;
    } else {
      await preserveDeployed("roads.json");
    }
  } else {
    await preserveDeployed("roads.json");
  }

  if (filesWritten === 0) {
    // Nothing fresh at all — fail the job so the deploy is skipped and the
    // previous (fresher) deployment stays live. A red run is the alarm bell;
    // a green run must always mean "the site now has fresh data".
    console.error("FATAL: every source failed:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  if (failures.length) {
    console.error("Completed with partial failures (deploying what succeeded):\n - " + failures.join("\n - "));
  } else {
    console.log("All sources fetched successfully.");
  }
}

// Allow importing helpers (tests) without running the pipeline.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fetch-data.mjs")) {
  await main();
}
