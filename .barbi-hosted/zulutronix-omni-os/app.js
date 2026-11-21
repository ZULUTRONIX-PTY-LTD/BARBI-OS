const STORE_KEY = 'barbi_forged_zulutronix-omni-os';
let records = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
if (!records.length) {
  records.push({
    id: Date.now(),
    text: 'Initialized ZULUTRONIX Omni-OS (WEB / WINDOWS / MACOS / IOS / ANDROID) via R.E.A Agent Forge.',
    at: new Date().toLocaleTimeString(),
  });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
}

function detectPlatformRuntime() {
  const isTauri = Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const isCapacitor = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const ua = navigator.userAgent || '';
  if (isTauri) {
    if (/Mac/i.test(ua)) return 'macOS Native (Tauri v2)';
    if (/Win/i.test(ua)) return 'Windows Native (Tauri v2)';
    return 'Desktop Native (Tauri v2)';
  }
  if (isCapacitor) {
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Native (Capacitor)';
    if (/Android/i.test(ua)) return 'Android Native (Capacitor)';
    return 'Mobile Native (Capacitor)';
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Web / PWA';
  if (/Android/i.test(ua)) return 'Android Web / PWA';
  if (/Mac/i.test(ua)) return 'macOS Web / PWA';
  if (/Win/i.test(ua)) return 'Windows Web / PWA';
  return 'Web / PWA Runtime';
}

const hostEl = document.getElementById('detected-host');
if (hostEl) hostEl.textContent = detectPlatformRuntime();

if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function renderLogs() {
  const ul = document.getElementById('op-log');
  if (!ul) return;
  ul.innerHTML = records
    .map((r) => '<li><span>' + String(r.text).replace(/</g, '&lt;') + '</span><small>' + r.at + '</small></li>')
    .join('');
}

window.triggerModuleAction = function (idx, title) {
  const el = document.getElementById('metric-val-' + idx);
  if (el) el.textContent = 'ACTIVE (' + new Date().toLocaleTimeString() + ')';
  records.unshift({ id: Date.now(), text: '[' + detectPlatformRuntime() + '] Executed: ' + title, at: new Date().toLocaleTimeString() });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
};

window.appendUserOperation = function () {
  const inp = document.getElementById('op-input');
  if (!inp || !inp.value.trim()) return;
  records.unshift({ id: Date.now(), text: inp.value.trim(), at: new Date().toLocaleTimeString() });
  inp.value = '';
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
};

document.getElementById('btn-runtime-info')?.addEventListener('click', () => {
  records.unshift({
    id: Date.now(),
    text: 'Runtime Probe: ' + detectPlatformRuntime() + ' • Bundle co.za.zulutronix.zulutronixomnios',
    at: new Date().toLocaleTimeString(),
  });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
});

document.getElementById('btn-add-item')?.addEventListener('click', () => {
  const inp = document.getElementById('op-input');
  if (inp) inp.focus();
});

document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ app: 'ZULUTRONIX Omni-OS', bundleId: 'co.za.zulutronix.zulutronixomnios', runtime: detectPlatformRuntime(), records }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zulutronix-omni-os-state.json';
  a.click();
});

renderLogs();