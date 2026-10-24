// Light/dark theme. Loaded in <head> (not at the end of <body>) so a saved
// choice applies before first paint instead of flashing the light theme.
// With no saved choice the OS preference wins (see :root rules in style.css).
(() => {
  const KEY = 'citypulse-theme';
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = t => { try { localStorage.setItem(KEY, t); } catch { /* private mode: session-only */ } };
  const apply = t => (t === 'light' || t === 'dark') ? root.setAttribute('data-theme', t) : root.removeAttribute('data-theme');
  const current = () => root.getAttribute('data-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  apply(read());

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const sync = () => btn.setAttribute('aria-pressed', String(current() === 'dark'));
    sync();
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      apply(next);
      save(next);
      sync();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
  });
})();
