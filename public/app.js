let token;
const $ = id => document.getElementById(id);
async function api(path, data) {
  const response = await fetch('/api/' + path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token }, body: JSON.stringify(data) } : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function element(tag, text, className) { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; }
async function refresh() {
  const state = await api('state');
  $('mode').textContent = state.demo ? 'SIMULATION — no terminal processes are launched.' : 'LOCAL TMUX · Readiness is manually confirmed · Queues are held in memory';
  $('agents').replaceChildren(...state.agents.map(agent => {
    const card = element('article');
    card.append(element('h2', agent.name), element('p', agent.status.replaceAll('-', ' '), 'badge'), element('code', agent.session));
    card.append(element('p', `${agent.queue.length} queued instruction${agent.queue.length === 1 ? '' : 's'}`));
    if (agent.last) card.append(element('p', 'Last sent: ' + agent.last, 'hint'));
    if (agent.error) card.append(element('p', agent.error, 'error'));
    const attach = element('code', `tmux attach-session -t ${agent.session}`); card.append(attach);
    const actions = element('div', '', 'actions');
    for (const [label, endpoint] of [['Confirm ready / next', 'ready'], ['Clear queue', 'clear']]) {
      const button = element('button', label); button.onclick = () => action(async () => { await api(endpoint, { name: agent.name }); }); actions.append(button);
    }
    card.append(actions); return card;
  }));
}
async function action(fn) { try { await fn(); $('message').textContent = 'Updated.'; } catch (error) { $('message').textContent = error.message; } finally { await refresh().catch(() => {}); } }
$('send').onclick = () => action(async () => { await api('instructions', { text: $('instruction').value.trim() }); $('instruction').value = ''; });
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) { $('voice').disabled = true; $('voice').textContent = 'Dictation unavailable'; }
else {
  const recognition = new Recognition(); recognition.lang = 'en-US'; recognition.interimResults = false;
  recognition.onresult = event => { $('instruction').value = event.results[0][0].transcript; };
  recognition.onerror = event => { $('message').textContent = 'Dictation: ' + event.error; };
  recognition.onend = () => { $('voice').disabled = false; $('voice').textContent = 'Dictate'; };
  $('voice').onclick = () => { try { recognition.start(); $('voice').disabled = true; $('voice').textContent = 'Listening…'; } catch (error) { $('message').textContent = error.message; } };
}
try { token = (await api('token')).token; await refresh(); setInterval(() => refresh().catch(() => {}), 2500); } catch (error) { $('message').textContent = error.message; }
