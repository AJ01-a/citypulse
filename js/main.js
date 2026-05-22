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

  const cityNameEl = document.getElementById('cityName');
  const banner = document.getElementById('overallStatus');
  const statusText = document.getElementById('statusText');
  const lastUpdate = document.getElementById('lastUpdate');
  const cardsRoot = document.getElementById('statusCards');
  const listRoot = document.getElementById('incidentList');

  if (cityNameEl) cityNameEl.textContent = CITY_CONFIG.name;

  let activeFilter = 'all';

  async function render() {
    const reports = await loadReports();
    const summary = summarize(reports);

    // Banner state
    banner.classList.remove('warn', 'bad');
    if (summary.worst === 'warn') banner.classList.add('warn');
    if (summary.worst === 'bad') banner.classList.add('bad');
    statusText.textContent =
      summary.total === 0 ? "All systems normal" :
      summary.worst === 'bad' ? `Major disruptions — ${summary.total} active` :
      summary.worst === 'warn' ? `Some disruptions — ${summary.total} active` :
      `${summary.total} minor reports`;
    lastUpdate.textContent = "just now";

    // Status cards
    cardsRoot.innerHTML = ['power', 'water', 'internet', 'road'].map(type => {
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
        const meta = TYPE_META[r.type];
        return `
          <li class="incident" data-sev="${r.severity}">
            <div class="icon-wrap">${meta.icon}</div>
            <div class="info">
              <h3>${escapeHtml(r.area)} — ${meta.label}</h3>
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
      const meta = TYPE_META[r.type];
      const icon = L.divIcon({
        className: 'cp-marker',
        html: `<div style="background:${meta.color};color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:16px;border:2px solid #fff;">${meta.icon}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17]
      });
      L.marker([r.lat, r.lng], { icon })
        .bindPopup(`<strong>${escapeHtml(r.area)} — ${meta.label}</strong><br>${escapeHtml(r.description)}<br><small>${relativeTime(r.createdAt)} · ${capitalize(r.severity)}</small>`)
        .addTo(layerGroup);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  render();

  // Auto-refresh relative timestamps + poll backend every 30s
  setInterval(render, 30000);

  // Refresh when tab regains focus (catches updates faster than the 30s poll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
})();
