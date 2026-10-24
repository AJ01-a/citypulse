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
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Dashboard only
  if (!document.getElementById('statusCards')) return;

  const cityNameEl   = document.getElementById('cityName');
  const banner       = document.getElementById('overallStatus');
  const statusText   = document.getElementById('statusText');
  const lastUpdate   = document.getElementById('lastUpdate');
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

  if (cityNameEl) cityNameEl.textContent = CITY_CONFIG.name;

  let activeFilter = 'all';
  let dataTimestamp = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ----- Weather widget -----
  function renderWeather(w) {
    if (!w || !w.current || !w.daily) {
      weatherCard.innerHTML = `<div class="weather-loading">Weather unavailable</div>`;
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
    const uvMax   = w.daily.uv_index_max?.[t];
    const precip  = w.daily.precipitation_probability_max?.[t];

    const forecast = days.slice(t + 1, t + 4).map((day, i) => {
      const idx = t + 1 + i;
      const m = wmoMeta(w.daily.weather_code[idx], 1);
      const hi = Math.round(w.daily.temperature_2m_max[idx]);
      const lo = Math.round(w.daily.temperature_2m_min[idx]);
      const pop = w.daily.precipitation_probability_max[idx];
      return `
        <div class="forecast-day">
          <span class="dow">${formatDayShort(day)}</span>
          <span class="ico">${m.icon}</span>
          <span class="hilo"><strong>${hi}°</strong> <span class="lo">${lo}°</span></span>
          ${pop != null ? `<span class="pop">💧${pop}%</span>` : ''}
        </div>`;
    }).join('');

    weatherCard.innerHTML = `
      <div class="weather-now">
        <div class="weather-now-main">
          <span class="weather-icon">${meta.icon}</span>
          <div>
            <div class="temp">${Math.round(cur.temperature_2m)}<span>°C</span></div>
            <div class="cond">${meta.label}</div>
            <div class="feels">Feels like ${feels}° · ${humid}% humidity</div>
          </div>
        </div>
        <div class="weather-stats">
          <div><span class="lbl">Today</span><span class="val"><strong>${todayHi}°</strong> / ${todayLo}°</span></div>
          <div><span class="lbl">Wind</span><span class="val">${wind} km/h${gust ? ` · gust ${gust}` : ''}</span></div>
          <div><span class="lbl">Rain</span><span class="val">${precip != null ? precip + '%' : '—'}</span></div>
          <div><span class="lbl">UV</span><span class="val">${uvMax != null ? Math.round(uvMax) : '—'}</span></div>
          <div><span class="lbl">Sunrise</span><span class="val">${sunrise}</span></div>
          <div><span class="lbl">Sunset</span><span class="val">${sunset}</span></div>
        </div>
      </div>
      <div class="forecast">${forecast}</div>
      <div class="weather-footer">
        Weather data &copy; <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Updated ${relativeTime(w.currentLiveAt || w.fetchedAt)}
      </div>
    `;
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
      <span class="alert-ico">⚠</span>
      <div>
        <strong>${escapeHtml(top.description)}</strong>
        <span class="alert-meta">Official alert · Environment Canada · ${relativeTime(top.createdAt)}${verified.length > 1 ? ` · +${verified.length - 1} more` : ''}</span>
      </div>
    `;
  }

  // ----- Road conditions (Manitoba 511) -----
  function renderConditions(roads) {
    if (!condRoot) return;
    if (!roads) {
      condRoot.innerHTML = `
        <li class="empty-state compact error">
          <p>Couldn't load road conditions. Check <a href="https://www.manitoba511.ca" target="_blank" rel="noopener">Manitoba 511</a> directly.</p>
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
    const cams = (roads && roads.cameras) || [];
    if (cams.length === 0) {
      camSection.hidden = true;
      return;
    }
    camSection.hidden = false;
    // Re-render fully when the set of cameras changes (e.g. after a deploy
    // picked up a new/removed camera); otherwise just refresh the images.
    const key = cams.map(c => c.id).join(',');
    if (camerasKey === key) {
      // Just refresh the images with a cache-buster
      camRoot.querySelectorAll('img[data-src]').forEach(img => {
        img.src = img.dataset.src + (img.dataset.src.includes('?') ? '&' : '?') + 't=' + Date.now();
      });
      return;
    }
    camerasKey = key;
    camRoot.innerHTML = cams.map(cam => {
      const view = cam.views[0];
      const title = [cam.roadway, cam.location].filter(Boolean).join(' — ');
      return `
        <figure class="camera-card">
          <div class="camera-img-wrap">
            <img data-src="${escapeHtml(view.url)}" src="${escapeHtml(view.url)}" loading="lazy"
                 alt="Highway camera: ${escapeHtml(title)}" />
            <span class="cam-offline-msg">Camera offline</span>
          </div>
          <figcaption>
            <strong>${escapeHtml(title || 'Highway camera')}</strong>
            <span>${cam.distanceKm} km away${cam.direction && cam.direction !== 'Unknown' ? ' · ' + escapeHtml(cam.direction) : ''}</span>
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

  function renderHazards(h) {
    if (!hazardRoot) return;
    const cards = [];

    const aq = h.airQuality;
    if (aq) {
      const cls = aq.category === 'Low' ? 'ok' : aq.category === 'Moderate' ? 'warn' : 'bad';
      const smoke = aq.pm25 >= 30 ? ' · wildfire smoke likely' : '';
      cards.push({
        icon: '💨', label: 'Air quality (AQHI)',
        value: `${aq.aqhi > 10 ? '10+' : aq.aqhi} — ${aq.category}`,
        meta: `PM2.5 ${Math.round(aq.pm25)} µg/m³${smoke} · updated ${relativeTime(aq.fetchedAt)}`,
        cls, badge: aq.category,
      });
    } else {
      cards.push({ icon: '💨', label: 'Air quality (AQHI)', value: '—', meta: 'No data right now', cls: 'ok', badge: 'No data' });
    }

    const wf = h.wildfires;
    if (wf) {
      const none = wf.nearestKm == null;
      const cls = none ? 'ok' : wf.nearestKm <= 30 ? 'bad' : wf.nearestKm <= 100 ? 'warn' : 'ok';
      cards.push({
        icon: '🔥', label: `Wildfires within ${wf.radiusKm} km`,
        value: none ? 'None detected' : `${wf.nearestKm} km ${wf.nearestDirection}`,
        meta: none
          ? `Satellite scan clear · updated ${relativeTime(wf.fetchedAt)}`
          : `${wf.clusters.length} fire zone${wf.clusters.length === 1 ? '' : 's'} detected by satellite · updated ${relativeTime(wf.fetchedAt)}`,
        cls, badge: none ? 'Clear' : cls === 'bad' ? 'Very close' : cls === 'warn' ? 'Nearby' : 'Distant',
      });
    } else {
      cards.push({ icon: '🔥', label: 'Wildfires', value: '—', meta: 'No data right now', cls: 'ok', badge: 'No data' });
    }

    const rv = h.river;
    if (rv) {
      const t = typeof rv.trend6h === 'number' ? rv.trend6h : null;
      const cls = t !== null && t >= 0.4 ? 'bad' : t !== null && t >= 0.15 ? 'warn' : 'ok';
      const word = t === null ? 'No trend' :
        t >= 0.15 ? 'Rising fast' : t >= 0.03 ? 'Rising' : t <= -0.03 ? 'Falling' : 'Steady';
      const arrow = t === null ? '' : t >= 0.03 ? '↑ ' : t <= -0.03 ? '↓ ' : '→ ';
      const bits = [];
      if (rv.discharge != null) bits.push(`Flow ${Math.round(rv.discharge)} m³/s`);
      if (t !== null) bits.push(`${t >= 0 ? '+' : ''}${Math.round(t * 100)} cm over 6 h`);
      bits.push(`${rv.stationName} gauge · ${relativeTime(rv.observedAt)}`);
      cards.push({
        icon: '🌊', label: 'Whitemud River',
        value: arrow + word,
        meta: bits.join(' · '),
        cls, badge: cls === 'bad' ? 'Flood risk' : cls === 'warn' ? 'Watch' : 'Normal',
      });
    } else {
      cards.push({ icon: '🌊', label: 'Whitemud River', value: '—', meta: 'No data right now', cls: 'ok', badge: 'No data' });
    }

    hazardRoot.innerHTML = cards.map(t => `
      <div class="status-card">
        <div class="status-card-head">
          <span class="label"><span class="icon">${t.icon}</span>${t.label}</span>
          <span class="badge badge-${t.cls}">${t.badge}</span>
        </div>
        <div class="count count-text">${t.value}</div>
        <div class="meta">${t.meta}</div>
      </div>
    `).join('');
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
    'Check <a href="https://www.manitoba511.ca" target="_blank" rel="noopener">Manitoba 511</a> and ' +
    '<a href="https://weather.gc.ca" target="_blank" rel="noopener">Environment Canada</a> directly before travelling.';

  function renderStaleNotice(pipelineTs, live) {
    if (!staleWrap || !staleBanner) return;
    if (pipelineTs === null) {
      staleWrap.hidden = false;
      staleBanner.innerHTML =
        '<span class="stale-ico">\u26a0</span>' +
        '<div><strong>Couldn\u2019t load the latest alerts, road and hazard data.</strong>' +
        '<span class="stale-meta">This page can\u2019t confirm current conditions right now. ' + OFFICIAL_LINKS + '</span></div>';
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
      '<span class="stale-ico">\u23f3</span>' +
      '<div><strong>Alerts, road conditions and cameras were last updated ' + escapeHtml(relativeTime(pipelineTs)) +
      ' \u2014 the automatic update pipeline looks stalled.</strong>' +
      '<span class="stale-meta">' + liveNote + OFFICIAL_LINKS + '</span></div>';
  }

  // ----- Main render -----
  async function render() {
    const [reportData, weather, roads, hazards] = await Promise.all([loadReports(), loadWeather(), loadRoads(), loadHazards()]);
    const reports = reportData ? reportData.items : [];
    const summary = summarize(reports);

    renderWeather(weather);
    renderAlertBanner(reports);
    renderConditions(roads);
    renderCameras(roads);
    renderHazards(hazards);

    const condLevel = worstConditionLevel((roads && roads.conditions) || []);
    const condMeta = CONDITION_META[condLevel] || CONDITION_META.unknown;

    // Overall banner: worst of incidents + driving conditions + hazards,
    // with the reasons spelled out and unavailable inputs named.
    const status = statusReasons(reportData, roads, hazards, weather);
    banner.classList.remove('warn', 'bad', 'unknown');
    if (status.level !== 'ok') banner.classList.add(status.level);
    // aria-live region: only touch it when the text changes, or screen
    // readers re-announce it on every one-minute refresh.
    const sentence = statusSentence(status);
    if (statusText.textContent !== sentence) statusText.textContent = sentence;

    // The pipeline clock: newest timestamp any data file carries. Never the
    // browser-side live overlays (currentLiveAt / live air quality).
    dataTimestamp = pipelineTimestamp(weather, reportData, roads, hazards);
    lastUpdate.textContent = dataTimestamp ? relativeTime(dataTimestamp) : 'unknown';
    liveState = { weather: !!weather?.currentLiveAt, air: !!hazards.airQuality?.live };
    renderStaleNotice(dataTimestamp, liveState);

    // Status tiles. A file that failed to load shows "No data", never "Clear".
    const noData = (icon, label, meta) => ({ icon, label, value: '—', meta, cls: 'muted', badge: 'No data', isText: true });
    const cams = (roads && roads.cameras) || [];
    const tiles = [
      reportData ? {
        icon: '🌩', label: 'Weather alerts', value: summary.counts.weather || 0,
        meta: summary.counts.weather ? 'Environment Canada' : 'No active alerts',
        cls: summary.counts.weather ? 'warn' : 'ok',
        badge: summary.counts.weather ? 'Active' : 'Clear',
      } : noData('🌩', 'Weather alerts', 'Couldn’t load alerts'),
      reportData ? {
        icon: '🚧', label: 'Road incidents', value: summary.counts.road || 0,
        meta: summary.counts.road ? 'Closures & events within 60 km' : 'No closures within 60 km',
        cls: summary.counts.road >= 3 ? 'bad' : (summary.counts.road ? 'warn' : 'ok'),
        badge: summary.counts.road ? 'Active' : 'Clear',
      } : noData('🚧', 'Road incidents', 'Couldn’t load road events'),
      roads ? {
        icon: '🛣', label: 'Driving conditions', value: condMeta.badge,
        meta: (roads.conditions || []).length
          ? `${roads.conditions.length} highway segment${roads.conditions.length === 1 ? '' : 's'} reporting`
          : 'Seasonal — reported in winter',
        cls: condMeta.cls === 'muted' ? 'ok' : condMeta.cls,
        badge: condMeta.badge, isText: true,
      } : noData('🛣', 'Driving conditions', 'Couldn’t load road conditions'),
      roads ? {
        icon: '📷', label: 'Highway cameras', value: cams.length,
        meta: cams.length ? 'Live views nearby' : 'None in range',
        cls: cams.length ? 'ok' : 'muted', badge: cams.length ? 'Live' : 'None',
      } : noData('📷', 'Highway cameras', 'Couldn’t load cameras'),
    ];
    cardsRoot.innerHTML = tiles.map(t => `
      <div class="status-card">
        <div class="status-card-head">
          <span class="label"><span class="icon">${t.icon}</span>${t.label}</span>
          <span class="badge badge-${t.cls}">${t.badge}</span>
        </div>
        <div class="count${t.isText ? ' count-text' : ''}">${t.value}</div>
        <div class="meta">${t.meta}</div>
      </div>
    `).join('');

    // Incidents list (filtered)
    const filtered = activeFilter === 'all' ? reports : reports.filter(r => r.type === activeFilter);
    if (!reportData) {
      listRoot.innerHTML = `
        <li class="empty-state error">
          <p>Couldn't load alerts and road incidents. Check
          <a href="https://www.manitoba511.ca" target="_blank" rel="noopener">Manitoba 511</a> and
          <a href="https://weather.gc.ca" target="_blank" rel="noopener">Environment Canada</a> directly.</p>
        </li>`;
    } else if (filtered.length === 0) {
      listRoot.innerHTML = `
        <li class="empty-state">
          <div class="big">✓</div>
          <p>No active ${activeFilter === 'all' ? 'incidents' : activeFilter + ' incidents'} right now.</p>
        </li>`;
    } else {
      listRoot.innerHTML = filtered.map(r => {
        const meta = TYPE_META[r.type] || TYPE_META.weather;
        const srcLabel = r.source === 'mb-511' ? 'Manitoba 511' : 'Environment Canada';
        return `
          <li class="incident" data-sev="${r.severity}">
            <div class="icon-wrap">${meta.icon}</div>
            <div class="info">
              <h3>${escapeHtml(r.area)} <span class="src-badge verified">✓ ${srcLabel}</span></h3>
              <p>${escapeHtml(tidyDescription(r.description))}</p>
              <div class="meta">
                <span>${capitalize(r.severity)}</span>
                <span>${meta.label}</span>
              </div>
            </div>
            <span class="age">${relativeTime(r.createdAt)}</span>
          </li>`;
      }).join('');
    }

    renderMap(filtered, cams, hazards);
  }

  // Filters
  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      activeFilter = btn.dataset.filter;
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
  function renderMap(reports, cameras, hazards) {
    ensureMap();
    layerGroup.clearLayers();

    // Wildfire zones (satellite hotspot clusters)
    const clusters = (hazards && hazards.wildfires && hazards.wildfires.clusters) || [];
    clusters.forEach(c => {
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return;
      const icon = L.divIcon({
        className: 'cp-marker',
        html: `<div style="background:#d03b3b;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:14px;border:2px solid #fff;">🔥</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15]
      });
      const size = c.areaHa > 0 ? ` · ~${c.areaHa} ha` : '';
      L.marker([c.lat, c.lng], { icon })
        .bindPopup(`<strong>🔥 Wildfire zone — ${c.distanceKm} km ${c.direction} of Neepawa</strong><br>${c.count} satellite hotspot${c.count === 1 ? '' : 's'}${size}<br><small>NRCan CWFIS · last detected ${escapeHtml(c.lastSeen || 'recently')} UTC</small>`)
        .addTo(layerGroup);
    });

    // River gauge
    const rv = hazards && hazards.river;
    if (rv && typeof rv.lat === 'number' && typeof rv.lng === 'number') {
      const icon = L.divIcon({
        className: 'cp-marker',
        html: `<div style="background:#2a78d6;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3);font-size:13px;border:2px solid #fff;">🌊</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      L.marker([rv.lat, rv.lng], { icon })
        .bindPopup(`<strong>🌊 ${escapeHtml(rv.stationName)}</strong><br>Level ${rv.level.toFixed(2)} m${rv.discharge != null ? ` · flow ${Math.round(rv.discharge)} m³/s` : ''}<br><small>Water Survey of Canada · ${relativeTime(rv.observedAt)}</small>`)
        .addTo(layerGroup);
    }
    reports.forEach(r => {
      if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return;
      const meta = TYPE_META[r.type] || TYPE_META.weather;
      const icon = L.divIcon({
        className: 'cp-marker',
        html: `<div style="background:${meta.color};color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:16px;border:3px solid #fff;">${meta.icon}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17]
      });
      L.marker([r.lat, r.lng], { icon })
        .bindPopup(`<strong>${escapeHtml(r.area)} — ${meta.label}</strong><br>${escapeHtml(r.description)}<br><small>${relativeTime(r.createdAt)} · ${capitalize(r.severity)} · ✓ Official</small>`)
        .addTo(layerGroup);
    });
    cameras.forEach(cam => {
      if (typeof cam.lat !== 'number' || typeof cam.lng !== 'number') return;
      const icon = L.divIcon({
        className: 'cp-marker',
        html: `<div style="background:#52514e;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3);font-size:13px;border:2px solid #fff;">📷</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      const title = [cam.roadway, cam.location].filter(Boolean).join(' — ');
      L.marker([cam.lat, cam.lng], { icon })
        .bindPopup(`<strong>📷 ${escapeHtml(title)}</strong><br><small>Highway camera · Manitoba 511</small>`)
        .addTo(layerGroup);
    });
  }

  render();

  // Auto-refresh every minute — data files are tiny static JSON on a CDN,
  // and the pipeline now redeploys every ~6 minutes, so poll fast enough
  // that a fresh deploy is picked up within a minute of going live.
  setInterval(render, 60000);

  // Tick the "Updated X ago" label every 30s so data age is always honest
  setInterval(() => {
    if (dataTimestamp) {
      lastUpdate.textContent = relativeTime(dataTimestamp);
      renderStaleNotice(dataTimestamp, liveState);
    }
  }, 30000);

  // Refresh when tab regains focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
})();
