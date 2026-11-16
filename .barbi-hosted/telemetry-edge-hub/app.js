const STORE_KEY = 'barbi_forged_telemetry-edge-hub';
let records = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
if (!records.length) {
  records.push({ id: Date.now(), text: 'Initialized Telemetry Edge Hub runtime cleanly.', at: new Date().toLocaleTimeString() });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
}
function renderLogs() {
  const ul = document.getElementById('op-log');
  if (!ul) return;
  ul.innerHTML = records.map(r => '<li><span>' + r.text.replace(/</g,'&lt;') + '</span><small>' + r.at + '</small></li>').join('');
}
window.triggerModuleAction = function(idx, title) {
  const el = document.getElementById('metric-val-' + idx);
  if (el) el.textContent = 'ACTIVE (' + new Date().toLocaleTimeString() + ')';
  records.unshift({ id: Date.now(), text: 'Executed module: ' + title, at: new Date().toLocaleTimeString() });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
};
window.appendUserOperation = function() {
  const inp = document.getElementById('op-input');
  if (!inp || !inp.value.trim()) return;
  records.unshift({ id: Date.now(), text: inp.value.trim(), at: new Date().toLocaleTimeString() });
  inp.value = '';
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
};
document.getElementById('btn-add-item')?.addEventListener('click', () => {
  const inp = document.getElementById('op-input');
  if (inp) inp.focus();
});
document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'Telemetry Edge Hub', records }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'telemetry-edge-hub-data.json';
  a.click();
});
renderLogs();