// Review webview. Content is inserted with textContent only (model output is untrusted).
const vscode = acquireVsCodeApi();
const hunksEl = document.getElementById('hunks');
const accepted = new Map();
const els = new Map();

function lines(text, cls) {
  const pre = document.createElement('pre');
  pre.className = cls;
  pre.textContent = text.replace(/\n$/, '').split('\n').map((l) => (cls === 'del' ? '- ' : '+ ') + l).join('\n');
  return pre;
}
function paint(id) {
  const ok = accepted.get(id);
  const { box, btn } = els.get(id);
  box.classList.toggle('rejected', !ok);
  btn.textContent = ok ? 'Accepted (click to reject)' : 'Rejected (click to accept)';
  btn.classList.toggle('off', !ok);
}
window.addEventListener('message', ({ data: m }) => {
  if (m.type === 'init') {
    document.getElementById('title').textContent = (m.isNew ? 'New file: ' : 'Edit: ') + m.path;
    document.getElementById('why').textContent = m.rationale || '';
    for (const h of m.hunks) {
      accepted.set(h.id, true);
      const box = document.createElement('div'); box.className = 'hunk';
      const head = document.createElement('header');
      const label = document.createElement('span'); label.textContent = 'Hunk ' + h.id + ' (old line ' + h.oldStart + ')';
      const btn = document.createElement('button');
      btn.onclick = () => { accepted.set(h.id, !accepted.get(h.id)); paint(h.id); vscode.postMessage({ type: 'toggle', id: h.id, accepted: accepted.get(h.id) }); };
      head.append(label, btn); box.append(head);
      if (h.removed) box.append(lines(h.removed, 'del'));
      if (h.added) box.append(lines(h.added, 'add'));
      hunksEl.append(box); els.set(h.id, { box, btn }); paint(h.id);
    }
  } else if (m.type === 'state') {
    for (const id of accepted.keys()) { accepted.set(id, m.all); paint(id); }
  }
});
document.getElementById('acceptAll').onclick = () => vscode.postMessage({ type: 'all', accepted: true });
document.getElementById('rejectAll').onclick = () => vscode.postMessage({ type: 'all', accepted: false });
document.getElementById('confirm').onclick = () => vscode.postMessage({ type: 'confirm' });
document.getElementById('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
