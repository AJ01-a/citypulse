// CityPulse scenario tests.
//
// Serves the site read-only and replaces every data source — data/*.json,
// Open-Meteo weather + air quality, Manitoba 511 camera images — with the
// frozen fixtures in tests/fixtures/, so each scenario is deterministic and
// nothing touches production or needs the 511 key. Every scenario runs at a
// desktop and a phone width; screenshots land in tests/output/.
//
//   cd tests && npm install && node run.mjs [name-filter]
//
// Needs a Chromium: set CHROME_PATH, or have one in ~/.cache/ms-playwright
// (`npx playwright install chromium`).
import http from "node:http";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "..");
const OUT = path.join(HERE, "output");
const only = process.argv[2];
const MIN = 60_000, HOUR = 60 * MIN;

async function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(process.env.HOME || "", ".cache/ms-playwright");
  for (const dir of (await readdir(cache).catch(() => [])).filter(d => d.startsWith("chromium-")).sort().reverse()) {
    for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win/chrome.exe"]) {
      const p = path.join(cache, dir, sub);
      if (existsSync(p)) return p;
    }
  }
  return undefined; // let playwright-core try its own default
}

// ---- static server (data/ is never served from disk: it is routed below) ----
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(SITE, p === "/" ? "index.html" : p);
  if (!file.startsWith(SITE)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- fixtures (snapshot of the live site, 2026-10-24) ----
const load = async n => JSON.parse(await readFile(path.join(HERE, "fixtures", n), "utf8"));
const base = {
  weather: await load("weather.json"), incidents: await load("incidents.json"),
  roads: await load("roads.json"), hazards: await load("hazards.json"),
  om: await load("om-live.json"), aq: await load("aq-live.json"),
};
const clone = o => JSON.parse(JSON.stringify(o));
function pipelineData(ageMs = 5 * MIN) {
  const t = Date.now() - ageMs;
  const d = { weather: clone(base.weather), incidents: clone(base.incidents), roads: clone(base.roads), hazards: clone(base.hazards) };
  d.weather.fetchedAt = t;
  d.incidents.fetchedAt = t;
  d.roads.camerasFetchedAt = t;
  for (const k of ["airQuality", "wildfires", "river"]) if (d.hazards[k]) d.hazards[k].fetchedAt = t;
  return d;
}
const with_ = (d, fn) => { fn(d); return d; };
const CAM_IMG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" fill="#7a8a99"/><text x="50%" y="50%" fill="#fff" font-size="20" text-anchor="middle">CAMERA FIXTURE</text></svg>');
const SEVERE = {
  id: "ec-0", type: "weather", severity: "major", area: "Westman / Parkland region",
  description: "Blizzard warning in effect. Widespread blowing snow with near-zero visibility is expected or occurring.",
  lat: 50.2289, lng: -99.4661, source: "ec-alerts", verified: true, createdAt: Date.now() - 20 * MIN,
};

// ---- scenarios ----
// data: per-file override — object = JSON body, number = HTTP status,
// "invalid" = malformed JSON. live: "fail" aborts both Open-Meteo calls.
// cams: 404 makes every camera image fail.
// expect(o, viewport) returns a list of failure messages (empty = pass).
// The fixture hazards contain a wildfire zone 55 km N and only *minor* road
// items, so the overall "caution" comes from the fire, not the roads.
const check = (cond, msg) => (cond ? [] : [msg]);
const notAllClear = o => check(!/all clear/i.test(o.statusText), `status must not say "All clear" when data is missing (got "${o.statusText}")`);

const scenarios = {
  "fresh": {
    data: pipelineData(),
    expect: o => [
      ...check(o.lastUpdate === "5m ago", `lastUpdate should be "5m ago", got "${o.lastUpdate}"`),
      ...check(!o.staleBanner, "stale banner should be hidden"),
      ...check(o.bannerLevel === "warn", `banner should be warn (wildfire 55 km), got ${o.bannerLevel}`),
      ...check(/wildfire/i.test(o.statusText), `status should name the wildfire as the reason, got "${o.statusText}"`),
      ...check(o.cameraCards === 8, `expected 8 camera cards, got ${o.cameraCards}`),
    ],
  },
  "fresh-dark": {
    data: pipelineData(), scheme: "dark",
    expect: o => check(o.bodyBgLum < 0.1, `OS dark preference should give a dark page (body luminance ${o.bodyBgLum})`),
  },
  "stale-5h": {
    data: pipelineData(5 * HOUR),
    expect: o => [
      ...check(o.lastUpdate === "5h ago", `lastUpdate should be "5h ago", got "${o.lastUpdate}"`),
      ...check(/stalled/i.test(o.staleBanner || ""), "stale banner should be shown"),
      ...check(/still live/i.test(o.staleBanner || ""), "live weather worked, so the banner may say it is still live"),
    ],
  },
  "missing-weather-json": {
    data: { ...pipelineData(), weather: 404 },
    expect: o => [
      ...check(/unavailable/i.test(o.weather), "weather card should say unavailable"),
      ...check(o.lastUpdate === "5m ago", `other files are 5m old, so lastUpdate should be "5m ago", got "${o.lastUpdate}"`),
    ],
  },
  "invalid-incidents-json": {
    data: { ...pipelineData(), incidents: "invalid" },
    expect: o => [
      ...check(!/no active incidents/i.test(o.incidents.join(" ")), "a failed incident load must not read as \"No active incidents\""),
      ...check(/no data|unavailable/i.test(o.tiles[0] + o.tiles[1]), `alert/incident tiles should say No data, got ${JSON.stringify(o.tiles.slice(0, 2))}`),
      ...notAllClear(o),
    ],
  },
  "all-data-missing": {
    data: { weather: 404, incidents: 404, roads: 404, hazards: 404 },
    expect: o => [
      ...notAllClear(o),
      ...check(o.lastUpdate !== "just now", `with no data loaded, lastUpdate must not claim "just now"`),
      ...check(!!o.staleBanner, "a banner should explain the data could not be loaded"),
      ...check(o.bannerLevel !== "ok", "banner must not be green when nothing loaded"),
    ],
  },
  "weather-api-down": {
    data: pipelineData(), live: "fail",
    expect: o => check(/5m ago/.test(o.weatherFooter || ""), `weather footer should admit baked data age, got "${o.weatherFooter}"`),
  },
  "weather-api-down+stale": {
    data: pipelineData(5 * HOUR), live: "fail",
    expect: o => [
      ...check(!!o.staleBanner, "stale banner should be shown"),
      ...check(!/still live/i.test(o.staleBanner || ""), "live calls failed, so the banner must not claim weather is still live"),
    ],
  },
  "cameras-offline": {
    data: pipelineData(), cams: 404,
    expect: (o, vp) => vp === "desktop" ? check(o.cameraOffline === 8, `all 8 cameras should show offline, got ${o.cameraOffline}`) : [],
  },
  "no-cameras": {
    data: with_(pipelineData(), d => { d.roads.cameras = []; }),
    expect: o => [
      ...check(o.camerasSection === "hidden", "cameras section should be hidden"),
      ...check(!/live/i.test(o.tiles[3] || ""), `camera tile should not say "Live" with 0 cameras, got "${o.tiles[3]}"`),
    ],
  },
  "hazards-failed": {
    data: with_(pipelineData(), d => { d.hazards = { airQuality: null, wildfires: null, river: null }; }), live: "fail",
    expect: o => [
      ...check(o.hazards.every(h => /no data/i.test(h)), "every hazard card should say No data"),
      ...check(/unavailable/i.test(o.statusText), `status should mention unavailable data, got "${o.statusText}"`),
      ...notAllClear(o),
    ],
  },
  "hazards-json-missing": {
    data: { ...pipelineData(), hazards: 404 }, live: "fail",
    expect: o => [
      ...check(o.hazards.every(h => /no data/i.test(h)), "every hazard card should say No data"),
      ...check(/unavailable/i.test(o.statusText), `status should mention unavailable data, got "${o.statusText}"`),
    ],
  },
  "severe-alert": {
    data: with_(pipelineData(), d => { d.incidents.incidents.unshift(SEVERE); }),
    expect: o => [
      ...check(/blizzard/i.test(o.alertBanner || ""), "red alert banner should show the warning"),
      ...check(o.bannerLevel === "bad", `banner should be bad, got ${o.bannerLevel}`),
    ],
  },
  "empty-incidents": {
    data: with_(pipelineData(), d => { d.incidents.incidents = []; }),
    expect: o => [
      ...check(/no active incidents/i.test(o.incidents.join(" ")), "empty state should be shown"),
      ...check(!/highway/i.test(o.statusText), `caution comes from the wildfire, not highways (got "${o.statusText}")`),
    ],
  },
};

// Invariants for every scenario and viewport.
function common(o, vp) {
  return [
    ...check(o.errors.filter(e => e.startsWith("pageerror")).length === 0, `JS errors: ${o.errors.join(" | ")}`),
    ...check(!o.hScroll, "page scrolls horizontally"),
    ...check(o.missingIds.length === 0, `missing DOM ids: ${o.missingIds.join(", ")}`),
    ...(vp === "mobile" ? check(o.nav?.opened && o.nav?.closed, `mobile nav toggle broken: ${JSON.stringify(o.nav)}`) : []),
  ];
}

const REQUIRED_IDS = ["year", "statusCards", "cityName", "overallStatus", "statusText", "lastUpdate", "incidentList",
  "weatherCard", "alertBannerWrap", "alertBanner", "conditionsList", "conditionsUpdated", "cameraGrid",
  "camerasSection", "hazardCards", "staleBannerWrap", "staleBanner", "map"];

// Poll with page.evaluate instead of page.waitForFunction: the latter can
// fall back to eval(), which the site's CSP (correctly) blocks.
async function waitForStatus(page, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const t = await page.evaluate(() => document.getElementById("statusText")?.textContent).catch(() => null);
    if (t && t !== "Loading…") return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function run(browser, name, sc, vpName, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, timezoneId: "America/Winnipeg", colorScheme: sc.scheme || "light" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  await page.route("**/data/*.json*", route => {
    const key = new URL(route.request().url()).pathname.split("/").pop().replace(".json", "");
    const v = sc.data[key];
    if (typeof v === "number") return route.fulfill({ status: v, body: "not found" });
    if (v === "invalid") return route.fulfill({ status: 200, contentType: "application/json", body: '{"incidents": [ {broken' });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) });
  });
  await page.route("https://api.open-meteo.com/**", r => sc.live === "fail" ? r.abort("failed") : r.fulfill({ json: base.om }));
  await page.route("https://air-quality-api.open-meteo.com/**", r => sc.live === "fail" ? r.abort("failed") : r.fulfill({ json: base.aq }));
  await page.route("https://www.manitoba511.ca/**", r => sc.cams === 404
    ? r.fulfill({ status: 404, body: "" })
    : r.fulfill({ status: 200, contentType: "image/svg+xml", body: CAM_IMG }));
  await page.route("https://*.tile.openstreetmap.org/**", r => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.alloc(0) }));

  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  if (!await waitForStatus(page)) errors.push("pageerror: statusText never left Loading…");
  await page.waitForTimeout(800);
  // Camera images are loading="lazy": bring them into view so they load.
  await page.evaluate(() => document.getElementById("camerasSection")?.scrollIntoView());
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));

  const o = await page.evaluate(ids => {
    const $ = id => document.getElementById(id);
    const txt = el => el ? el.innerText.replace(/\s+/g, " ").trim() : null;
    const banner = $("overallStatus");
    return {
      statusText: txt($("statusText")),
      bannerLevel: ["warn", "bad", "unknown"].find(c => banner.classList.contains(c)) || "ok",
      lastUpdate: txt($("lastUpdate")),
      staleBanner: $("staleBannerWrap").hidden ? null : txt($("staleBanner")),
      alertBanner: $("alertBannerWrap").hidden ? null : txt($("alertBanner")),
      weather: txt($("weatherCard")),
      weatherFooter: txt(document.querySelector(".weather-footer")),
      tiles: [...$("statusCards").children].map(txt),
      hazards: [...$("hazardCards").children].map(txt),
      incidents: [...$("incidentList").children].map(txt),
      camerasSection: $("camerasSection").hidden ? "hidden" : "shown",
      cameraCards: $("cameraGrid").children.length,
      cameraOffline: $("cameraGrid").querySelectorAll(".cam-offline").length,
      hScroll: document.documentElement.scrollWidth > window.innerWidth,
      missingIds: ids.filter(id => !$(id)),
      bodyBgLum: (() => {
        const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
        return +((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toFixed(3);
      })(),
    };
  }, REQUIRED_IDS);

  if (vpName === "mobile") {
    const t = page.locator(".nav-toggle");
    await t.click(); await page.waitForTimeout(350);
    const opened = (await t.getAttribute("aria-expanded")) === "true" && await page.locator(".nav-links a[href='about.html']").isVisible();
    await t.click(); await page.waitForTimeout(350);
    o.nav = { opened, closed: (await t.getAttribute("aria-expanded")) === "false" };
  }
  await page.screenshot({ path: path.join(OUT, `${name}-${vpName}.png`), fullPage: true });
  if (name === "fresh" && vpName === "desktop") {
    // Theme toggle: switches to dark and survives a reload.
    await page.click(".theme-toggle");
    const pressed = await page.getAttribute(".theme-toggle", "aria-pressed");
    await page.reload({ waitUntil: "load" });
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    if (pressed !== "true" || theme !== "dark") errors.push(`pageerror: theme toggle (pressed=${pressed}, after reload data-theme=${theme})`);
    await page.click(".theme-toggle");
    // About page shares the header and scripts.
    const about = await page.goto(BASE + "/about.html", { waitUntil: "load" });
    if (!about.ok() || !(await page.locator("main#main h1").isVisible())) errors.push("pageerror: about page did not render");
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
  }
  if (name === "fresh") {
    await page.reload({ waitUntil: "load" });
    await waitForStatus(page);
    const again = await page.evaluate(() => document.getElementById("statusText").textContent);
    if (again !== o.statusText) errors.push(`pageerror: reload changed status ("${o.statusText}" -> "${again}")`);
  }
  o.errors = errors;
  await ctx.close();
  return o;
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: await findChrome() });
const results = {};
let failed = 0, passed = 0;
for (const [name, sc] of Object.entries(scenarios)) {
  if (only && !name.includes(only)) continue;
  for (const [vpName, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const o = await run(browser, name, sc, vpName, viewport);
    const problems = [...common(o, vpName), ...sc.expect(o, vpName)];
    results[`${name}/${vpName}`] = { ...o, problems };
    if (problems.length) {
      failed++;
      console.log(`FAIL ${name} (${vpName})`);
      for (const p of problems) console.log(`     - ${p}`);
    } else {
      passed++;
      console.log(`pass ${name} (${vpName})`);
    }
  }
}
await browser.close();
server.close();
await writeFile(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
