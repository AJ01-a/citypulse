(() => {
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

  const cityNameEl     = document.getElementById('cityName');
  const banner         = document.getElementById('overallStatus');
  const statusText     = document.getElementById('statusText');
  const lastUpdate     = document.getElementById('lastUpdate');
  const cardsRoot      = document.getElementById('statusCards');
  const listRoot       = document.getElementById('incidentList');
  const weatherCard    = document.getElementById('weatherCard');
  const alertWrap      = document.getElementById('alertBannerWrap');
  const alertBanner    = document.getElementById('alertBanner');

  if (cityNameEl) cityNameEl.textContent = CITY_CONFIG.name;

  let activeFilter = 'all';

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

  // ----- Main render -----
  async function render() {
    const [reports, weather] = await Promise.all([loadReports(), loadWeather()]);
    const summary = summarize(reports);

    renderWeather(weather);
    renderAlertBanner(reports);

    // Banner state
    banner.classList.remove('warn', 'bad');
    if (summary.worst === 'warn') banner.classList.add('warn');
    if (summary.worst === 'bad') banner.classList.add('bad');
    statusText.textContent =
      summary.total === 0 ? "All systems normal" :
      summary.worst === 'bad' ? `Major disruptions — ${summary.total} active` :
      summary.worst === 'warn' ? `Some disruptions — ${summary.total} active` :
      `${summary.total} minor report${summary.total === 1 ? '' : 's'}`;
    lastUpdate.textContent = "just now";

    // Status cards (now 5: weather + 4 utilities)
    cardsRoot.innerHTML = ['weather', 'power', 'water', 'internet', 'road'].map(type => {
      const meta = TYPE_META[type];
      const n = summary.counts[type] || 0;
      const badge = n === 0 ? 'badge-ok' : (n >= 3 ? 'badge-bad' : 'badge-warn');
      const badgeText = n === 0 ? 'Normal' : (n >= 3 ? 'Disrupted' : 'Issues');
      return `
        <div class="status-card">
          <div class="status-card-head">
            <span class="label"><span class="icon">${meta.icon}</span>${meta.label}</span>
            <span class="badge ${badge}">${badgeText}</span>
          </div>
          <div class="count">${n}</div>
          <div class="meta">${n === 1 ? 'active report' : 'active reports'}</div>
        </div>
      `;
    }).join('');

    // Incidents list (filtered)
    const filtered = activeFilter === 'all' ? reports : reports.filter(r => r.type === activeFilter);
    if (filtered.length === 0) {
      listRoot.innerHTML = `
        <li class="empty-state">
          <div class="big">✓</div>
          <p>No active ${activeFilter === 'all' ? 'incidents' : activeFilter + ' incidents'} reported.</p>
        </li>`;
    } else {
      listRoot.innerHTML = filtered.map(r => {
        const meta = TYPE_META[r.type] || TYPE_META.weather;
        const sourceBadge = r.verified
          ? '<span class="src-badge verified">✓ Official</span>'
          : '<span class="src-badge community">Community</span>';
        return `
          <li class="incident" data-sev="${r.severity}">
            <div class="icon-wrap">${meta.icon}</div>
            <div class="info">
              <h3>${escapeHtml(r.area)} — ${meta.label} ${sourceBadge}</h3>
              <p>${escapeHtml(r.description)}</p>
              <div class="meta">
                <span>${capitalize(r.severity)}</span>
                <span>${escapeHtml(r.area)}</span>
              </div>
            </div>
            <span class="age">${relativeTime(r.createdAt)}</span>
          </li>`;
      }).join('');
    }

    renderMap(filtered);
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
  function renderMap(reports) {
    ensureMap();
    layerGroup.clearLayers();
    reports.forEach(r => {
      if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return;
      const meta = TYPE_META[r.type] || TYPE_META.weather;
      const ring = r.verified ? 'border:3px solid #fff;outline:2px solid #16a34a;' : 'border:2px solid #fff;';
      const icon = L.divIcon({
        className: 'cp-marker',
        html: `<div style="background:${meta.color};color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:16px;${ring}">${meta.icon}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17]
      });
      L.marker([r.lat, r.lng], { icon })
        .bindPopup(`<strong>${escapeHtml(r.area)} — ${meta.label}</strong><br>${escapeHtml(r.description)}<br><small>${relativeTime(r.createdAt)} · ${capitalize(r.severity)}${r.verified ? ' · ✓ Official' : ''}</small>`)
        .addTo(layerGroup);
    });
  }

  render();

  // Auto-refresh every 60s (weather is cached server-side for 5min anyway)
  setInterval(render, 60000);

  // Refresh when tab regains focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
})();
