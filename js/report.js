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

  // Char count
  const desc = document.getElementById('description');
  const charCount = document.getElementById('charCount');
  if (desc && charCount) {
    desc.addEventListener('input', () => { charCount.textContent = desc.value.length; });
  }

  // Map picker
  const map = L.map('pickerMap').setView(CITY_CONFIG.center, CITY_CONFIG.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  let marker = null;
  const latInput = document.getElementById('lat');
  const lngInput = document.getElementById('lng');

  function setPin(latlng) {
    if (marker) marker.setLatLng(latlng);
    else marker = L.marker(latlng, { draggable: true }).addTo(map);
    latInput.value = latlng.lat.toFixed(6);
    lngInput.value = latlng.lng.toFixed(6);
    marker.on('dragend', e => {
      const p = e.target.getLatLng();
      latInput.value = p.lat.toFixed(6);
      lngInput.value = p.lng.toFixed(6);
    });
  }

  map.on('click', e => setPin(e.latlng));

  // Use my location
  const useLoc = document.getElementById('useLocation');
  useLoc.addEventListener('click', () => {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    useLoc.textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(pos => {
      const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
      map.setView(ll, 15);
      setPin(ll);
      useLoc.textContent = "Use My Location";
    }, err => {
      useLoc.textContent = "Use My Location";
      alert("Couldn't get location: " + err.message);
    });
  });

  // Submit
  const form = document.getElementById('reportForm');
  const msg = document.getElementById('formMsg');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const report = {
      type: fd.get('type'),
      severity: fd.get('severity'),
      area: (fd.get('area') || '').trim(),
      description: (fd.get('description') || '').trim(),
      lat: parseFloat(fd.get('lat')),
      lng: parseFloat(fd.get('lng')),
    };
    if (!report.type) return showMsg('err', 'Please select an incident type.');
    if (!report.area || !report.description) return showMsg('err', 'Area and description are required.');
    if (Number.isNaN(report.lat) || Number.isNaN(report.lng)) {
      delete report.lat; delete report.lng;
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = 'Submitting…';

    try {
      await addReport(report);
      showMsg('ok', '✓ Report submitted. Redirecting to dashboard…');
      setTimeout(() => { window.location.href = 'index.html'; }, 1200);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
      showMsg('err', '✗ ' + (err.message || 'Submission failed. Please try again.'));
    }
  });

  function showMsg(kind, text) {
    msg.hidden = false;
    msg.className = 'form-msg ' + kind;
    msg.textContent = text;
  }
})();
