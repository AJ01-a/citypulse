// Resources page: searchable directory + FAQ.
// Content comes from js/content.js. Search input is only ever used as
// plain text (matched with includes, rendered with textContent).
(() => {
  const listEl = document.getElementById('resList');
  const faqEl = document.getElementById('faqList');
  const input = document.getElementById('resSearch');
  const status = document.getElementById('searchStatus');
  if (!listEl || typeof RESOURCES === 'undefined') return;

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

  // Build once; search toggles visibility.
  const entries = [];
  RESOURCES.forEach(cat => {
    const section = el('div', { class: 'res-category' });
    const heading = el('h2', { text: cat.category });
    const grid = el('div', { class: 'res-grid' });
    section.append(heading, grid);
    cat.items.forEach(r => {
      const external = r.url.startsWith('http');
      const link = el('a', { class: 'res-title', href: r.url, text: r.title });
      if (external) { link.target = '_blank'; link.rel = 'noopener'; }
      const item = el('div', { class: 'res-item' },
        el('div', { class: 'res-body' }, link, el('p', { text: r.desc }), el('span', { class: 'res-org', text: r.org })));
      grid.append(item);
      entries.push({ node: item, section, text: `${r.title} ${r.desc} ${r.org} ${cat.category}`.toLowerCase() });
    });
    listEl.append(section);
  });

  const faqEntries = [];
  if (faqEl && typeof FAQ !== 'undefined') {
    FAQ.forEach(f => {
      const d = el('details', {}, el('summary', { text: f.q }), el('p', { text: f.a }));
      faqEl.append(d);
      faqEntries.push({ node: d, text: `${f.q} ${f.a}`.toLowerCase() });
    });
  }

  function search(q) {
    q = q.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const match = t => words.every(w => t.includes(w));
    let shown = 0;
    entries.forEach(e => { const on = !words.length || match(e.text); e.node.hidden = !on; if (on) shown++; });
    document.querySelectorAll('.res-category').forEach(sec => {
      sec.hidden = ![...sec.querySelectorAll('.res-item')].some(n => !n.hidden);
    });
    let faqShown = 0;
    faqEntries.forEach(e => {
      const on = !words.length || match(e.text);
      e.node.hidden = !on;
      if (on) faqShown++;
      if (words.length && on) e.node.open = true;
    });
    status.textContent = words.length
      ? `${shown} resource${shown === 1 ? '' : 's'} and ${faqShown} question${faqShown === 1 ? '' : 's'} match “${q}”.`
      : '';
  }
  input?.addEventListener('input', () => search(input.value));
  // Support links like resources.html?q=flood
  const q0 = new URLSearchParams(location.search).get('q');
  if (q0 && input) { input.value = q0.slice(0, 80); search(input.value); }
})();
