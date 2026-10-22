import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('HTTP response reporting, security, and dashboard bootstrap', async t => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['src/server.js', '--demo'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = once(child, 'exit');
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      exit.then(() => { throw new Error('Server exited before startup'); }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000); timer.unref(); })
    ]);
    const base = 'http://127.0.0.1:' + port;
    const { token } = await (await fetch(base + '/api/token')).json();
    const post = (path, body, auth = token) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Token': auth }, body: JSON.stringify(body) });
    await t.test('requires token and rejects foreign origins', async () => {
      assert.equal((await post('/api/responses', { name: 'Thomas', text: 'hello' }, '')).status, 403);
      assert.equal((await fetch(base + '/api/state', { headers: { Origin: 'https://example.com' } })).status, 403);
    });
    await t.test('publishes alias reports, appends progress, and rejects stale speech', async () => {
      const first = await post('/api/responses', { name: 'Tom', text: 'Working.' });
      assert.equal(first.status, 200);
      const update = await post('/api/responses', { name: 'Thomas', text: ' Finished.', voice: 'The task is complete.', append: true });
      const { response } = await update.json();
      assert.equal(response.text, 'Working. Finished.');
      const state = await (await fetch(base + '/api/state')).json();
      assert.deepEqual(state.responses, [response]);
      assert.equal((await post('/api/speech', { name: 'Thomas', id: 'stale' })).status, 400);
      assert.equal((await post('/api/responses', { name: 'John', text: 'x', voice: 'word '.repeat(36) })).status, 400);
    });
    await t.test('loads dashboard as module with allowed audio sources', async () => {
      const page = await fetch(base);
      assert.match(page.headers.get('content-security-policy'), /media-src 'self' blob:/);
      assert.match(await page.text(), /type="module"/);
      assert.equal((await fetch(base + '/app.js')).status, 200);
    });

    await t.test('session listing inspects live panes without starting agents or changing queues', async () => {
      const before = await (await fetch(base + '/api/state')).json();
      const empty = await (await fetch(base + '/api/sessions')).json();
      assert.equal(empty.sessions.length, 2);
      assert.ok(empty.sessions.every(session => session.availability === 'missing'));
      assert.deepEqual((await (await fetch(base + '/api/state')).json()).agents, before.agents);
      assert.equal((await post('/api/instructions', { text: 'Thomas, run tests' })).status, 200);
      const queued = await (await fetch(base + '/api/state')).json();
      const { sessions } = await (await fetch(base + '/api/sessions')).json();
      assert.equal(sessions[0].availability, 'running');
      assert.equal(sessions[0].panes[0].process, 'demo-agent');
      assert.equal(sessions[1].availability, 'missing');
      assert.deepEqual((await (await fetch(base + '/api/state')).json()).agents, queued.agents);
      const module = await fetch(base + '/commands.js');
      assert.equal(module.status, 200);
      assert.match(await module.text(), /parseDashboardCommand/);
    });
    if (process.env.LIVE_TTS === '1') {
      const state = await (await fetch(base + '/api/state')).json();
      const response = await post('/api/speech', { name: 'Thomas', id: state.responses[0].id });
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get('content-type'), 'audio/mpeg');
      const audio = await response.arrayBuffer();
      assert.ok(audio.byteLength > 100);
      console.log('Live TTS returned', audio.byteLength, 'bytes of MP3 audio.');
    }
  } finally { child.kill(); await exit; }
});
