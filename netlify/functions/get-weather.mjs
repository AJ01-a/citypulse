import { getStore } from "@netlify/blobs";

const LAT = 50.2289;
const LNG = -99.4661;
const TZ  = "America/Winnipeg";
const STALE_MS = 60 * 60 * 1000; // 1h

const LIVE_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${LAT}&longitude=${LNG}` +
  `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day` +
  `&hourly=temperature_2m,precipitation_probability,weather_code` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max` +
  `&timezone=${encodeURIComponent(TZ)}` +
  `&forecast_days=4`;

async function fetchLive() {
  const res = await fetch(LIVE_URL, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("upstream " + res.status);
  const data = await res.json();
  return {
    fetchedAt: Date.now(),
    location: { lat: LAT, lng: LNG, timezone: TZ },
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
  };
}

export default async () => {
  const store = getStore("citypulse-weather");
  let cached = null;
  try {
    cached = await store.get("current", { type: "json" });
  } catch (err) {
    console.warn("get-weather: blob read failed, will fetch live:", err);
  }

  const now = Date.now();
  const isFresh = cached && typeof cached.fetchedAt === "number" && (now - cached.fetchedAt) < STALE_MS;

  if (!isFresh) {
    try {
      cached = await fetchLive();
      await store.set("current", JSON.stringify(cached));
    } catch (err) {
      console.error("get-weather live fallback failed:", err);
      if (!cached) {
        return new Response("Weather unavailable", { status: 503 });
      }
    }
  }

  return new Response(JSON.stringify(cached), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300" // 5min browser cache
    }
  });
};

export const config = { path: "/api/weather" };
