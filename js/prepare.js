// Prepare page: season tabs + checklists. All content comes from
// js/content.js; ticks are stored per browser in localStorage (a
// convenience only — the page works the same without it).
(() => {
  const KEY = 'citypulse-checklist';
  const tabsEl = document.getElementById('seasonTabs');
  const panelsEl = document.getElementById('seasonPanels');
  const kitsEl = document.getElementById('kitGroups');
  if (!tabsEl || !panelsEl || typeof SEASONS === 'undefined') return;

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };
  let ticks = load();

  // Build DOM with createElement/textContent only — no HTML strings.
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const kid of kids) if (kid) n.append(kid);
    return n;
  };
  const extLink = (url, text) => el('a', { href: url, target: '_blank', rel: 'noopener', text });

  function checkGroup(id, title, items, source, note) {
    const box = el('div', { class: 'check-group' });
    const progress = el('span', { class: 'check-progress' });
    box.append(el('div', { class: 'check-group-head' }, el('h3', { text: title }), progress));
    if (note) box.append(el('p', { class: 'muted small', text: note }));
    const list = el('ul', { class: 'checklist' });
    items.forEach((it, i) => {
      const key = `${id}:${i}`;
      const input = el('input', { type: 'checkbox' });
      input.checked = !!ticks[key];
      input.addEventListener('change', () => {
        if (input.checked) ticks[key] = 1; else delete ticks[key];
        save(ticks);
        update();
      });
      const label = typeof it === 'string'
        ? el('span', { text: it })
        : el('span', {}, extLink(it.url, it.text));
      list.append(el('li', {}, el('label', {}, input, label)));
    });
    box.append(list);
    if (source) {
      const src = el('span', { class: 'check-src' });
      src.append('Source: ', extLink(source.url, source.label));
      box.append(src);
    }
    const update = () => {
      const done = list.querySelectorAll('input:checked').length;
      progress.textContent = `${done}/${items.length}`;
    };
    update();
    return box;
  }

  // Seasons as an accessible tablist (arrow keys move between tabs).
  const featured = currentSeason();
  const fromHash = SEASONS.find(s => `#${s.id}` === location.hash);
  let selected = (fromHash || featured).id;
  const tabs = [];

  SEASONS.forEach(s => {
    const tab = el('button', {
      class: 'season-tab', role: 'tab', id: `tab-${s.id}`, 'aria-controls': `panel-${s.id}`, type: 'button',
    }, el('span', { 'aria-hidden': 'true', text: s.icon }), el('span', { text: s.name }));
    if (s.id === featured.id) tab.append(el('span', { class: 'now', text: 'now' }));
    tab.addEventListener('click', () => select(s.id, true));
    tab.addEventListener('keydown', e => {
      const i = SEASONS.indexOf(s);
      const to = e.key === 'ArrowRight' ? (i + 1) % SEASONS.length
        : e.key === 'ArrowLeft' ? (i - 1 + SEASONS.length) % SEASONS.length : null;
      if (to !== null) { e.preventDefault(); select(SEASONS[to].id, true); tabs[to].focus(); }
    });
    tabs.push(tab);
    tabsEl.append(tab);

    const panel = el('div', { class: 'season-panel', role: 'tabpanel', id: `panel-${s.id}`, 'aria-labelledby': `tab-${s.id}` });
    panel.append(el('h2', { text: `${s.name}: ${s.headline}` }));
    panel.append(el('p', { class: 'season-watch', text: `What to watch for: ${s.watch.join(' · ')}` }));
    const groups = el('div', { class: 'check-groups' });
    s.groups.forEach((g, gi) => groups.append(checkGroup(`${s.id}-${gi}`, g.title, g.items, g.source)));
    panel.append(groups);
    panelsEl.append(panel);
  });

  function select(id, updateHash) {
    selected = id;
    SEASONS.forEach((s, i) => {
      const on = s.id === id;
      tabs[i].setAttribute('aria-selected', String(on));
      tabs[i].tabIndex = on ? 0 : -1;
      document.getElementById(`panel-${s.id}`).hidden = !on;
    });
    if (updateHash) history.replaceState(null, '', `#${id}`);
  }
  select(selected, false);

  if (kitsEl && typeof KITS !== 'undefined') {
    KITS.forEach(k => kitsEl.append(checkGroup(k.id, k.title, k.items, k.source, k.note)));
  }

  document.getElementById('printBtn')?.addEventListener('click', () => window.print());
  document.getElementById('resetBtn')?.addEventListener('click', () => {
    ticks = {};
    save(ticks);
    document.querySelectorAll('.checklist input').forEach(i => { i.checked = false; i.dispatchEvent(new Event('change')); });
  });
})();
