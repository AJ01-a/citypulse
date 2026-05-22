import { getStore } from "@netlify/blobs";

const LAT = 50.2289;
const LNG = -99.4661;
const TZ  = "America/Winnipeg";

const URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${LAT}&longitude=${LNG}` +
  `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day` +
  `&hourly=temperature_2m,precipitation_probability,weather_code` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max` +
  `&timezone=${encodeURIComponent(TZ)}` +
  `&forecast_days=4`;

export default async () => {
  try {
    const res = await fetch(URL, { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      console.error("open-meteo fetch failed:", res.status);
      return new Response(`upstream ${res.status}`, { status: 502 });
    }
    const data = await res.json();

    const cached = {
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

    const store = getStore("citypulse-weather");
    await store.set("current", JSON.stringify(cached));
    return new Response(JSON.stringify({ ok: true, fetchedAt: cached.fetchedAt }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("poll-weather error:", err);
    return new Response("error: " + err.message, { status: 500 });
  }
};

export const config = {
  schedule: "*/30 * * * *"
};
