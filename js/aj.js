// AJ — CityPulse's navigation assistant.
//
// Runs entirely in the browser: no API, no key, nothing typed here leaves
// the page. Questions are matched to a small set of intents by keywords;
// answers come only from window.citypulseSnapshot (written by js/main.js
// after every render) and the static directory in js/content.js. If the
// data isn't loaded, AJ says so — it never fills gaps with guesses.
//
// All output is built with textContent, never innerHTML: feed text
// (alert descriptions, road names) is untrusted.
(() => {
  if (document.getElementById('aj')) return;
  const onDashboard = !!document.getElementById('statusCards');
  const MB511 = 'https://www.manitoba511.ca/';
  const EC = 'https://weather.gc.ca/en/location/index.html?coords=50.229,-99.466';

  // ---------- small helpers ----------
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const kid of kids) if (kid != null) n.append(kid);
    return n;
  };
  const snap = () => (onDashboard ? window.citypulseSnapshot : null);
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const ago = ts => {
    if (!ts) return 'at an unknown time';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h ${m % 60 ? (m % 60) + ' min ' : ''}ago`;
    return `${Math.floor(h / 24)} days ago`;
  };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const clip = (s, n = 170) => { s = String(s || ''); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };
  const isStale = s => s && s.pipelineTs != null && Date.now() - s.pipelineTs >= s.staleAfterMs;
  const staleNote = s => isStale(s)
    ? `Note: that data is from ${ago(s.pipelineTs)}, which is older than normal — check the official source before relying on it.`
    : null;

  // ---------- actions ----------
  // go: in-page section on the dashboard, or the dashboard section from
  // another page. link: an external page. run: a page control (filter chip,
  // appearance menu) clicked on the visitor's behalf.
  const go = (label, id, then) => ({ label, kind: 'go', id, then });
  const link = (label, url) => ({ label, kind: 'link', url });
  const page = (label, url) => ({ label, kind: 'page', url });

  function runAction(a) {
    if (a.kind === 'link') { window.open(a.url, '_blank', 'noopener'); return; }
    if (a.kind === 'page') { location.href = a.url; return; }
    if (!onDashboard) { location.href = `index.html#${a.id}`; return; }
    const target = document.getElementById(a.id);
    if (!target || target.closest('[hidden]')) { say([{ p: 'That section isn’t showing right now — there’s nothing to display in it.' }]); return; }
    if (a.then) a.then();
    if (window.matchMedia('(max-width: 720px)').matches) close(false);
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const focusable = target.matches('h1, h2, [tabindex]') ? target : target.querySelector('h2[tabindex], h1');
    (focusable || target).focus?.({ preventScroll: true });
  }
  const showWeatherAlerts = () => document.querySelector('.chip[data-filter="weather"]')?.click();
  const unlockMapHint = () => document.getElementById('mapToggle')?.focus({ preventScroll: true });

  // ---------- answers ----------
  // Each returns { parts: [{p: text} | {list: [text]}], actions: [] }.
  const notLoaded = what => ({
    parts: [{ p: `I can’t see ${what} right now — it didn’t load on this page, so I won’t guess.` }],
  });
  const fromDashboard = (what, id) => ({
    parts: [{ p: `${what} lives on the dashboard. I can take you there.` }],
    actions: [go(`Open ${what.toLowerCase()}`, id)],
  });

  function weatherLabel(code, isDay) {
    return typeof wmoMeta === 'function' ? wmoMeta(code, isDay).label.toLowerCase() : null;
  }

  const ANSWERS = {
    weather() {
      if (!onDashboard) return fromDashboard('Current weather', 'today');
      const s = snap();
      if (!s) return notLoaded('the weather yet (still loading)');
      const w = s.weather;
      if (!w || !w.current) return { ...notLoaded('the weather'), actions: [link('Environment Canada forecast ↗', EC)] };
      const c = w.current;
      const lbl = weatherLabel(c.weather_code, c.is_day);
      const days = w.daily?.time || [];
      const t = Math.max(0, days.findIndex(d => d >= localDateToday()));
      const hi = num(w.daily?.temperature_2m_max?.[t]), lo = num(w.daily?.temperature_2m_min?.[t]);
      const pop = num(w.daily?.precipitation_probability_max?.[t]);
      const parts = [{ p: `Right now in Neepawa it’s ${Math.round(c.temperature_2m)}°C${lbl ? ' and ' + lbl : ''}, feeling like ${Math.round(c.apparent_temperature)}°. Wind ${Math.round(c.wind_speed_10m)} km/h${num(c.wind_gusts_10m) ? `, gusting to ${Math.round(c.wind_gusts_10m)}` : ''}.` }];
      if (hi != null && lo != null) parts.push({ p: `Today: high ${Math.round(hi)}°, low ${Math.round(lo)}°${pop != null ? `, ${pop}% chance of precipitation` : ''}.` });
      parts.push({ p: w.currentLiveAt
        ? `Source: Open-Meteo, checked live ${ago(w.currentLiveAt)}.`
        : `Source: the last automatic update (${ago(w.fetchedAt)}). The live weather check didn’t respond.` });
      const alerts = (s.reports?.items || []).filter(r => r.source === 'ec-alerts');
      if (alerts.length) parts.push({ p: `There ${alerts.length === 1 ? 'is 1 Environment Canada alert' : `are ${alerts.length} Environment Canada alerts`} in effect — ask me about alerts.` });
      return { parts, actions: [go('Go to weather', 'today'), link('Official forecast ↗', EC)] };
    },

    forecast() {
      if (!onDashboard) return fromDashboard('The forecast', 'today');
      const s = snap();
      if (!s) return notLoaded('the forecast yet (still loading)');
      const d = s.weather?.daily;
      if (!d?.time?.length) return { ...notLoaded('the forecast'), actions: [link('Environment Canada forecast ↗', EC)] };
      const t = Math.max(0, d.time.findIndex(x => x >= localDateToday()));
      const rows = d.time.slice(t + 1, t + 4).map((day, k) => {
        const i = t + 1 + k;
        const lbl = weatherLabel(d.weather_code?.[i], 1);
        const pop = num(d.precipitation_probability_max?.[i]);
        return `${formatDayShort(day)}: ${lbl ? lbl + ', ' : ''}${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}°${pop != null ? `, ${pop}% precipitation` : ''}`;
      });
      if (!rows.length) return { ...notLoaded('any upcoming days in the forecast'), actions: [link('Environment Canada forecast ↗', EC)] };
      return {
        parts: [{ p: 'Next few days (Open-Meteo model forecast):' }, { list: rows },
          { p: 'For official wording and warnings, Environment Canada is the authority.' }],
        actions: [go('Go to forecast', 'today'), link('Official forecast ↗', EC)],
      };
    },

    alerts() {
      if (!onDashboard) return fromDashboard('Weather alerts', 'travel');
      const s = snap();
      if (!s) return notLoaded('alerts yet (still loading)');
      if (!s.reports) return { ...notLoaded('Environment Canada alerts'), actions: [link('Environment Canada alerts ↗', EC)] };
      const ec = s.reports.items.filter(r => r.type === 'weather');
      const parts = [];
      if (!ec.length) parts.push({ p: `No Environment Canada alerts for the Brandon region (which covers Neepawa) in the latest update, ${ago(s.reports.fetchedAt)}.` });
      else {
        parts.push({ p: `${plural(ec.length, 'weather alert')} in effect (updated ${ago(s.reports.fetchedAt)}):` });
        parts.push({ list: ec.slice(0, 3).map(r => clip(r.description)) });
      }
      const n = staleNote(s); if (n) parts.push({ p: n });
      return {
        parts,
        actions: [ec.length ? go('Show weather alerts', 'travel', showWeatherAlerts) : go('Go to incidents', 'travel'), link('Official alerts ↗', EC)],
      };
    },

    roads() {
      if (!onDashboard) return fromDashboard('Roads & travel', 'travel');
      const s = snap();
      if (!s) return notLoaded('road information yet (still loading)');
      const parts = [];
      if (s.reports) {
        const road = s.reports.items.filter(r => r.type === 'road');
        const major = road.filter(r => r.severity === 'major');
        if (!road.length) parts.push({ p: 'No Manitoba 511 road events within 60 km in the latest update.' });
        else {
          parts.push({ p: `${plural(road.length, 'road event')} within 60 km${major.length ? `, ${major.length} of them major` : ''}:` });
          parts.push({ list: road.slice().sort((a, b) => (a.severity === 'major' ? -1 : 0) - (b.severity === 'major' ? -1 : 0)).slice(0, 3).map(r => `${r.area}: ${clip(r.description, 110)}`) });
        }
      } else parts.push({ p: 'Road events didn’t load, so I can’t say what’s happening on the roads.' });
      if (s.roads) {
        const lvl = worstConditionLevel(s.roads.conditions || []);
        parts.push({ p: lvl === 'unknown'
          ? 'No highway driving-condition reports right now (Manitoba 511 publishes them mainly in winter).'
          : `Worst highway condition reported nearby: ${CONDITION_META[lvl].label}.` });
      } else parts.push({ p: 'Highway driving conditions didn’t load.' });
      parts.push({ p: `Updated ${ago(s.reports?.fetchedAt || s.roads?.conditionsFetchedAt || s.pipelineTs)}. Conditions change fast — check 511 before you go.` });
      const n = staleNote(s); if (n) parts.push({ p: n });
      return { parts, actions: [go('Go to roads & travel', 'travel'), link('Manitoba 511 ↗', MB511)] };
    },

    hazards(q) {
      if (!onDashboard) return fromDashboard('Hazard Watch', 'hazards');
      const s = snap();
      if (!s) return notLoaded('Hazard Watch yet (still loading)');
      const h = s.hazards || {};
      const wantAir = /smoke|air|aqhi|breath/.test(q), wantFire = /fire/.test(q), wantRiver = /river|flood|water|whitemud/.test(q);
      const all = !(wantAir || wantFire || wantRiver);
      const lines = [];
      if (all || wantAir) {
        const aq = h.airQuality;
        lines.push(aq
          ? `Air quality: AQHI ${aq.aqhi > 10 ? '10+' : aq.aqhi} (${aq.category} risk)${num(aq.pm25) != null && aq.pm25 >= 30 ? ', wildfire smoke likely' : ''} — ${aq.live ? 'live estimate' : 'from the last update'}, ${ago(aq.fetchedAt)}.`
          : 'Air quality: no data right now (that is not the same as clear).');
      }
      if (all || wantFire) {
        const wf = h.wildfires;
        lines.push(!wf ? 'Wildfires: no data right now (that is not the same as clear).'
          : wf.nearestKm == null ? `Wildfires: no satellite fire detections within ${wf.radiusKm} km (scan ${ago(wf.fetchedAt)}).`
          : `Wildfires: nearest satellite detection ${wf.nearestKm} km ${wf.nearestDirection}, ${plural((wf.clusters || []).length, 'fire zone')} within ${wf.radiusKm} km (scan ${ago(wf.fetchedAt)}).`);
      }
      if (all || wantRiver) {
        const rv = h.river;
        const t = num(rv?.trend6h);
        lines.push(!rv ? 'Whitemud River: no data right now.'
          : `Whitemud River (gauge near Keyes): ${t == null ? 'no trend available' : t >= 0.15 ? 'rising fast' : t >= 0.03 ? 'rising' : t <= -0.03 ? 'falling' : 'steady'}${t != null ? ` (${t >= 0 ? '+' : ''}${Math.round(t * 100)} cm over 6 h)` : ''}, reading ${ago(rv.observedAt)}.`);
      }
      const parts = [{ list: lines }];
      if (wantFire || all) parts.push({ p: 'Wildfire data is satellite heat detection, not official incident reports.' });
      return { parts, actions: [go('Go to Hazard Watch', 'hazards'), ...(wantFire ? [link('Manitoba wildfire info ↗', 'https://www.gov.mb.ca/wildfire/')] : [])] };
    },

    cameras() {
      if (!onDashboard) return fromDashboard('Highway cameras', 'camerasSection');
      const s = snap();
      if (!s) return notLoaded('the camera list yet (still loading)');
      if (!s.roads) return { ...notLoaded('the camera list'), actions: [link('Manitoba 511 cameras ↗', MB511)] };
      const cams = s.roads.cameras || [];
      if (!cams.length) return { parts: [{ p: 'No working Manitoba 511 cameras within range in the latest update (offline feeds are hidden).' }], actions: [link('Manitoba 511 ↗', MB511)] };
      const near = cams[0];
      return {
        parts: [{ p: `${plural(cams.length, 'highway camera')} nearby. Nearest: ${[near.roadway, near.location].filter(Boolean).join(' — ')}${num(near.distanceKm) != null ? `, ${near.distanceKm} km away` : ''}. Images refresh every minute while the page is open.` }],
        actions: [go('Go to cameras', 'camerasSection')],
      };
    },

    map() {
      if (!onDashboard) return fromDashboard('The map', 'travel');
      return {
        parts: [{ p: 'The map shows road events, weather alerts, cameras, wildfire zones and the river gauge. It’s locked so it won’t grab your scrolling — tap a marker for details, or press “Enable map interaction” to pan and zoom.' }],
        actions: [go('Go to the map', 'mapHead', unlockMapHint)],
      };
    },

    freshness() {
      if (!onDashboard) return fromDashboard('Data freshness', 'today');
      const s = snap();
      if (!s) return notLoaded('the data timestamps yet (still loading)');
      const parts = [];
      if (s.pipelineTs == null) parts.push({ p: 'I couldn’t load the automatic update at all, so I can’t say how current alerts, roads and hazards are. Please check Manitoba 511 and Environment Canada directly.' });
      else {
        parts.push({ p: `Alerts, roads, cameras, wildfire and river data come from the automatic update, last published ${ago(s.pipelineTs)}${typeof absoluteTime === 'function' ? ` (${absoluteTime(s.pipelineTs)})` : ''}.` });
        if (isStale(s)) parts.push({ p: 'That’s older than it should be — the update pipeline looks stalled, so treat those parts as possibly out of date.' });
      }
      parts.push({ p: s.live.weather && s.live.air ? 'Current weather and air quality were fetched live by your browser.'
        : s.live.weather ? 'Current weather is live; air quality is from the last update.'
        : s.live.air ? 'Air quality is live; weather is from the last update.'
        : 'The live weather check failed, so weather is from the last update too.' });
      return { parts, actions: [go('See status & freshness', 'today')] };
    },

    status() {
      if (!onDashboard) return fromDashboard('Today’s status', 'today');
      const s = snap();
      if (!s) return notLoaded('the status yet (still loading)');
      const { reasons, unavailable } = s.status;
      const parts = [];
      if (!reasons.length && !unavailable.length) parts.push({ p: 'Nothing is flagged in the data CityPulse has loaded. That isn’t a guarantee — conditions change quickly.' });
      if (reasons.length) parts.push({ p: 'What’s flagged right now:' }, { list: reasons.slice(0, 5).map(r => r.text) });
      if (unavailable.length) parts.push({ p: `Unavailable right now: ${unavailable.join(', ')}. I can’t tell you whether those are clear.` });
      const n = staleNote(s); if (n) parts.push({ p: n });
      return { parts, actions: [go('Go to today', 'today')] };
    },

    resources(q) {
      const words = q.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
      const all = typeof RESOURCES !== 'undefined' ? RESOURCES.flatMap(c => c.items.map(r => ({ ...r, cat: c.category }))) : [];
      const hits = all
        .map(r => ({ r, score: words.filter(w => `${r.title} ${r.desc} ${r.org} ${r.cat}`.toLowerCase().includes(w)).length }))
        .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.r);
      const term = words.find(w => all.some(r => `${r.title} ${r.desc}`.toLowerCase().includes(w)));
      if (!hits.length) return {
        parts: [{ p: 'The resource directory has official links for town services, emergencies, weather, roads and hazards.' }],
        actions: [page('Open resources', 'resources.html')],
      };
      return {
        parts: [{ p: 'These official links look relevant:' }, { list: hits.map(r => `${r.title} — ${r.org}`) }],
        actions: [...hits.filter(r => r.url.startsWith('https:')).map(r => link(`${r.title} ↗`, r.url)),
          page('Search all resources', `resources.html${term ? '?q=' + encodeURIComponent(term) : ''}`)],
      };
    },

    about() {
      return {
        parts: [{ p: 'CityPulse is an independent, automated dashboard — not an official Town or government service. It republishes Environment Canada, Manitoba 511, Open-Meteo, NRCan and Water Survey of Canada data, and always shows how old it is.' }],
        actions: [page('About CityPulse', 'about.html')],
      };
    },

    emergency() {
      return {
        parts: [{ p: 'If anyone is in danger, call 911 now. CityPulse is informational only and isn’t monitored by anyone.' },
          { p: 'For Town emergency notifications, sign up for Neepawa Connect.' }],
        actions: [link('Neepawa Connect ↗', 'https://www.neepawa.ca/connect/'), link('Town emergency services ↗', 'https://www.neepawa.ca/services/emergency-services/')],
      };
    },

    theme() {
      return {
        parts: [{ p: 'Use the Appearance button (the half-filled circle in the header) to choose Light, Dark or Match device.' }],
        actions: document.querySelector('.appearance-btn') ? [{ label: 'Open appearance menu', kind: 'run', run: () => { close(false); document.querySelector('.appearance-btn').click(); } }] : [],
      };
    },

    help() {
      return {
        parts: [{ p: 'I can take you to any part of CityPulse and tell you what its loaded data says. Try asking about the weather, alerts, highways, smoke or fires, the river, cameras, local services, or how old the data is.' },
          { p: 'I only report what this page has loaded, and I’ll say when something is unavailable or out of date.' }],
      };
    },
  };

  // ---------- intent matching ----------
  // [phrase, weight]. Multi-word phrases are matched as substrings, single
  // words as whole words. Highest total wins; ties go to the earlier intent.
  const STOP = new Set(['the', 'and', 'for', 'where', 'what', 'whats', 'how', 'can', 'see', 'show', 'find', 'open', 'are', 'there', 'any', 'near', 'neepawa', 'me', 'is', 'in', 'of', 'to', 'my', 'get', 'with', 'about', 'local', 'services', 'service', 'info', 'information', 'page', 'link', 'links']);
  const INTENTS = [
    ['emergency', [['emergency', 3], ['911', 3], ['ambulance', 3], ['police', 3], ['injured', 3], ['hurt', 2], ['danger', 2], ['gas leak', 3], ['power line', 3],
      ['house fire', 6], ['on fire', 5], ['fire at', 5], ['my house', 3], ['help me', 3], ['crash', 3], ['accident', 3]]],
    ['freshness', [['how old', 4], ['last updated', 4], ['up to date', 3], ['fresh', 3], ['stale', 3], ['outdated', 3], ['updated', 2], ['data age', 4], ['latest data', 3], ['timestamp', 3], ['pipeline', 3], ['when was', 2]]],
    ['forecast', [['forecast', 3], ['tomorrow', 3], ['weekend', 3], ['next few days', 3], ['this week', 3], ['monday', 2], ['tuesday', 2], ['wednesday', 2], ['thursday', 2], ['friday', 2], ['saturday', 2], ['sunday', 2], ['later', 1]]],
    ['alerts', [['alert', 3], ['alerts', 3], ['warning', 3], ['warnings', 3], ['watch', 1], ['advisory', 3], ['statement', 2], ['severe', 2], ['blizzard', 2], ['tornado', 2], ['environment canada', 2]]],
    ['hazards', [['hazard', 3], ['hazards', 3], ['hazard watch', 4], ['smoke', 3], ['air quality', 4], ['aqhi', 4], ['air', 1], ['wildfire', 4], ['wildfires', 4], ['fire', 3], ['fires', 3], ['river', 3], ['flood', 3], ['flooding', 3], ['whitemud', 4], ['water level', 4]]],
    ['cameras', [['camera', 4], ['cameras', 4], ['cam', 3], ['cams', 3], ['webcam', 4], ['live view', 3]]],
    ['map', [['map', 4], ['zoom', 2], ['pan', 1]]],
    ['roads', [['road', 3], ['roads', 3], ['highway', 3], ['highways', 3], ['hwy', 3], ['pth', 3], ['driving', 3], ['drive', 2], ['travel', 2], ['closure', 3], ['closures', 3], ['closed', 2], ['construction', 3], ['incident', 2], ['incidents', 2], ['traffic', 2], ['511', 3], ['icy', 2], ['ice', 1], ['trip', 2], ['conditions', 1]]],
    ['weather', [['weather', 3], ['temperature', 3], ['temp', 2], ['outside', 2], ['cold', 2], ['hot', 2], ['warm', 2], ['wind', 2], ['windy', 2], ['rain', 2], ['snow', 2], ['humidity', 2], ['feels like', 2], ['current', 1], ['now', 1], ['uv', 2], ['sunset', 2], ['sunrise', 2]]],
    ['status', [['status', 3], ['summary', 3], ['overview', 3], ['going on', 3], ['happening', 3], ['anything', 1], ['today', 1], ['safe', 2], ['problems', 2]]],
    ['resources', [['resource', 3], ['resources', 3], ['services', 2], ['service', 2], ['local', 1], ['town', 2], ['garbage', 3], ['recycling', 3], ['water', 1], ['sewer', 3], ['hydro', 3], ['power', 2], ['outage', 3], ['outages', 3], ['health', 3], ['hospital', 3], ['doctor', 3], ['clinic', 3], ['recreation', 3], ['office', 2], ['contact', 2], ['phone', 1], ['snow clearing', 4], ['plow', 3], ['campground', 3], ['tourism', 3], ['events', 2], ['notices', 3], ['transportation', 3], ['connect', 2]]],
    ['about', [['about', 2], ['official', 2], ['who made', 4], ['who runs', 4], ['sources', 2], ['source', 1], ['privacy', 3], ['accurate', 2], ['citypulse', 1]]],
    ['theme', [['dark mode', 4], ['light mode', 4], ['dark', 2], ['theme', 4], ['appearance', 4], ['colours', 2], ['colors', 2]]],
    ['help', [['help', 2], ['what can you do', 4], ['hello', 2], ['hi', 2], ['hey', 2]]],
  ];

  function classify(raw) {
    const q = ' ' + raw.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    let best = null, bestScore = 0;
    for (const [name, kws] of INTENTS) {
      let score = 0;
      for (const [k, w] of kws) if (q.includes(` ${k} `)) score += w;
      if (score > bestScore) { best = name; bestScore = score; }
    }
    return { intent: best, q: q.trim() };
  }

  function answer(text) {
    const { intent, q } = classify(text);
    if (!intent) return {
      parts: [{ p: 'I’m not sure about that one. I only know what CityPulse has loaded — weather, alerts, roads, Hazard Watch, cameras and local links — so I won’t guess.' },
        { p: 'Here’s what I can help with:' }],
      suggest: true,
    };
    return ANSWERS[intent](q);
  }

  // ---------- suggestions ----------
  function suggestions() {
    const s = snap();
    const list = [];
    if (s?.reports?.items.some(r => r.source === 'ec-alerts')) list.push('Show active weather alerts');
    if (isStale(s) || (s && s.pipelineTs == null)) list.push('How old is the data?');
    if (s?.status?.reasons.some(r => r.group === 'hazard' && r.level !== 'info')) list.push('What’s in Hazard Watch?');
    for (const x of ['Show me the latest weather', 'Highway conditions', 'Weather alerts', 'Hazard Watch', 'Highway cameras', 'Local services', 'How old is the data?']) {
      if (list.length >= 6) break;
      if (!list.some(l => l.toLowerCase().includes(x.toLowerCase().split(' ').pop()))) list.push(x);
    }
    return list;
  }

  // ---------- UI ----------
  const root = el('div', { class: 'aj', id: 'aj' });
  const orb = el('button', { class: 'aj-orb', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'ajPanel' },
    el('span', { class: 'sr-only', text: 'Ask AJ, the CityPulse guide' }),
    el('span', { class: 'aj-sphere', 'aria-hidden': 'true' },
      el('span', { class: 'aj-ring r1' }), el('span', { class: 'aj-ring r2' }), el('span', { class: 'aj-core' })));
  const panel = el('section', { class: 'aj-panel', id: 'ajPanel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'ajTitle' });
  panel.hidden = true;
  const closeBtn = el('button', { class: 'aj-close', type: 'button', 'aria-label': 'Close AJ' }, el('span', { 'aria-hidden': 'true', text: '×' }));
  const log = el('div', { class: 'aj-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const chips = el('div', { class: 'aj-suggest', role: 'group', 'aria-label': 'Suggested questions' });
  const input = el('input', { id: 'ajInput', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'Ask about weather, roads, hazards…' });
  const form = el('form', { class: 'aj-form' },
    el('label', { class: 'sr-only', for: 'ajInput', text: 'Ask AJ a question' }), input,
    el('button', { type: 'submit', class: 'aj-send', text: 'Ask' }));
  panel.append(
    el('div', { class: 'aj-head' },
      el('span', { class: 'aj-sphere mini', 'aria-hidden': 'true' }, el('span', { class: 'aj-core' })),
      el('div', {}, el('h2', { id: 'ajTitle', text: 'AJ' }), el('p', { text: 'Your CityPulse guide · answers from this page’s data' })),
      closeBtn),
    log, chips, form);
  root.append(panel, orb);
  document.body.append(root);

  function renderChips() {
    // Fewer chips once a conversation has started, so answers keep the room.
    chips.replaceChildren(...suggestions().slice(0, log.querySelector('.from-me') ? 3 : 6).map(t => {
      const b = el('button', { type: 'button', class: 'aj-chip', text: t });
      b.addEventListener('click', () => ask(t));
      return b;
    }));
  }

  function say(parts, actions = [], from = 'aj') {
    const msg = el('div', { class: `aj-msg from-${from}` });
    for (const part of parts) {
      if (part.p) msg.append(el('p', { text: part.p }));
      if (part.list) msg.append(el('ul', {}, ...part.list.map(t => el('li', { text: t }))));
    }
    if (actions.length) {
      const row = el('div', { class: 'aj-actions' });
      actions.forEach(a => {
        const b = el('button', { type: 'button', class: 'aj-act', text: a.label });
        b.addEventListener('click', () => (a.kind === 'run' ? a.run() : runAction(a)));
        row.append(b);
      });
      msg.append(row);
    }
    log.append(msg);
    // Keep the log short so it never turns into a long chat transcript.
    while (log.children.length > 12) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    return msg;
  }

  function ask(text) {
    text = String(text).trim().slice(0, 120);
    if (!text) return;
    const q = say([{ p: text }], [], 'me');
    const a = answer(text);
    say(a.parts, a.actions || []);
    renderChips();
    // Start the reader at their question, not at the end of a long answer.
    log.scrollTop = q.offsetTop - 8;
  }

  let greeted = false;
  function open() {
    panel.hidden = false;
    root.classList.add('open');
    orb.setAttribute('aria-expanded', 'true');
    if (!greeted) {
      greeted = true;
      say([{ p: onDashboard
        ? 'Hi, I’m AJ. I can take you to any part of CityPulse or tell you what the loaded data says. What do you need?'
        : 'Hi, I’m AJ. I can point you to the right part of CityPulse. Live data lives on the dashboard — ask and I’ll take you there.' }]);
    }
    renderChips();
    input.focus();
  }
  function close(refocus = true) {
    if (panel.hidden) return;
    panel.hidden = true;
    root.classList.remove('open');
    orb.setAttribute('aria-expanded', 'false');
    if (refocus) orb.focus();
  }
  orb.addEventListener('click', () => (panel.hidden ? open() : close()));
  closeBtn.addEventListener('click', () => close());
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    ask(v);
  });
})();
