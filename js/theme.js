// Appearance: light (default), dark, or match the device. Loaded in <head>
// (not at the end of <body>) so a saved choice applies before first paint
// instead of flashing the light theme. New visitors always get light; the
// OS preference only applies if the visitor picks "Match device".
// Older saves of 'light' / 'dark' (from the earlier toggle) carry over.
(() => {
  const KEY = 'citypulse-theme';
  const THEMES = [
    { id: 'light',  label: 'Light' },
    { id: 'dark',   label: 'Dark' },
    { id: 'system', label: 'Match device' },
  ];
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = t => { try { localStorage.setItem(KEY, t); } catch { /* private mode: session-only */ } };
  const valid = t => THEMES.some(x => x.id === t);
  const apply = t => root.setAttribute('data-theme', valid(t) ? t : 'light');

  apply(read());

  document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector('[data-appearance]');
    if (!host) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'appearance-btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'appearanceMenu');
    btn.innerHTML = '<span class="sr-only">Appearance</span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>';
    const menu = document.createElement('div');
    menu.className = 'appearance-menu';
    menu.id = 'appearanceMenu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Appearance');
    menu.hidden = true;
    const items = THEMES.map(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitemradio');
      b.dataset.theme = t.id;
      b.textContent = t.label;
      b.addEventListener('click', () => { apply(t.id); save(t.id); sync(); close(true); });
      menu.append(b);
      return b;
    });
    host.append(btn, menu);

    const sync = () => {
      const cur = root.getAttribute('data-theme');
      items.forEach(b => {
        const on = b.dataset.theme === cur;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = -1;
      });
    };
    const open = () => {
      sync();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      (items.find(b => b.getAttribute('aria-checked') === 'true') || items[0]).focus();
    };
    const close = refocus => {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    };
    btn.addEventListener('click', () => (menu.hidden ? open() : close(false)));
    menu.addEventListener('keydown', e => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close(false);
    });
    document.addEventListener('click', e => { if (!host.contains(e.target)) close(false); });
    sync();
  });
})();
