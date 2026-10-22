import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Responses, responsePrompt } from './responses.js';
import { listAgentSessions } from './sessions.js';
import { Speech } from './speech.js';
import { Supervisor } from './supervisor.js';
import { Tmux, DemoTmux } from './tmux.js';
const demo = process.argv.includes('--demo');
const config = JSON.parse(await readFile(new URL(demo ? '../config.example.json' : '../config.local.json', import.meta.url)).catch(error => { throw new Error('Copy config.example.json to config.local.json and edit your agent profiles. ' + error.message); }));
const tmux = demo ? new DemoTmux() : new Tmux();
const supervisor = new Supervisor(config, tmux, (text, name) => responsePrompt(text, name, fileURLToPath(new URL('./cli.js', import.meta.url)), process.execPath));
const responses = new Responses(config.agents.map(p => p.name));
const speech = new Speech();
const token = randomBytes(24).toString('hex');
const port = Number(process.env.PORT || 3210);
const origin = `http://127.0.0.1:${port}`;
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/commands.js': ['commands.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
const server = http.createServer(async (req, res) => {
  try {
    // Bind locally and reject DNS rebinding / cross-origin browser requests.
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) return json(res, 403, { error: 'Origin rejected' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");
    if (req.method === 'GET' && files[req.url]) {
      const [name, type] = files[req.url];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      return res.end(await readFile(new URL(`../public/${name}`, import.meta.url)));
    }
    if (req.method === 'GET' && req.url === '/api/sessions') return json(res, 200, { demo, sessions: await listAgentSessions(supervisor.profiles, tmux) });
    if (req.method === 'GET' && req.url === '/api/state') return json(res, 200, { demo, agents: supervisor.snapshot(), responses: responses.snapshot() });
    // Bootstrap token is same-origin readable only, and is never persisted.
    if (req.method === 'GET' && req.url === '/api/token') return json(res, 200, { token });
    if (req.method === 'POST') {
      const supplied = Buffer.from(req.headers['x-agent-token'] || '');
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 403, { error: 'Invalid token' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 20000) return json(res, 413, { error: 'Request too large' }); }
      const data = JSON.parse(body);
      if (req.url === '/api/responses') {
        const profile = supervisor.profile(data.name);
        return json(res, 200, { response: responses.publish({ ...data, name: profile.name }) });
      }
      if (req.url === '/api/speech') {
        const response = responses.get(data.name, data.id);
        const audio = await speech.audio(response.voice);
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
        return res.end(audio);
      }
      if (req.url === '/api/instructions') return json(res, 200, { agents: await supervisor.submit(data.text) });
      if (req.url === '/api/ready') return json(res, 200, { agents: await supervisor.ready(data.name) });
      if (req.url === '/api/clear') return json(res, 200, { agents: await supervisor.clear(data.name) });
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) { json(res, 400, { error: error.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`Named Agents ${demo ? '(SIMULATION)' : ''}: ${origin}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
