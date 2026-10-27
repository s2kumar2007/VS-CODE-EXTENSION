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
      if (m.status === 'error') add('error', 'Error: ' + (m.error || 'the turn failed'));
      else if (m.status === 'cancelled') add('notice', 'Cancelled');
      break;
    case 'busy': sendBtn.disabled = m.value; stopBtn.disabled = !m.value; break;
  }
});
