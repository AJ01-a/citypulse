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
    const todayHi = Math.round(w.daily.temperature_2m_max?.[0]);
    const todayLo = Math.round(w.daily.temperature_2m_min?.[0]);
    const sunrise = formatTime(w.daily.sunrise?.[0]);
    const sunset  = formatTime(w.daily.sunset?.[0]);
    const wind    = Math.round(cur.wind_speed_10m);
    const gust    = Math.round(cur.wind_gusts_10m);
    const feels   = Math.round(cur.apparent_temperature);
    const humid   = Math.round(cur.relative_humidity_2m);
    const uvMax   = w.daily.uv_index_max?.[0];
    const precip  = w.daily.precipitation_probability_max?.[0];

    const forecast = (w.daily.time || []).slice(1, 4).map((day, i) => {
      const idx = i + 1;
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
        Weather data &copy; <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Updated ${relativeTime(w.fetchedAt)}
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
  let camerasRendered = false;
  function renderCameras(roads) {
    if (!camRoot || !camSection) return;
    const cams = roads.cameras || [];
    if (cams.length === 0) {
      camSection.hidden = true;
      return;
    }
    camSection.hidden = false;
    if (camerasRendered) {
      // Just refresh the images with a cache-buster
      camRoot.querySelectorAll('img[data-src]').forEach(img => {
        img.src = img.dataset.src + (img.dataset.src.includes('?') ? '&' : '?') + 't=' + Date.now();
      });
      return;
    }
    camerasRendered = true;
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

  // ----- Main render -----
  async function render() {
    const [reports, weather, roads] = await Promise.all([loadReports(), loadWeather(), loadRoads()]);
    const summary = summarize(reports);

    renderWeather(weather);
    renderAlertBanner(reports);
    renderConditions(roads);
    renderCameras(roads);

    const condLevel = worstConditionLevel(roads.conditions || []);
    const condMeta = CONDITION_META[condLevel] || CONDITION_META.unknown;

    // Overall banner: worst of incidents + driving conditions
    banner.classList.remove('warn', 'bad');
    let worst = summary.worst;
    if (condLevel === 'closed' || condLevel === 'poor') worst = 'bad';
    else if (condLevel === 'fair' && worst === 'ok') worst = 'warn';
    if (worst === 'warn') banner.classList.add('warn');
    if (worst === 'bad') banner.classList.add('bad');
    statusText.textContent =
      worst === 'bad' ? "Major disruptions — check alerts below" :
      worst === 'warn' && summary.total > 0 ? `Some disruptions — ${summary.total} active` :
      worst === 'warn' ? "Use caution on area highways" :
      summary.total === 0 ? "All clear" :
      `${summary.total} minor item${summary.total === 1 ? '' : 's'}`;
    dataTimestamp = weather?.fetchedAt || null;
    lastUpdate.textContent = dataTimestamp ? relativeTime(dataTimestamp) : "just now";

    // Status tiles
    const tiles = [
      {
        icon: '🌩', label: 'Weather alerts', value: summary.counts.weather || 0,
        meta: summary.counts.weather ? 'Environment Canada' : 'No active alerts',
        cls: summary.counts.weather ? 'warn' : 'ok',
        badge: summary.counts.weather ? 'Active' : 'Clear',
      },
      {
        icon: '🚧', label: 'Road incidents', value: summary.counts.road || 0,
        meta: summary.counts.road ? 'Closures & events within 60 km' : 'No closures within 60 km',
        cls: summary.counts.road >= 3 ? 'bad' : (summary.counts.road ? 'warn' : 'ok'),
        badge: summary.counts.road ? 'Active' : 'Clear',
      },
      {
        icon: '🛣', label: 'Driving conditions', value: condMeta.badge,
        meta: (roads.conditions || []).length
          ? `${roads.conditions.length} highway segment${roads.conditions.length === 1 ? '' : 's'} reporting`
          : 'Seasonal — reported in winter',
        cls: condMeta.cls === 'muted' ? 'ok' : condMeta.cls,
        badge: condMeta.badge, isText: true,
      },
      {
        icon: '📷', label: 'Highway cameras', value: (roads.cameras || []).length,
        meta: (roads.cameras || []).length ? 'Live views nearby' : 'None in range',
        cls: 'ok', badge: 'Live',
      },
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
    if (filtered.length === 0) {
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
              <p>${escapeHtml(r.description)}</p>
              <div class="meta">
                <span>${capitalize(r.severity)}</span>
                <span>${meta.label}</span>
              </div>
            </div>
            <span class="age">${relativeTime(r.createdAt)}</span>
          </li>`;
      }).join('');
    }

    renderMap(filtered, roads.cameras || []);
  }

  // Filters
  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
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
  function renderMap(reports, cameras) {
    ensureMap();
    layerGroup.clearLayers();
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

  // Auto-refresh every 2 minutes (server-side caches keep upstream load tiny)
  setInterval(render, 120000);

  // Tick the "Updated X ago" label every 30s so data age is always honest
  setInterval(() => {
    if (dataTimestamp) lastUpdate.textContent = relativeTime(dataTimestamp);
  }, 30000);

  // Refresh when tab regains focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
})();
