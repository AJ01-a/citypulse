(() => {
  // Best-effort clickjacking guard (GitHub Pages can't send X-Frame-Options).
  if (window.top !== window.self) {
    try { window.top.location = window.self.location; } catch { document.body.hidden = true; }
  }

  // Common: year, nav toggle
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();

  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    const setOpen = open => {
      links.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', () => setOpen(!links.classList.contains('open')));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && links.classList.contains('open')) { setOpen(false); toggle.focus(); }
    });
    links.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
  }

  // Dashboard only
  if (!document.getElementById('statusCards')) return;

  const cityNameEl   = document.getElementById('cityName');
  const banner       = document.getElementById('overallStatus');
  const statusLevel  = document.getElementById('statusLevel');
  const statusText   = document.getElementById('statusText');
  const lastUpdate   = document.getElementById('lastUpdate');
  const pipelineDot  = document.getElementById('pipelineDot');
  const liveDot      = document.getElementById('liveDot');
  const liveStatus   = document.getElementById('liveStatus');
  const cardsRoot    = document.getElementById('statusCards');
  const listRoot     = document.getElementById('incidentList');
  const weatherCard  = document.getElementById('weatherCard');
  const alertWrap    = document.getElementById('alertBannerWrap');
  const alertBanner  = document.getElementById('alertBanner');
  const condRoot     = document.getElementById('conditionsList');
  const condUpdated  = document.getElementById('conditionsUpdated');
  const camRoot      = document.getElementById('cameraGrid');
  const camSection   = document.getElementById('camerasSection');
  const hazardRoot   = document.getElementById('hazardCards');
  const staleWrap    = document.getElementById('staleBannerWrap');
  const staleBanner  = document.getElementById('staleBanner');
  const prepTips     = document.getElementById('prepTips');
  const travelNote   = document.getElementById('travelNote');
  const seasonTeaser = document.getElementById('seasonTeaser');
  const shortcutsEl  = document.getElementById('shortcuts');

  if (cityNameEl) cityNameEl.textContent = CITY_CONFIG.name;

  let activeFilter = 'all';
  let dataTimestamp = null;

  // Everything from a data file or API is untrusted text: always escape it
  // before it goes into innerHTML.
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function capitalize(s) { s = String(s ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const SEVERITIES = ['major', 'moderate', 'minor'];
  const EC_NEEPAWA = 'https://weather.gc.ca/en/location/index.html?coords=50.229,-99.466';
  const MB511_URL = 'https://www.manitoba511.ca/';
  const timeTag = ts => ts ? `<time datetime="${new Date(ts).toISOString()}" title="${escapeHtml(absoluteTime(ts))}">${escapeHtml(relativeTime(ts))}</time>` : '';

  // ----- Weather widget -----
  function renderWeather(w) {
    if (!w || !w.current || !w.daily) {
      weatherCard.innerHTML = `<div class="weather-loading">Weather unavailable right now. <a href="${EC_NEEPAWA}" target="_blank" rel="noopener">Environment Canada forecast for Neepawa ↗</a></div>`;
      return;
    }
    const cur = w.current;
    const meta = wmoMeta(cur.weather_code, cur.is_day);
    // Skip days that are already over in Neepawa (baked data from before
    // midnight still starts at yesterday). Falls back to 0 if nothing matches.
    const days = w.daily.time || [];
    const t = Math.max(0, days.findIndex(d => d >= localDateToday()));
    const todayHi = Math.round(w.daily.temperature_2m_max?.[t]);
    const todayLo = Math.round(w.daily.temperature_2m_min?.[t]);
    const sunrise = formatTime(w.daily.sunrise?.[t]);
    const sunset  = formatTime(w.daily.sunset?.[t]);
    const wind    = Math.round(cur.wind_speed_10m);
    const gust    = Math.round(cur.wind_gusts_10m);
    const feels   = Math.round(cur.apparent_temperature);
    const humid   = Math.round(cur.relative_humidity_2m);
    const uvMax   = num(w.daily.uv_index_max?.[t]);
    const precip  = num(w.daily.precipitation_probability_max?.[t]);

    // Next hours: from the live call when it worked, otherwise the baked
    // forecast — but only hours that haven't passed yet.
    const h = w.hourly || {};
    const nowKey = localHourKey();
    const hours = (h.time || []).map((time, i) => ({ time, i })).filter(x => x.time > nowKey).slice(0, 12);
    const hourly = hours.map(({ time, i }) => {
      const m = wmoMeta(h.weather_code?.[i], 1);
      const pop = num(h.precipitation_probability?.[i]);
      return `
        <div class="hour">
          <span>${escapeHtml(formatTime(time).replace(':00', ''))}</span>
          <span class="h-ico" aria-hidden="true">${m.icon}</span>
          <span class="h-t">${Math.round(h.temperature_2m?.[i])}°</span>
          <span class="h-p">${pop != null && pop >= 10 ? `💧${pop}%` : '&nbsp;'}</span>
        </div>`;
    }).join('');

    const forecast = days.slice(t + 1, t + 4).map((day, i) => {
      const idx = t + 1 + i;
      const m = wmoMeta(w.daily.weather_code[idx], 1);
      const hi = Math.round(w.daily.temperature_2m_max[idx]);
      const lo = Math.round(w.daily.temperature_2m_min[idx]);
      const pop = num(w.daily.precipitation_probability_max[idx]);
      return `
        <div class="forecast-day">
          <span class="dow">${escapeHtml(formatDayShort(day))}</span>
          <span class="ico" aria-hidden="true">${m.icon}</span>
          <span class="sr-only">${escapeHtml(m.label)}</span>
          <span class="hilo"><strong>${hi}°</strong> <span class="lo">${lo}°</span></span>
          ${pop != null ? `<span class="pop">💧${pop}%</span>` : ''}
        </div>`;
    }).join('');

    // Provenance: live browser fetch vs. the last automatic (pipeline) update.
    const prov = w.currentLiveAt
      ? '<span class="prov">Live</span>'
      : '<span class="prov cached">From last automatic update</span>';

    weatherCard.innerHTML = `
      <div class="weather-now">
        <div class="weather-now-main">
          <span class="weather-icon" aria-hidden="true">${meta.icon}</span>
          <div>
            <div class="temp">${Math.round(cur.temperature_2m)}<span>°C</span></div>
            <div class="cond">${escapeHtml(meta.label)}</div>
            <div class="feels">Feels like ${feels}° · ${humid}% humidity</div>
          </div>
        </div>
        <div class="weather-stats">
          <div><span class="lbl">Today</span><span class="val">${todayHi}° / ${todayLo}°</span></div>
          <div><span class="lbl">Wind</span><span class="val">${wind} km/h${gust ? ` · gust ${gust}` : ''}</span></div>
          <div><span class="lbl">Rain</span><span class="val">${precip != null ? precip + '%' : '—'}</span></div>
          <div><span class="lbl">UV</span><span class="val">${uvMax != null ? Math.round(uvMax) : '—'}</span></div>
          <div><span class="lbl">Sunrise</span><span class="val">${escapeHtml(sunrise)}</span></div>
          <div><span class="lbl">Sunset</span><span class="val">${escapeHtml(sunset)}</span></div>
        </div>
      </div>
      ${hourly ? `<div class="hourly" role="list" aria-label="Next hours">${hourly}</div>` : ''}
      <div class="forecast">${forecast}</div>
      <div class="weather-footer">
        <span>${prov}</span>
        <span>Weather data &copy; <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Updated ${timeTag(w.currentLiveAt || w.fetchedAt)}</span>
      </div>
    `;
    weatherCard.querySelectorAll('.hour').forEach(el => el.setAttribute('role', 'listitem'));
  }

  // ----- Alert banner (verified EC alerts) -----
  function renderAlertBanner(reports) {
    const verified = reports.filter(r => r.verified && r.source === 'ec-alerts');
    if (verified.length === 0) {
      alertWrap.hidden = true;
      return;
    }
    alertWrap.hidden = false;
    const top = verified[0];
    alertBanner.innerHTML = `
      <span class="alert-ico" aria-hidden="true">⚠</span>
      <div>
        <strong>${escapeHtml(tidyDescription(top.description))}</strong>
        <span class="alert-meta">Official alert · Environment Canada · ${timeTag(top.createdAt)}${verified.length > 1 ? ` · +${verified.length - 1} more` : ''}
          · <a href="${EC_NEEPAWA}" target="_blank" rel="noopener">Read the official alert ↗</a></span>
      </div>
    `;
  }

  // ----- Road conditions (Manitoba 511) -----
  function renderConditions(roads) {
    if (!condRoot) return;
    if (!roads) {
      condRoot.innerHTML = `
        <li class="empty-state compact error">
          <p>Couldn't load road conditions. Check <a href="${MB511_URL}" target="_blank" rel="noopener">Manitoba 511</a> directly.</p>
        </li>`;
      if (condUpdated) condUpdated.textContent = '';
      return;
    }
    const segments = roads.conditions || [];
    if (segments.length === 0) {
      condRoot.innerHTML = `
        <li class="empty-state compact">
          <p>No road condition reports right now. Manitoba 511 publishes them mainly during winter and severe weather.</p>
        </li>`;
      if (condUpdated) condUpdated.textContent = '';
      return;
    }
    condRoot.innerHTML = segments.map(s => {
      const meta = CONDITION_META[s.level] || CONDITION_META.unknown;
      const extras = [
        s.visibility ? `Visibility: ${escapeHtml(String(s.visibility))}` : '',
        s.drifting && /yes/i.test(String(s.drifting)) ? 'Drifting snow' : '',
      ].filter(Boolean).join(' · ');
      return `
        <li class="condition-row">
          <span class="cond-road">${escapeHtml(s.roadway)}</span>
          <div class="cond-info">
            <p class="cond-loc">${escapeHtml(s.location || '')}</p>
            <p class="cond-detail">${escapeHtml((s.conditions || []).join(', '))}${extras ? ' · ' + extras : ''}</p>
          </div>
          <span class="badge badge-${meta.cls}">${meta.badge}</span>
        </li>`;
    }).join('');
    if (condUpdated) {
      condUpdated.textContent = roads.conditionsFetchedAt
        ? `Manitoba 511 · updated ${relativeTime(roads.conditionsFetchedAt)}` : '';
    }
  }

  // ----- Highway cameras (Manitoba 511) -----
  let camerasKey = null;
  function renderCameras(roads) {
    if (!camRoot || !camSection) return;
    // Only https images from Manitoba 511 (the CSP enforces this too).
    const cams = ((roads && roads.cameras) || [])
      .map(c => ({ ...c, src: safeUrl(c.views?.[0]?.url, ['www.manitoba511.ca']) }))
      .filter(c => c.src);
    if (cams.length === 0) {
      camSection.hidden = true;
      return;
    }
    camSection.hidden = false;
    // Re-render fully when the set of cameras changes (e.g. after a deploy
    // picked up a new/removed camera); otherwise just refresh the images.
    const key = cams.map(c => c.id).join(',');
    if (camerasKey === key) {
      camRoot.querySelectorAll('img[data-src]').forEach(img => {
        img.src = img.dataset.src + (img.dataset.src.includes('?') ? '&' : '?') + 't=' + Date.now();
      });
      return;
    }
    camerasKey = key;
    camRoot.innerHTML = cams.map(cam => {
      const title = [cam.roadway, cam.location].filter(Boolean).join(' — ');
      const dist = num(cam.distanceKm);
      return `
        <figure class="camera-card">
          <div class="camera-img-wrap">
            <img data-src="${escapeHtml(cam.src)}" src="${escapeHtml(cam.src)}" loading="lazy"
                 alt="Highway camera: ${escapeHtml(title)}" />
            <span class="cam-offline-msg">Camera offline<small>Manitoba 511 feed unavailable</small></span>
          </div>
          <figcaption>
            <strong>${escapeHtml(title || 'Highway camera')}</strong>
            <span>${dist != null ? `${dist} km away` : ''}${cam.direction && cam.direction !== 'Unknown' ? ' · ' + escapeHtml(cam.direction) : ''}</span>
          </figcaption>
        </figure>`;
    }).join('');
    // No inline handlers (strict CSP): mark broken feeds via listeners instead.
    camRoot.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => img.closest('.camera-card').classList.add('cam-offline'));
      img.addEventListener('load', () => img.closest('.camera-card').classList.remove('cam-offline'));
    });
  }

  // ----- Hazard Watch (air quality, wildfires, river) -----
  const HAZARD_LINKS = {
    air:   { label: 'About AQHI ↗', url: 'https://www.canada.ca/en/environment-climate-change/services/air-quality-health-index.html' },
    fire:  { label: 'Manitoba wildfire info ↗', url: 'https://www.gov.mb.ca/wildfire/' },
    river: { label: 'Gauge 05LL005 ↗', url: 'https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=05LL005' },
  };

  function renderHazards(h) {
    if (!hazardRoot) return;
    const cards = [];
    const unavailable = (icon, label, link) => ({ icon, label, value: '—', meta: 'No data right now — source didn’t respond. This doesn’t mean all clear.', cls: 'muted', badge: 'No data', link });

    const aq = h.airQuality;
    if (aq) {
      const cls = aq.category === 'Low' ? 'ok' : aq.category === 'Moderate' ? 'warn' : 'bad';
      const pm = num(aq.pm25);
      const smoke = pm != null && pm >= 30 ? ' · wildfire smoke likely' : '';
      const aqhi = num(aq.aqhi);
      cards.push({
        icon: '💨', label: 'Air quality (AQHI)',
        value: `${aqhi != null && aqhi > 10 ? '10+' : escapeHtml(aqhi)} — ${escapeHtml(aq.category)}`,
        meta: `PM2.5 ${pm != null ? Math.round(pm) : '—'} µg/m³${smoke} · ${aq.live ? 'live' : 'automatic update'} · ${timeTag(aq.fetchedAt)}`,
        cls, badge: escapeHtml(aq.category), link: HAZARD_LINKS.air,
      });
    } else {
      cards.push(unavailable('💨', 'Air quality (AQHI)', HAZARD_LINKS.air));
    }

    const wf = h.wildfires;
    if (wf) {
      const near = num(wf.nearestKm);
      const none = near == null;
      const cls = none ? 'ok' : near <= 30 ? 'bad' : near <= 100 ? 'warn' : 'ok';
      const zones = (wf.clusters || []).length;
      cards.push({
        icon: '🔥', label: `Wildfires within ${escapeHtml(wf.radiusKm)} km`,
        value: none ? 'None detected' : `${near} km ${escapeHtml(wf.nearestDirection)}`,
        meta: none
          ? `Satellite scan clear · ${timeTag(wf.fetchedAt)}`
          : `${zones} fire zone${zones === 1 ? '' : 's'} detected by satellite · ${timeTag(wf.fetchedAt)}`,
        cls, badge: none ? 'Clear' : cls === 'bad' ? 'Very close' : cls === 'warn' ? 'Nearby' : 'Distant',
        link: HAZARD_LINKS.fire,
      });
    } else {
      cards.push(unavailable('🔥', 'Wildfires', HAZARD_LINKS.fire));
    }

    const rv = h.river;
    if (rv) {
      const t = num(rv.trend6h);
      const cls = t !== null && t >= 0.4 ? 'bad' : t !== null && t >= 0.15 ? 'warn' : 'ok';
      const word = t === null ? 'No trend' :
        t >= 0.15 ? 'Rising fast' : t >= 0.03 ? 'Rising' : t <= -0.03 ? 'Falling' : 'Steady';
      const arrow = t === null ? '' : t >= 0.03 ? '↑ ' : t <= -0.03 ? '↓ ' : '→ ';
      const bits = [];
      if (num(rv.discharge) != null) bits.push(`Flow ${Math.round(rv.discharge)} m³/s`);
      if (t !== null) bits.push(`${t >= 0 ? '+' : ''}${Math.round(t * 100)} cm over 6 h`);
      bits.push(`${escapeHtml(rv.stationName)} gauge · ${timeTag(rv.observedAt)}`);
      cards.push({
        icon: '🌊', label: 'Whitemud River',
        value: arrow + word,
        meta: bits.join(' · '),
        cls, badge: cls === 'bad' ? 'Flood risk' : cls === 'warn' ? 'Watch' : 'Normal',
        link: HAZARD_LINKS.river,
      });
    } else {
      cards.push(unavailable('🌊', 'Whitemud River', HAZARD_LINKS.river));
    }

    hazardRoot.innerHTML = cards.map(t => `
      <div class="status-card">
        <div class="status-card-head">
          <span class="label"><span class="icon" aria-hidden="true">${t.icon}</span>${t.label}</span>
          <span class="badge badge-${t.cls}">${t.badge}</span>
        </div>
        <div class="count count-text">${t.value}</div>
        <div class="meta">${t.meta}</div>
        <a class="src" href="${t.link.url}" target="_blank" rel="noopener">${t.link.label}</a>
      </div>
    `).join('');
  }

  // ----- Overall status: what's wrong, and why -----
  // Every input contributes a reason with a level ('bad' | 'warn' | 'info'),
  // and every input that failed to load is listed as unavailable. The banner
  // shows the reasons themselves, so the level is never unexplained, and a
  // missing input can never be summarized as "All clear". Thresholds are
  // unchanged from the previous banner logic.
  function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

  function statusReasons(reports, roads, hazards, weather) {
    const reasons = [];
    const unavailable = [];

    if (!reports) {
      unavailable.push('alerts & road incidents');
    } else {
      const items = reports.items;
      const ec = items.filter(r => r.type === 'weather');
      if (ec.some(r => r.severity === 'major')) reasons.push({ level: 'bad', text: 'Weather warning in effect' });
      else if (ec.some(r => r.severity === 'moderate')) reasons.push({ level: 'warn', text: 'Weather watch in effect' });
      else if (ec.length) reasons.push({ level: 'info', text: plural(ec.length, 'weather statement') });
      const road = items.filter(r => r.type === 'road');
      const major = road.filter(r => r.severity === 'major').length;
      const moderate = road.filter(r => r.severity === 'moderate').length;
      const minor = road.length - major - moderate;
      if (major) reasons.push({ level: 'bad', text: plural(major, 'major road event') });
      if (moderate) reasons.push({ level: 'warn', text: plural(moderate, 'road event') + ' to watch' });
      if (minor) reasons.push({ level: 'info', text: plural(minor, 'minor road notice') });
    }

    if (!roads) {
      unavailable.push('road conditions');
    } else {
      const lvl = worstConditionLevel(roads.conditions || []);
      if (lvl === 'closed') reasons.push({ level: 'bad', text: 'Highway closed or travel not recommended' });
      else if (lvl === 'poor') reasons.push({ level: 'bad', text: 'Poor driving conditions' });
      else if (lvl === 'fair') reasons.push({ level: 'warn', text: 'Use caution on area highways' });
    }

    const aq = hazards.airQuality, wf = hazards.wildfires, rv = hazards.river;
    if (!aq && !wf && !rv) {
      unavailable.push('Hazard Watch');
    } else {
      if (!aq) unavailable.push('air quality');
      else if (aq.category === 'High' || aq.category === 'Very high') reasons.push({ level: 'bad', text: `Air quality ${aq.category.toLowerCase()} (AQHI ${aq.aqhi > 10 ? '10+' : aq.aqhi})` });
      else if (aq.category === 'Moderate') reasons.push({ level: 'warn', text: `Air quality moderate (AQHI ${aq.aqhi})` });
      if (!wf) unavailable.push('wildfires');
      else if (wf.nearestKm != null && wf.nearestKm <= 100) {
        reasons.push({ level: wf.nearestKm <= 30 ? 'bad' : 'warn', text: `Wildfire ${wf.nearestKm} km ${wf.nearestDirection}` });
      }
      if (!rv) unavailable.push('river');
      else if (typeof rv.trend6h === 'number' && rv.trend6h >= 0.15) {
        reasons.push({ level: rv.trend6h >= 0.4 ? 'bad' : 'warn', text: rv.trend6h >= 0.4 ? 'Whitemud River rising fast' : 'Whitemud River rising' });
      }
    }

    if (!weather) unavailable.push('weather');

    const rank = { bad: 0, warn: 1, info: 2 };
    reasons.sort((a, b) => rank[a.level] - rank[b.level]);
    let level = reasons.some(r => r.level === 'bad') ? 'bad'
      : reasons.some(r => r.level === 'warn') ? 'warn' : 'ok';
    if (level === 'ok' && unavailable.length) level = 'unknown';
    return { level, reasons, unavailable };
  }

  function statusSentence({ reasons, unavailable }) {
    const parts = reasons.slice(0, 3).map(r => r.text);
    if (reasons.length > 3) parts.push(`+${reasons.length - 3} more`);
    if (unavailable.length) parts.push(`${capitalize(unavailable.join(', '))} unavailable`);
    return parts.length ? parts.join(' · ') : 'All clear';
  }

  // Level = word + symbol + colour, never colour alone.
  const LEVELS = {
    ok:      { sym: '✓', word: 'Normal' },
    warn:    { sym: '▲', word: 'Caution' },
    bad:     { sym: '!', word: 'Severe' },
    unknown: { sym: '?', word: 'Unconfirmed' },
  };

  // ----- Guidance raised by current data (Weather/Hazards → Prepare) -----
  // Each tip states the data that triggered it and links to official advice.
  // Tips are suggestions, never claims that something is safe or unsafe.
  function contextualTips(weather, hazards, reportData) {
    const tips = [];
    const d = weather?.daily;
    if (d?.time?.length) {
      const t0 = Math.max(0, d.time.findIndex(x => x >= localDateToday()));
      const next = d.time.slice(t0, t0 + 3).map((day, k) => ({ day, i: t0 + k, label: k === 0 ? 'today' : formatDayShort(day) }));
      const find = pred => next.find(x => pred(x.i));
      const codes = i => d.weather_code?.[i];
      const freezing = find(i => [56, 57, 66, 67].includes(codes(i)));
      const snow = find(i => [71, 73, 75, 77, 85, 86].includes(codes(i)));
      const storm = find(i => [95, 96, 99].includes(codes(i)));
      const cold = find(i => num(d.temperature_2m_min?.[i]) != null && d.temperature_2m_min[i] <= -25);
      const hot = find(i => num(d.temperature_2m_max?.[i]) != null && d.temperature_2m_max[i] >= 30);
      if (freezing) tips.push({ text: 'Freezing rain makes roads and sidewalks icy — check Manitoba 511 before driving.', why: `Freezing rain in the forecast ${freezing.label}`, url: SOURCES.winter.url });
      if (snow && !freezing) tips.push({ text: 'Snow in the forecast — have your vehicle kit ready and check 511 before travelling.', why: `Snow forecast ${snow.label}`, url: SOURCES.carKit.url });
      if (cold) tips.push({ text: 'Extreme cold — limit time outdoors, dress for the conditions, and check on neighbours.', why: `Low of ${Math.round(d.temperature_2m_min[cold.i])}° forecast ${cold.label}`, url: SOURCES.winter.url });
      if (hot) tips.push({ text: 'Heat — drink water, find shade or air conditioning, never leave anyone in a parked car.', why: `High of ${Math.round(d.temperature_2m_max[hot.i])}° forecast ${hot.label}`, url: SOURCES.heat.url });
      if (storm) tips.push({ text: 'Thunderstorms possible — when thunder roars, go indoors.', why: `Thunderstorms forecast ${storm.label}`, url: SOURCES.storms.url });
    }
    const aq = hazards.airQuality;
    if (aq && aq.category !== 'Low') tips.push({ text: 'Reduce time outdoors if you feel unwell; an N95 helps outdoors in smoke.', why: `Air quality ${aq.category.toLowerCase()} (AQHI ${aq.aqhi})`, url: SOURCES.smoke.url });
    const wf = hazards.wildfires;
    if (wf && wf.nearestKm != null && wf.nearestKm <= 100) tips.push({ text: 'Check Manitoba’s wildfire page for fire bans and evacuation orders.', why: `Satellite fire detection ${wf.nearestKm} km ${wf.nearestDirection}`, url: 'https://www.gov.mb.ca/wildfire/' });
    const rv = hazards.river;
    if (rv && typeof rv.trend6h === 'number' && rv.trend6h >= 0.15) tips.push({ text: 'Follow official flood bulletins and keep gutters and drains clear.', why: `Whitemud River up ${Math.round(rv.trend6h * 100)} cm in 6 h`, url: 'https://www.manitoba.ca/floodinfo/' });
    if (reportData && reportData.items.some(r => r.source === 'ec-alerts' && r.severity !== 'minor')) {
      tips.unshift({ text: 'Read the full Environment Canada alert for what to expect and when.', why: 'Official weather alert in effect', url: EC_NEEPAWA });
    }
    return tips.slice(0, 4);
  }

  function renderTips(tips) {
    if (!prepTips) return;
    if (!tips.length) { prepTips.hidden = true; prepTips.innerHTML = ''; return; }
    prepTips.hidden = false;
    prepTips.innerHTML = `<h2>What this means for you</h2><ul>${tips.map(t => `
      <li><a href="${t.url}" target="_blank" rel="noopener">${escapeHtml(t.text)}</a>
        <span class="why">Because: ${escapeHtml(t.why)}</span></li>`).join('')}</ul>`;
  }

  // ----- Travel note (Weather + roads → Travel) -----
  // Lists the concerns the data actually shows. It never declares a route
  // safe; with nothing flagged it says so and points to 511.
  function renderTravelNote(weather, reportData, roads) {
    if (!travelNote) return;
    const items = [];
    let level = 'info';
    const lift = l => { if (l === 'bad' || (l === 'warn' && level !== 'bad')) level = l; };
    if (reportData) {
      const road = reportData.items.filter(r => r.type === 'road');
      const major = road.filter(r => r.severity === 'major').length;
      if (major) { items.push(plural(major, 'major road event') + ' within 60 km'); lift('bad'); }
      else if (road.length) items.push(plural(road.length, 'road notice') + ' within 60 km (construction, restrictions)');
    } else {
      items.push('Road events couldn’t be loaded'); lift('warn');
    }
    if (roads) {
      const lvl = worstConditionLevel(roads.conditions || []);
      if (lvl === 'closed' || lvl === 'poor') { items.push(`Highway conditions reported: ${CONDITION_META[lvl].label}`); lift('bad'); }
      else if (lvl === 'fair') { items.push('Some highways reported partly covered or slippery'); lift('warn'); }
    } else {
      items.push('Highway conditions couldn’t be loaded'); lift('warn');
    }
    const d = weather?.daily;
    if (d?.time?.length) {
      const t0 = Math.max(0, d.time.findIndex(x => x >= localDateToday()));
      for (let k = 0; k < 2; k++) {
        const i = t0 + k, c = d.weather_code?.[i];
        const when = k === 0 ? 'today' : formatDayShort(d.time[i]);
        if ([56, 57, 66, 67].includes(c)) { items.push(`Freezing rain forecast ${when}`); lift('warn'); }
        else if ([71, 73, 75, 77, 85, 86].includes(c)) { items.push(`Snow forecast ${when}`); lift('warn'); }
        else if ([95, 96, 99].includes(c)) { items.push(`Thunderstorms forecast ${when}`); lift('warn'); }
      }
    }
    travelNote.hidden = false;
    travelNote.className = `travel-note ${level === 'info' ? '' : level}`;
    travelNote.innerHTML = items.length
      ? `<strong>Worth knowing before you go:</strong><ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
         <p class="small muted">Conditions change quickly — <a href="${MB511_URL}" target="_blank" rel="noopener">Manitoba 511</a> has the latest.</p>`
      : `Nothing flagged near Neepawa in the available data. Conditions change quickly — check <a href="${MB511_URL}" target="_blank" rel="noopener">Manitoba 511</a> before longer trips.`;
  }

  // ----- Season teaser + shortcuts (static content, rendered once) -----
  function renderSeason() {
    if (!seasonTeaser || typeof SEASONS === 'undefined') return;
    const s = currentSeason();
    const g = s.groups[0];
    const items = g.items.slice(0, 4).map(it => typeof it === 'string' ? escapeHtml(it) : `<a href="${it.url}" target="_blank" rel="noopener">${escapeHtml(it.text)}</a>`);
    seasonTeaser.innerHTML = `
      <div>
        <p class="season-name"><span class="season-ico" aria-hidden="true">${s.icon}</span>${escapeHtml(s.name)}: ${escapeHtml(s.headline)}</p>
        <p>Watch for: ${s.watch.map(escapeHtml).join(' · ')}</p>
        <p><a href="prepare.html#${s.id}">Open the full ${escapeHtml(s.name.toLowerCase())} checklist →</a></p>
      </div>
      <div>
        <ul>${items.map(i => `<li><span>${i}</span></li>`).join('')}</ul>
        ${g.source ? `<a class="src" href="${g.source.url}" target="_blank" rel="noopener">Source: ${escapeHtml(g.source.label)} ↗</a>` : ''}
      </div>`;
  }

  function renderShortcuts() {
    if (!shortcutsEl || typeof RESOURCES === 'undefined') return;
    const all = RESOURCES.flatMap(c => c.items);
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('citypulse-shortcuts') || '[]'); } catch { saved = []; }
    const mine = (Array.isArray(saved) ? saved : []).map(id => all.find(r => r.id === id)).filter(Boolean);
    const picks = mine.length ? mine
      : ['ec-neepawa', 'neepawa-connect', 'mb511', 'town-notices', 'hydro-outages', 'snow-clearing'].map(id => all.find(r => r.id === id)).filter(Boolean);
    const ext = url => url.startsWith('http');
    shortcutsEl.innerHTML = picks.map(r => `
      <a class="res-link" href="${r.url}"${ext(r.url) ? ' target="_blank" rel="noopener"' : ''}>
        <strong>${escapeHtml(r.title)}</strong><span>${escapeHtml(r.org)}</span>
      </a>`).join('') +
      `<p class="shortcuts-note">${mine.length ? 'Your saved shortcuts.' : 'Popular links.'} Pin your own with ☆ in the <a href="resources.html">resource directory</a> — saved only in this browser.</p>`;
  }

  // ----- Pipeline staleness -----
  // Alerts, road conditions and cameras only change when the GitHub Actions
  // pipeline redeploys. Weather and air quality are overlaid live in the
  // browser, so the page keeps looking alive even when the pipeline is dead —
  // which is exactly how a 24-day outage went unnoticed in Aug 2026.
  //
  // Threshold measured from 98 real deploy gaps (Jul-Aug 2026), NOT from the
  // nominal 6-minute cron: GitHub drops most scheduled firings, so the real
  // cadence is median 97 min, p95 211 min, longest normal gap 215 min (the
  // long ones cluster around 01:00-04:30 UTC, GitHub's most congested window).
  // 4 h clears every normal gap, so this banner means "something is actually
  // wrong" rather than "GitHub is being GitHub". The exact age is always shown
  // in the status line regardless, so nothing is hidden between refreshes.
  const PIPELINE_STALE_MS = 4 * 60 * 60 * 1000;

  // `live` says which parts really came from the browser's live calls this
  // time, so the banner only claims "still live" for what actually is.
  let liveState = { weather: false, air: false };
  const OFFICIAL_LINKS =
    `Check <a href="${MB511_URL}" target="_blank" rel="noopener">Manitoba 511</a> and ` +
    `<a href="${EC_NEEPAWA}" target="_blank" rel="noopener">Environment Canada</a> directly before travelling.`;

  function renderStaleNotice(pipelineTs, live) {
    if (!staleWrap || !staleBanner) return;
    if (pipelineTs === null) {
      staleWrap.hidden = false;
      staleBanner.innerHTML =
        '<span class="stale-ico" aria-hidden="true">⚠</span>' +
        '<div><strong>Couldn’t load the latest alerts, road and hazard data.</strong>' +
        '<span class="stale-meta">This page can’t confirm current conditions right now. ' + OFFICIAL_LINKS + '</span></div>';
      return;
    }
    if (Date.now() - pipelineTs < PIPELINE_STALE_MS) {
      staleWrap.hidden = true;
      return;
    }
    const liveNote =
      live.weather && live.air ? 'Weather and air quality below are still live. ' :
      live.weather ? 'Current weather below is still live. ' :
      live.air ? 'Air quality below is still live. ' : '';
    staleWrap.hidden = false;
    staleBanner.innerHTML =
      '<span class="stale-ico" aria-hidden="true">⏳</span>' +
      '<div><strong>Alerts, road conditions and cameras were last updated ' + escapeHtml(relativeTime(pipelineTs)) +
      ' — the automatic update pipeline looks stalled.</strong>' +
      '<span class="stale-meta">' + liveNote + OFFICIAL_LINKS + '</span></div>';
  }

  function renderFreshness() {
    lastUpdate.textContent = dataTimestamp ? relativeTime(dataTimestamp) : 'unknown';
    lastUpdate.title = dataTimestamp ? absoluteTime(dataTimestamp) : 'No update time available';
    if (pipelineDot) {
      pipelineDot.className = 'fresh-dot' +
        (dataTimestamp === null ? ' none' : Date.now() - dataTimestamp >= PIPELINE_STALE_MS ? ' stale' : '');
    }
    if (liveStatus) {
      liveStatus.textContent =
        liveState.weather && liveState.air ? 'Live from Open-Meteo' :
        liveState.weather ? 'Weather live · air quality from last update' :
        liveState.air ? 'Air quality live · weather from last update' :
        'Live check failed · showing last update';
      if (liveDot) liveDot.className = 'fresh-dot' + (liveState.weather || liveState.air ? ' live' : ' stale');
    }
    renderStaleNotice(dataTimestamp, liveState);
  }

  // ----- Main render -----
  let mapFitted = false;
  async function render() {
    const [reportData, weather, roads, hazards] = await Promise.all([loadReports(), loadWeather(), loadRoads(), loadHazards()]);
    const reports = reportData ? reportData.items : [];
    const summary = summarize(reports);

    renderWeather(weather);
    renderAlertBanner(reports);
    renderConditions(roads);
    renderCameras(roads);
    renderHazards(hazards);
    renderTips(contextualTips(weather, hazards, reportData));
    renderTravelNote(weather, reportData, roads);

    const condLevel = worstConditionLevel((roads && roads.conditions) || []);
    const condMeta = CONDITION_META[condLevel] || CONDITION_META.unknown;

    // Overall banner: worst of incidents + driving conditions + hazards,
    // with the reasons spelled out and unavailable inputs named.
    const status = statusReasons(reportData, roads, hazards, weather);
    banner.classList.remove('warn', 'bad', 'unknown');
    if (status.level !== 'ok') banner.classList.add(status.level);
    if (statusLevel) {
      const L = LEVELS[status.level];
      statusLevel.querySelector('.status-level-text').textContent = `${L.sym} ${L.word}`;
    }
    // aria-live region: only touch it when the text changes, or screen
    // readers re-announce it on every one-minute refresh.
    const sentence = statusSentence(status);
    if (statusText.textContent !== sentence) statusText.textContent = sentence;

    // The pipeline clock: newest timestamp any data file carries. Never the
    // browser-side live overlays (currentLiveAt / live air quality).
    dataTimestamp = pipelineTimestamp(weather, reportData, roads, hazards);
    liveState = { weather: !!weather?.currentLiveAt, air: !!hazards.airQuality?.live };
    renderFreshness();

    // Status tiles. A file that failed to load shows "No data", never "Clear".
    const noData = (icon, label, meta, href) => ({ icon, label, value: '—', meta, cls: 'muted', badge: 'No data', isText: true, href });
    const cams = (roads && roads.cameras) || [];
    const tiles = [
      reportData ? {
        icon: '🌩', label: 'Weather alerts', value: summary.counts.weather || 0,
        meta: summary.counts.weather ? 'Environment Canada' : 'No active alerts',
        cls: summary.counts.weather ? 'warn' : 'ok',
        badge: summary.counts.weather ? 'Active' : 'Clear', href: '#travel',
      } : noData('🌩', 'Weather alerts', 'Couldn’t load alerts', '#travel'),
      reportData ? {
        icon: '🚧', label: 'Road incidents', value: summary.counts.road || 0,
        meta: summary.counts.road ? 'Closures & events within 60 km' : 'No closures within 60 km',
        cls: summary.counts.road >= 3 ? 'bad' : (summary.counts.road ? 'warn' : 'ok'),
        badge: summary.counts.road ? 'Active' : 'Clear', href: '#travel',
      } : noData('🚧', 'Road incidents', 'Couldn’t load road events', '#travel'),
      roads ? {
        icon: '🛣', label: 'Driving conditions', value: condMeta.badge,
        meta: (roads.conditions || []).length
          ? `${roads.conditions.length} highway segment${roads.conditions.length === 1 ? '' : 's'} reporting`
          : 'Seasonal — reported in winter',
        cls: condMeta.cls === 'muted' ? 'ok' : condMeta.cls,
        badge: condMeta.badge, isText: true, href: '#conditionsList',
      } : noData('🛣', 'Driving conditions', 'Couldn’t load road conditions', '#conditionsList'),
      roads ? {
        icon: '📷', label: 'Highway cameras', value: cams.length,
        meta: cams.length ? 'Live views nearby' : 'None in range',
        cls: cams.length ? 'ok' : 'muted', badge: cams.length ? 'Live' : 'None',
        href: cams.length ? '#camerasSection' : '#travel',
      } : noData('📷', 'Highway cameras', 'Couldn’t load cameras', '#travel'),
    ];
    cardsRoot.innerHTML = tiles.map(t => `
      <a class="status-card" href="${t.href}">
        <div class="status-card-head">
          <span class="label"><span class="icon" aria-hidden="true">${t.icon}</span>${t.label}</span>
          <span class="badge badge-${t.cls}">${t.badge}</span>
        </div>
        <div class="count${t.isText ? ' count-text' : ''}">${t.value}</div>
        <div class="meta">${t.meta}</div>
      </a>
    `).join('');

    // Incidents list (filtered)
    const filtered = activeFilter === 'all' ? reports : reports.filter(r => r.type === activeFilter);
    if (!reportData) {
      listRoot.innerHTML = `
        <li class="empty-state error">
          <p>Couldn't load alerts and road incidents. Check
          <a href="${MB511_URL}" target="_blank" rel="noopener">Manitoba 511</a> and
          <a href="${EC_NEEPAWA}" target="_blank" rel="noopener">Environment Canada</a> directly.</p>
        </li>`;
    } else if (filtered.length === 0) {
      listRoot.innerHTML = `
        <li class="empty-state">
          <div class="big" aria-hidden="true">✓</div>
          <p>No active ${activeFilter === 'all' ? 'incidents' : activeFilter + ' incidents'} right now.</p>
        </li>`;
    } else {
      listRoot.innerHTML = filtered.map(r => {
        const meta = TYPE_META[r.type] || TYPE_META.weather;
        const sev = SEVERITIES.includes(r.severity) ? r.severity : 'minor';
        const srcLabel = r.source === 'mb-511' ? 'Manitoba 511' : 'Environment Canada';
        const desc = tidyDescription(r.description);
        const long = desc.length > 170;
        return `
          <li class="incident" data-sev="${sev}">
            <div class="icon-wrap" aria-hidden="true">${meta.icon}</div>
            <div class="info">
              <h3>${escapeHtml(r.area)} <span class="src-badge verified">✓ ${srcLabel}</span></h3>
              <p class="desc${long ? ' clamped' : ''}">${escapeHtml(desc)}</p>
              ${long ? '<button type="button" class="more" aria-expanded="false">Show more</button>' : ''}
              <div class="meta">
                <span>${capitalize(sev)}</span>
                <span>${meta.label}</span>
              </div>
            </div>
            <span class="age">${timeTag(r.createdAt)}</span>
          </li>`;
      }).join('');
    }

    renderMap(filtered, cams, hazards);
  }

  // "Show more" on long incident descriptions (delegated: list re-renders).
  listRoot.addEventListener('click', e => {
    const btn = e.target.closest('.more');
    if (!btn) return;
    const desc = btn.previousElementSibling;
    const open = desc.classList.toggle('clamped') === false;
    btn.textContent = open ? 'Show less' : 'Show more';
    btn.setAttribute('aria-expanded', String(open));
  });

  // Filters
  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      activeFilter = btn.dataset.filter;
      mapFitted = false;
      render();
    });
  });

  // Map
  let map, layerGroup;
  function ensureMap() {
    if (map) return;
    map = L.map('map', { scrollWheelZoom: false }).setView(CITY_CONFIG.center, CITY_CONFIG.zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    layerGroup = L.layerGroup().addTo(map);
  }
  const markerIcon = (bg, emoji, size) => L.divIcon({
    className: 'cp-marker',
    html: `<div style="background:${bg};color:#fff;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:${Math.round(size * .45)}px;border:2px solid #fff;">${emoji}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2]
  });
  const isLatLng = (lat, lng) => num(lat) != null && num(lng) != null;

  function renderMap(reports, cameras, hazards) {
    if (typeof L === 'undefined') return; // Leaflet blocked/unavailable: the rest of the page still works
    ensureMap();
    layerGroup.clearLayers();
    const points = [CITY_CONFIG.center];

    // Wildfire zones (satellite hotspot clusters)
    const clusters = (hazards && hazards.wildfires && hazards.wildfires.clusters) || [];
    clusters.forEach(c => {
      if (!isLatLng(c.lat, c.lng)) return;
      const size = num(c.areaHa) > 0 ? ` · ~${c.areaHa} ha` : '';
      L.marker([c.lat, c.lng], { icon: markerIcon('#d03b3b', '🔥', 30), title: 'Wildfire zone' })
        .bindPopup(`<strong>🔥 Wildfire zone — ${escapeHtml(c.distanceKm)} km ${escapeHtml(c.direction)} of Neepawa</strong><br>${escapeHtml(c.count)} satellite hotspot${c.count === 1 ? '' : 's'}${size}<br><small>NRCan CWFIS · last detected ${escapeHtml(c.lastSeen || 'recently')} UTC</small>`)
        .addTo(layerGroup);
      points.push([c.lat, c.lng]);
    });

    // River gauge
    const rv = hazards && hazards.river;
    if (rv && isLatLng(rv.lat, rv.lng)) {
      L.marker([rv.lat, rv.lng], { icon: markerIcon('#2a78d6', '🌊', 28), title: 'River gauge' })
        .bindPopup(`<strong>🌊 ${escapeHtml(rv.stationName)}</strong><br>Level ${num(rv.level) != null ? rv.level.toFixed(2) + ' m' : '—'}${num(rv.discharge) != null ? ` · flow ${Math.round(rv.discharge)} m³/s` : ''}<br><small>Water Survey of Canada · ${escapeHtml(relativeTime(rv.observedAt))}</small>`)
        .addTo(layerGroup);
      points.push([rv.lat, rv.lng]);
    }
    reports.forEach(r => {
      if (!isLatLng(r.lat, r.lng)) return;
      const meta = TYPE_META[r.type] || TYPE_META.weather;
      const sev = SEVERITIES.includes(r.severity) ? r.severity : 'minor';
      L.marker([r.lat, r.lng], { icon: markerIcon(meta.color, meta.icon, 34), title: `${meta.label}: ${r.area}` })
        .bindPopup(`<strong>${escapeHtml(r.area)} — ${meta.label}</strong><br>${escapeHtml(tidyDescription(r.description))}<br><small>${escapeHtml(relativeTime(r.createdAt))} · ${capitalize(sev)} · ✓ Official</small>`)
        .addTo(layerGroup);
      points.push([r.lat, r.lng]);
    });
    cameras.forEach(cam => {
      if (!isLatLng(cam.lat, cam.lng)) return;
      const title = [cam.roadway, cam.location].filter(Boolean).join(' — ');
      L.marker([cam.lat, cam.lng], { icon: markerIcon('#52514e', '📷', 28), title: 'Camera' })
        .bindPopup(`<strong>📷 ${escapeHtml(title)}</strong><br><small>Highway camera · Manitoba 511</small>`)
        .addTo(layerGroup);
      points.push([cam.lat, cam.lng]);
    });

    // Fit everything once (and after a filter change), not on every
    // one-minute refresh — that would undo the visitor's own panning.
    if (!mapFitted && points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 10 });
      mapFitted = true;
    }
  }

  renderSeason();
  renderShortcuts();
  render();

  // Auto-refresh every minute — data files are tiny static JSON on a CDN,
  // so a fresh deploy is picked up within a minute of going live.
  setInterval(render, 60000);

  // Tick the "Updated X ago" label every 30s so data age is always honest
  setInterval(() => { if (dataTimestamp) renderFreshness(); }, 30000);

  // Refresh when tab regains focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
})();
