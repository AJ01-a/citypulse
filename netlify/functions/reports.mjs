import { getStore } from "@netlify/blobs";

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTS = 500;
const MAX_BODY = 1024;
const VALID_TYPES = new Set(["power", "water", "internet", "road"]);
const VALID_SEV   = new Set(["minor", "moderate", "major"]);

export default async (req) => {
  const store = getStore("citypulse-reports");

  if (req.method === "GET") {
    const all = (await store.get("all", { type: "json" })) || [];
    const cutoff = Date.now() - TTL_MS;
    const fresh = all.filter(r => r.createdAt > cutoff);
    return Response.json(fresh, {
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_BODY) {
      return new Response("Payload too large", { status: 413 });
    }

    let body;
    try { body = JSON.parse(text); }
    catch { return new Response("Bad JSON", { status: 400 }); }

    if (!VALID_TYPES.has(body.type)) {
      return new Response("Invalid type", { status: 400 });
    }
    if (!VALID_SEV.has(body.severity)) {
      return new Response("Invalid severity", { status: 400 });
    }
    if (typeof body.area !== "string" || body.area.length < 2 || body.area.length > 80) {
      return new Response("Invalid area", { status: 400 });
    }
    if (typeof body.description !== "string" || body.description.length < 5 || body.description.length > 280) {
      return new Response("Invalid description", { status: 400 });
    }

    const hasCoords = Number.isFinite(body.lat) && Number.isFinite(body.lng)
      && body.lat >= -90 && body.lat <= 90 && body.lng >= -180 && body.lng <= 180;

    const report = {
      id: "r-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
      type: body.type,
      severity: body.severity,
      area: body.area.trim(),
      description: body.description.trim(),
      ...(hasCoords ? { lat: body.lat, lng: body.lng } : {})
    };

    const all = (await store.get("all", { type: "json" })) || [];
    const cutoff = Date.now() - TTL_MS;
    const next = [report, ...all.filter(r => r.createdAt > cutoff)].slice(0, MAX_REPORTS);
    await store.set("all", JSON.stringify(next));

    return Response.json(report, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/reports" };
