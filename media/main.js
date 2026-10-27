// Webview script. textContent is used everywhere (never innerHTML) so model output cannot inject markup.
const vscode = acquireVsCodeApi();
const log = document.getElementById('log');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const stopBtn = document.getElementById('stop');
const bubbles = new Map(); // message id -> element, so deltas append to the right bubble

function add(cls, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + cls;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}
function send() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  vscode.postMessage({ type: 'send', text });
}
sendBtn.onclick = send;
stopBtn.onclick = () => vscode.postMessage({ type: 'stop' });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });

window.addEventListener('message', ({ data: m }) => {
  switch (m.type) {
    case 'userMessage': add('user', m.text); break;
    case 'delta': {
      let el = bubbles.get(m.id);
      if (!el) { el = add('agent', ''); bubbles.set(m.id, el); }
      el.textContent += m.text;
      log.scrollTop = log.scrollHeight;
      break;
    }
    case 'tool': add('tool', 'tool call: ' + m.name); break;
    case 'notice': add('notice', m.text); break;
    case 'done':
      if (m.status === 'error') add('error', m.message || 'The request failed.');
      else if (m.status === 'cancelled') add('notice', m.message || 'Cancelled - no changes applied');
      break;
    case 'context': {
      const d = document.createElement('details'); d.className = 'msg notice';
      const sm = document.createElement('summary'); sm.textContent = 'Context used (' + m.tokens + ' / ' + m.budget + ' tokens, ' + m.items.length + ' items)';
      d.append(sm);
      for (const it of m.items) { const r = document.createElement('div'); r.textContent = it.label + ' [' + it.tokens + ' tok] - ' + it.reason; d.append(r); }
      log.appendChild(d); log.scrollTop = log.scrollHeight; break;
    }
    case 'suggestions': showSuggestions(m.items); break;
    case 'busy': sendBtn.disabled = m.value; stopBtn.disabled = !m.value; break;
  }
});

// --- @file / @symbol autocomplete: type "@" (or "@symbol:Name") and pick a suggestion ---
const ac = document.getElementById('ac');
function currentToken() {
  const upto = input.value.slice(0, input.selectionStart);
  const m = /@([^\s]*)$/.exec(upto);
  return m ? { start: upto.length - m[0].length, text: m[1] } : undefined;
}
function showSuggestions(items) {
  ac.textContent = '';
  const tok = currentToken();
  if (!tok || !items.length) { ac.style.display = 'none'; return; }
  for (const it of items) {
    const row = document.createElement('div'); row.className = 'ac-item'; row.textContent = it.label;
    row.onclick = () => { input.value = input.value.slice(0, tok.start) + it.insert + ' ' + input.value.slice(input.selectionStart); ac.style.display = 'none'; input.focus(); };
    ac.append(row);
  }
  ac.style.display = 'block';
}
input.addEventListener('input', () => {
  const tok = currentToken();
  if (tok) vscode.postMessage({ type: 'suggest', prefix: tok.text }); else ac.style.display = 'none';
});
