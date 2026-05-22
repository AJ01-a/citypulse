import { getStore } from "@netlify/blobs";
import { XMLParser } from "fast-xml-parser";

// Brandon station — closest Environment Canada weather forecast region to Neepawa.
// To use a different EC station, change SITE_CODE (find yours at https://dd.weather.gc.ca/today/citypage_weather/MB/00/).
const SITE_CODE = "s0000492";
const PROV = "MB";
const NEEPAWA = { lat: 50.2289, lng: -99.4661 };

const COMMUNITY_TTL_MS = 24 * 60 * 60 * 1000;
const ALERT_TTL_MS = 12 * 60 * 60 * 1000; // 12h default; warnings re-poll so they auto-refresh

// EC warning type → CityPulse severity
function mapSeverity(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("warning")) return "major";
  if (t.includes("watch")) return "moderate";
  return "minor"; // advisory, statement, special
}

function isExpired(r, now) {
  if (typeof r.expiresAt === "number") return r.expiresAt <= now;
  return (now - r.createdAt) > COMMUNITY_TTL_MS;
}

async function findLatestXmlUrl() {
  const now = new Date();
  // Try current and previous 2 UTC hours
  const hours = [
    now.getUTCHours(),
    (now.getUTCHours() + 23) % 24,
    (now.getUTCHours() + 22) % 24,
  ];
  for (const h of hours) {
    const hh = String(h).padStart(2, "0");
    const dirUrl = `https://dd.weather.gc.ca/today/citypage_weather/${PROV}/${hh}/`;
    let html;
    try {
      const res = await fetch(dirUrl);
      if (!res.ok) continue;
      html = await res.text();
    } catch { continue; }

    const re = new RegExp(`href="(\\d{8}T\\d{6}\\.\\d{3}Z_MSC_CitypageWeather_${SITE_CODE}_en\\.xml)"`, "g");
    const matches = [...html.matchAll(re)].map(m => m[1]);
    if (matches.length === 0) continue;
    // Filenames sort lexicographically by timestamp — pick the most recent
    const latest = matches.sort().pop();
    return dirUrl + latest;
  }
  return null;
}

function extractEvents(warningsNode) {
  // warningsNode may be undefined/null, a single event object, or an object with `event` (object or array).
  if (!warningsNode || typeof warningsNode !== "object") return [];
  let events = warningsNode.event;
  if (!events) return [];
  if (!Array.isArray(events)) events = [events];
  return events;
}

function eventToReport(ev) {
  // Common attribute access: fast-xml-parser puts attributes under "@_" prefix.
  const type        = ev["@_type"]        || ev.type        || "";
  const priority    = ev["@_priority"]    || ev.priority    || "";
  const description = ev["@_description"] || ev.description || "";
  // The headline text — try a few common shapes
  const headline = description || ev.headline || "Weather alert";
  // Detailed text
  let text = "";
  if (typeof ev.text === "string") text = ev.text;
  else if (Array.isArray(ev.text)) text = ev.text.join(" ");
  else if (ev["#text"]) text = String(ev["#text"]);
  // Issued time (use first dateTime if present)
  let issued = "";
  const dt = Array.isArray(ev.dateTime) ? ev.dateTime[0] : ev.dateTime;
  if (dt && dt.timeStamp) issued = String(dt.timeStamp);

  const severity = mapSeverity(type) === "minor" && priority === "urgent" ? "moderate" : mapSeverity(type);

  const externalId = `ec:${headline}:${issued}`;
  const desc = (text || headline).replace(/\s+/g, " ").trim().slice(0, 280);

  return {
    type: "weather",
    severity,
    area: "Westman / Parkland region",
    description: desc || headline,
    lat: NEEPAWA.lat,
    lng: NEEPAWA.lng,
    source: "ec-alerts",
    verified: true,
    externalId,
  };
}

export default async () => {
  try {
    const xmlUrl = await findLatestXmlUrl();
    if (!xmlUrl) {
      console.warn("poll-alerts: no XML file found in recent hours");
      return new Response(JSON.stringify({ ok: false, reason: "no-xml-found" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const xmlRes = await fetch(xmlUrl);
    if (!xmlRes.ok) {
      return new Response(`upstream ${xmlRes.status}`, { status: 502 });
    }
    const xml = await xmlRes.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
    });
    const doc = parser.parse(xml);
    const events = extractEvents(doc?.siteData?.warnings);

    const reportsStore = getStore("citypulse-reports");
    const all = (await reportsStore.get("all", { type: "json" })) || [];
    const now = Date.now();
    const fresh = all.filter(r => !isExpired(r, now));
    const existingIds = new Set(fresh.map(r => r.externalId).filter(Boolean));

    const newReports = [];
    for (const ev of events) {
      const r = eventToReport(ev);
      if (existingIds.has(r.externalId)) continue;
      newReports.push({
        id: "ec-" + now + "-" + Math.random().toString(36).slice(2, 7),
        createdAt: now,
        expiresAt: now + ALERT_TTL_MS,
        ...r,
      });
    }

    const next = [...newReports, ...fresh].slice(0, 500);
    await reportsStore.set("all", JSON.stringify(next));

    return new Response(JSON.stringify({
      ok: true,
      fetched: xmlUrl,
      foundEvents: events.length,
      newAlerts: newReports.length,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("poll-alerts error:", err);
    return new Response("error: " + err.message, { status: 500 });
  }
};

export const config = {
  schedule: "*/15 * * * *"
};
