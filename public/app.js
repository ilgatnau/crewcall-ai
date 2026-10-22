import { parseDashboardCommand, routeInput } from './commands.js';
let token;
const $ = id => document.getElementById(id);
async function api(path, data) {
  const response = await fetch('/api/' + path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token }, body: JSON.stringify(data) } : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function element(tag, text, className) { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; }

const spoken = new Map();
const pendingSpeech = [];
let playing = false, speechGeneration = 0, stopCurrentAudio;
function stopSpeech() {
  speechGeneration++;
  pendingSpeech.length = 0;
  stopCurrentAudio?.();
}
async function speak(response) {
  pendingSpeech.push(response);
  if (playing) return;
  playing = true;
  try {
    while (pendingSpeech.length) {
      const item = pendingSpeech.shift();
      const generation = speechGeneration;
      let url;
      try {
        const result = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
          body: JSON.stringify({ name: item.name, id: item.id })
        });
        if (!result.ok) throw new Error((await result.json()).error);
        if (generation !== speechGeneration) continue;
        url = URL.createObjectURL(await result.blob());
        const audio = new Audio(url);
        await new Promise((resolve, reject) => {
          stopCurrentAudio = () => { audio.pause(); resolve(); };
          audio.onended = resolve;
          audio.onerror = () => reject(new Error('Audio playback failed. Use Play voice to retry.'));
          audio.play().catch(() => reject(new Error('Playback was blocked. Click Play voice to hear the summary.')));
        });
      } catch (error) {
        if (generation === speechGeneration) $('message').textContent = 'Voice: ' + error.message;
      } finally {
        stopCurrentAudio = null;
        if (url) URL.revokeObjectURL(url);
      }
    }
  } finally { playing = false; }
}
$('stop-speech').onclick = stopSpeech;
$('speak-replies').onchange = () => { if (!$('speak-replies').checked) stopSpeech(); };

async function refresh() {
  const state = await api('state');
  $('mode').textContent = state.demo ? 'SIMULATION — no terminal processes are launched.' : 'LOCAL TMUX · Readiness is manually confirmed · Queues are held in memory';
  $('agents').replaceChildren(...state.agents.map(agent => {
    const card = element('article');
    card.append(element('h2', agent.name), element('p', agent.status.replaceAll('-', ' '), 'badge'), element('code', agent.session));
    card.append(element('p', `${agent.queue.length} queued instruction${agent.queue.length === 1 ? '' : 's'}`));
    if (agent.last) card.append(element('p', 'Last sent: ' + agent.last, 'hint'));
    const response = state.responses.find(r => r.name === agent.name);
    if (response) {
      card.append(element('h3', 'Response'), element('p', response.text, 'response-text'));
      if (response.voice) {
        card.append(element('p', 'Voice summary: ' + response.voice, 'hint'));
        const play = element('button', 'Play voice');
        play.onclick = () => { stopSpeech(); speak(response); };
        card.append(play);
        if (spoken.get(agent.name) !== response.id) {
          spoken.set(agent.name, response.id);
          if ($('speak-replies').checked) speak(response);
        }
      }
    }
    if (state.demo) {
      const simulate = element('button', 'Simulate response');
      simulate.onclick = () => action(() => api('responses', { name: agent.name, text: 'This is a simulated agent response. Full written details appear here while the voice summary stays brief.', voice: 'The simulated task is complete. You can review the details on screen.' }));
      card.append(simulate);
    }
    if (agent.error) card.append(element('p', agent.error, 'error'));
    const attach = element('code', `tmux attach-session -t ${agent.session}`); card.append(attach);
    const actions = element('div', '', 'actions');
    for (const [label, endpoint] of [['Confirm ready / next', 'ready'], ['Clear queue', 'clear']]) {
      const button = element('button', label); button.onclick = () => action(async () => { await api(endpoint, { name: agent.name }); }); actions.append(button);
    }
    card.append(actions); return card;
  }));
}
async function action(fn) { try { const message = await fn(); $('message').textContent = typeof message === 'string' ? message : 'Updated.'; } catch (error) { $('message').textContent = error.message; } finally { await refresh().catch(() => {}); } }
async function showSessions() {
  const panel = $('session-panel');
  panel.hidden = false;
  $('session-list').replaceChildren(element('p', 'Loading sessions…'));
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('session-heading').focus({ preventScroll: true });
  try {
    const { sessions, demo } = await api('sessions');
    $('session-list').replaceChildren(...sessions.map(session => {
      const row = element('article');
      row.append(element('h3', session.name), element('code', session.session), element('p', session.availability.replaceAll('-', ' '), 'badge'));
      for (const pane of session.panes) row.append(element('p', pane.id + ' · ' + pane.process + (pane.dead ? ' · exited' : ''), 'hint'));
      if (session.attach) row.append(element('code', session.attach));
      return row;
    }));
    if (!sessions.length) $('session-list').append(element('p', 'No agents are configured.'));
    $('session-note').textContent = (demo ? 'Simulated sessions. ' : '') + 'Live session inspection. Running means the pane is alive; confirm readiness separately. Refresh to check again.';
    return 'Showing all ' + sessions.length + ' agent sessions.';
  } catch (error) {
    $('session-list').replaceChildren(element('p', 'Could not inspect sessions: ' + error.message, 'error'));
    throw error;
  }
}
$('show-sessions').onclick = () => action(showSessions);
$('refresh-sessions').onclick = () => action(showSessions);
$('hide-sessions').onclick = () => { $('session-panel').hidden = true; };
$('send').onclick = () => action(async () => {
  const text = $('instruction').value.trim();
  const result = await routeInput(text, { showSessions, submitInstruction: text => api('instructions', { text }) });
  $('instruction').value = '';
  return result;
});
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) { $('voice').disabled = true; $('voice').textContent = 'Dictation unavailable'; }
else {
  const recognition = new Recognition(); recognition.lang = 'en-US'; recognition.interimResults = false;
  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    if (parseDashboardCommand(transcript) === 'show-sessions') action(showSessions);
    else $('instruction').value = transcript;
  };
  recognition.onerror = event => { $('message').textContent = 'Dictation: ' + event.error; };
  recognition.onend = () => { $('voice').disabled = false; $('voice').textContent = 'Dictate'; };
  $('voice').onclick = () => { try { recognition.start(); $('voice').disabled = true; $('voice').textContent = 'Listening…'; } catch (error) { $('message').textContent = error.message; } };
}
try { token = (await api('token')).token; await refresh(); setInterval(() => refresh().catch(() => {}), 2500); } catch (error) { $('message').textContent = error.message; }
