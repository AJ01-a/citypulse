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

// A hung upstream must never stall the whole run until the job-level kill
// (which would skip the deploy entirely) — cap every request instead.
const FETCH_TIMEOUT_MS = 30_000;

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
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
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

async function deployedJson(name) {
  const base = liveSiteBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/data/${name}?t=${Date.now()}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`could not fetch deployed ${name}:`, err.message);
    return null;
  }
}

async function preserveDeployed(name) {
  const json = await deployedJson(name);
  if (json === null) return;
  await writeFile(new URL(name, DATA_DIR), JSON.stringify(json, null, 1));
  console.log(`preserved currently-deployed data/${name}`);
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
      const res = await fetch(dirUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
  const res = await fetch(xmlUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`EC upstream ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
  const doc = parser.parse(xml);
  let events = doc?.siteData?.warnings?.event;
  if (!events) events = [];
  if (!Array.isArray(events)) events = [events];

  // EC keeps "ended" entries in the warnings block for a while after a
  // warning expires — those must not render as active alerts.
  events = events.filter(ev =>
    !String(ev["@_type"] || ev.type || "").toLowerCase().includes("ended"));

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

// When a camera feed is down, Manitoba 511 still answers HTTP 200 but serves
// a small PNG placeholder ("No live camera feed at this time") instead of a
// live snapshot. Status codes can't tell them apart, so probe the image:
// live snapshots are full-size JPEGs; the placeholder is a small PNG.
const CAMERA_PROBE_TIMEOUT_MS = 8_000;
const CAMERA_PLACEHOLDER_MAX_BYTES = 20_000;

async function isLiveCameraView(url) {
  // Retry once: a transient probe error must not let an offline placeholder
  // slip through (we only fall back to "assume live" if both attempts fail).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(CAMERA_PROBE_TIMEOUT_MS) });
      const type = (res.headers.get("content-type") || "").toLowerCase();
      const len = Number(res.headers.get("content-length") || 0);
      // We only need the headers — release the socket instead of downloading
      // the image, or unread bodies exhaust undici's pool and later probes hang.
      await res.body?.cancel().catch(() => {});
      if (!res.ok) return false;
      return !(type.includes("png") && len > 0 && len < CAMERA_PLACEHOLDER_MAX_BYTES);
    } catch {
      if (attempt === 1) return true; // couldn't verify — don't hide a possibly-live camera
    }
  }
  return true;
}

async function buildCameras() {
  const cams = await fetch511("cameras");
  // Nearest candidates first; probe more than we need so offline feeds can be
  // replaced by the next working camera rather than leaving a dead tile.
  const candidates = cams
    .filter(c => typeof c.Latitude === "number" && typeof c.Longitude === "number" && c.Latitude !== 0)
    .map(c => ({ cam: c, dist: distanceKm(CENTER.lat, CENTER.lng, c.Latitude, c.Longitude) }))
    .filter(x => x.dist <= CAMERAS_RADIUS_KM)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_CAMERAS * 3)
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

  const liveFlags = await Promise.all(candidates.map(c => isLiveCameraView(c.views[0].url)));
  return candidates.filter((_, i) => liveFlags[i]).slice(0, MAX_CAMERAS);
}

// ---------- Hazard Watch: air quality / wildfire smoke (Open-Meteo, no key) ----------

// Canadian AQHI from pollutant concentrations. The official index uses
// 3-hour averages; this is the instantaneous version, computed from the
// latest values. Gases arrive in µg/m³ and the formula needs ppb.
export function computeAqhi(pm25, ozone, no2) {
  const o3ppb = (ozone ?? 0) / 1.963;
  const no2ppb = (no2 ?? 0) / 1.88;
  const raw = (1000 / 10.4) * (
    (Math.exp(0.000537 * o3ppb) - 1) +
    (Math.exp(0.000871 * no2ppb) - 1) +
    (Math.exp(0.000487 * (pm25 ?? 0)) - 1)
  );
  return Math.max(1, Math.round(raw));
}

export function aqhiCategory(aqhi) {
  if (aqhi <= 3) return "Low";
  if (aqhi <= 6) return "Moderate";
  if (aqhi <= 10) return "High";
  return "Very high";
}

async function buildAirQuality() {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${CENTER.lat}&longitude=${CENTER.lng}` +
    `&current=pm2_5,pm10,ozone,nitrogen_dioxide,us_aqi` +
    `&timezone=${encodeURIComponent(TZ)}`;
  const data = await fetchJson(url);
  const cur = data.current || {};
  if (typeof cur.pm2_5 !== "number") throw new Error("air-quality response missing pm2_5");
  const aqhi = computeAqhi(cur.pm2_5, cur.ozone, cur.nitrogen_dioxide);
  return {
    fetchedAt: Date.now(),
    observedAt: cur.time ?? null,
    pm25: cur.pm2_5,
    pm10: cur.pm10 ?? null,
    usAqi: cur.us_aqi ?? null,
    aqhi,
    category: aqhiCategory(aqhi),
  };
}

// ---------- Hazard Watch: wildfire hotspots (NRCan CWFIS, no key) ----------

const FIRE_RADIUS_KM = 200;
const FIRE_CLUSTER_KM = 10;
const CWFIS = "https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots";

function compassFrom(lat, lng) {
  const rad = Math.PI / 180;
  const dLng = (lng - CENTER.lng) * rad;
  const y = Math.sin(dLng) * Math.cos(lat * rad);
  const x = Math.cos(CENTER.lat * rad) * Math.sin(lat * rad) -
            Math.sin(CENTER.lat * rad) * Math.cos(lat * rad) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

async function fetchHotspotCsv(stamp) {
  const res = await fetch(`${CWFIS}/${stamp}.csv`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.text();
}

async function buildWildfires() {
  // CWFIS publishes one continent-wide CSV of satellite fire detections per
  // UTC day. Early in the day today's file is missing or thin, so merge
  // today + yesterday.
  const now = Date.now();
  const stamps = [now, now - 864e5]
    .map(t => new Date(t).toISOString().slice(0, 10).replaceAll("-", ""));
  const texts = (await Promise.all(stamps.map(s => fetchHotspotCsv(s).catch(() => null))))
    .filter(t => t !== null);
  if (texts.length === 0) throw new Error("no CWFIS hotspot files available");

  const points = [];
  for (const text of texts) {
    const lines = text.trim().split("\n");
    const header = lines[0].split(",").map(s => s.trim().toLowerCase());
    const iLat = header.indexOf("lat"), iLng = header.indexOf("lon");
    const iDate = header.indexOf("rep_date"), iFuel = header.indexOf("fuel"), iArea = header.indexOf("estarea");
    if (iLat < 0 || iLng < 0) continue;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const lat = parseFloat(cols[iLat]), lng = parseFloat(cols[iLng]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      // agricultural burns are detected too (fuel "farm") — not wildfires
      if (iFuel >= 0 && String(cols[iFuel]).trim().toLowerCase() === "farm") continue;
      const dist = distanceKm(CENTER.lat, CENTER.lng, lat, lng);
      if (dist > FIRE_RADIUS_KM) continue;
      points.push({
        lat, lng, dist,
        seen: iDate >= 0 ? String(cols[iDate] ?? "").trim() : "",
        areaHa: iArea >= 0 ? parseFloat(cols[iArea]) || 0 : 0,
      });
    }
  }

  // Satellite hotspots arrive as bursts of adjacent pixels — greedily cluster
  // them into distinct fire zones, nearest first.
  points.sort((a, b) => a.dist - b.dist);
  const clusters = [];
  for (const p of points) {
    const c = clusters.find(c => distanceKm(c.lat, c.lng, p.lat, p.lng) <= FIRE_CLUSTER_KM);
    if (c) {
      c.count++;
      c.areaHa = Math.max(c.areaHa, p.areaHa);
      if (p.seen > c.lastSeen) c.lastSeen = p.seen;
    } else if (clusters.length < 20) {
      clusters.push({
        lat: p.lat, lng: p.lng,
        distanceKm: Math.round(p.dist),
        direction: compassFrom(p.lat, p.lng),
        count: 1,
        areaHa: p.areaHa,
        lastSeen: p.seen,
      });
    }
  }
  for (const c of clusters) c.areaHa = Math.round(c.areaHa);

  return {
    fetchedAt: Date.now(),
    radiusKm: FIRE_RADIUS_KM,
    hotspotCount: points.length,
    clusters,
    nearestKm: clusters.length ? clusters[0].distanceKm : null,
    nearestDirection: clusters.length ? clusters[0].direction : null,
  };
}

// ---------- Hazard Watch: Whitemud River gauge (ECCC GeoMet, no key) ----------

// 05LL005 is the nearest active gauge to Neepawa on the Whitemud River
// (near Keyes, ~26 km downstream). Readings arrive every 5 minutes.
const RIVER_STATION = "05LL005";
const RIVER_STATION_NAME = "Whitemud River near Keyes";

async function buildRiver() {
  // ~26 hours of 5-minute readings, newest first
  const url =
    `https://api.weather.gc.ca/collections/hydrometric-realtime/items` +
    `?STATION_NUMBER=${RIVER_STATION}&sortby=-DATETIME&limit=320&f=json`;
  const data = await fetchJson(url);
  const readings = (data.features || [])
    .map(f => ({
      t: Date.parse(f.properties?.DATETIME),
      level: f.properties?.LEVEL,
      discharge: f.properties?.DISCHARGE ?? null,
      lat: f.geometry?.coordinates?.[1],
      lng: f.geometry?.coordinates?.[0],
    }))
    .filter(r => Number.isFinite(r.t) && typeof r.level === "number")
    .sort((a, b) => b.t - a.t);
  if (readings.length === 0) throw new Error("no river readings returned");

  const latest = readings[0];
  // Trend: compare against the reading closest to 6 hours before the latest.
  const target = latest.t - 6 * 3600e3;
  const ref = readings.reduce((best, r) =>
    Math.abs(r.t - target) < Math.abs(best.t - target) ? r : best);
  // Hourly downsample (oldest → newest) — enough for a small sparkline.
  const series = [];
  for (let i = readings.length - 1; i >= 0; i--) {
    if (!series.length || readings[i].t - series[series.length - 1].t >= 3540e3) {
      series.push({ t: readings[i].t, level: readings[i].level });
    }
  }
  return {
    fetchedAt: Date.now(),
    stationId: RIVER_STATION,
    stationName: RIVER_STATION_NAME,
    lat: latest.lat ?? null,
    lng: latest.lng ?? null,
    observedAt: latest.t,
    level: latest.level,
    discharge: latest.discharge,
    trend6h: ref === latest ? null : +(latest.level - ref.level).toFixed(3),
    series,
  };
}

// ---------- main ----------

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const failures = [];
  let filesWritten = 0;

  if (!API_KEY) {
    console.warn("MB511_API_KEY not set — skipping 511 events, conditions, cameras");
  }
  const skip = Promise.resolve(null); // fulfilled-with-null = source not attempted

  // All sources are independent — fetch them concurrently so a run
  // takes as long as the slowest source, not the sum of all of them.
  const [weatherR, ecR, eventsR, conditionsR, camerasR, aqR, fireR, riverR] = await Promise.allSettled([
    buildWeather(),
    buildEcAlerts(),
    API_KEY ? build511Events() : skip,
    API_KEY ? buildConditions() : skip,
    API_KEY ? buildCameras() : skip,
    buildAirQuality(),
    buildWildfires(),
    buildRiver(),
  ]);
  const settle = (r, name) => {
    if (r.status === "fulfilled") return r.value;
    failures.push(`${name}: ${r.reason?.message ?? r.reason}`);
    return null;
  };

  // Weather (independent file, written inside buildWeather)
  if (weatherR.status === "fulfilled") {
    filesWritten++;
  } else {
    failures.push("weather: " + weatherR.reason.message);
    await preserveDeployed("weather.json");
  }

  // Incidents: EC alerts + 511 events, one combined snapshot.
  // Only rewrite incidents.json if at least one source succeeded.
  const ecAlerts = settle(ecR, "ec-alerts");
  const roadEvents = settle(eventsR, "511-events");
  if (ecAlerts !== null || roadEvents !== null) {
    const incidents = [...(ecAlerts ?? []), ...(roadEvents ?? [])]
      .sort((a, b) => b.createdAt - a.createdAt);
    await writeData("incidents.json", { fetchedAt: Date.now(), incidents });
    filesWritten++;
  } else {
    await preserveDeployed("incidents.json");
  }

  // Roads: conditions + cameras
  const conditions = settle(conditionsR, "511-conditions");
  const cameras = settle(camerasR, "511-cameras");
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

  // Hazard Watch: air quality + wildfires + river, one combined file.
  // Sections are independent; a failed section keeps its currently-deployed
  // data instead of being nulled out.
  const airQuality = settle(aqR, "air-quality");
  const wildfires = settle(fireR, "wildfires");
  const river = settle(riverR, "river");
  if (airQuality !== null || wildfires !== null || river !== null) {
    const prev = (airQuality === null || wildfires === null || river === null)
      ? await deployedJson("hazards.json") : null;
    await writeData("hazards.json", {
      airQuality: airQuality ?? prev?.airQuality ?? null,
      wildfires: wildfires ?? prev?.wildfires ?? null,
      river: river ?? prev?.river ?? null,
    });
    filesWritten++;
  } else {
    await preserveDeployed("hazards.json");
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
