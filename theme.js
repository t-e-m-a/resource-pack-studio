/* Color theme control: Frost (default) / Midnight (original). */
(() => {
  const toggle = document.getElementById('themeToggle');
  const sheet = document.getElementById('themeStylesheet');
  const label = document.getElementById('themeLabel');
  const icon = document.getElementById('themeIcon');
  const themeColor = document.getElementById('browserThemeColor');
  const KEY = 'resourcePackStudio.colorTheme.v1';
  if (!toggle || !sheet) return;
  const getSaved = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };
  const setSaved = (value) => {
    try { localStorage.setItem(KEY, value); } catch { /* private mode */ }
  };
  function apply(mode) {
    const dark = mode === 'midnight';
    sheet.disabled = dark;
    document.documentElement.dataset.theme = dark ? 'midnight' : 'frost';
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('title', dark ? 'Switch to Frost light theme' : 'Switch to Midnight dark theme');
    label.textContent = dark ? 'Light mode' : 'Dark mode';
    icon.textContent = dark ? '☀' : '☾';
    themeColor?.setAttribute('content', dark ? '#0b1020' : '#f3f6fc');
    setSaved(dark ? 'midnight' : 'frost');
  }
  apply(getSaved() === 'midnight' ? 'midnight' : 'frost');
  toggle.addEventListener('click', () => apply(document.documentElement.dataset.theme === 'frost' ? 'midnight' : 'frost'));
})();
