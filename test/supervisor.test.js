import test from 'node:test';
import assert from 'node:assert/strict';
import { Supervisor, validateConfig } from '../src/supervisor.js';
import { DemoTmux } from '../src/tmux.js';
const config = () => ({ agents: [{ name: 'Thomas', aliases: ['Tom'], session: 'agent-thomas', cwd: '/tmp', command: ['agent'] }] });
function setup() { const backend = new DemoTmux(); backend.sent = []; backend.send = async (pane, text) => backend.sent.push({ pane, text }); return { backend, app: new Supervisor(config(), backend) }; }
test('routes aliases and rejects missing or ambiguous target names', () => {
  const {app} = setup();
  assert.deepEqual(app.parse('Agent Tom, run tests'), { name: 'Thomas', instruction: 'run tests' });
  assert.throws(() => app.parse('Tommy, run tests'));
  assert.throws(() => app.parse('Thomas'));
});
test('concurrent requests create exactly one session and wait for readiness', async () => {
  const {app, backend} = setup();
  await Promise.all([app.submit('Thomas, first'), app.submit('Thomas, second')]);
  assert.equal(backend.panes.length, 1); assert.equal(backend.sent.length, 0);
  await app.ready('Thomas'); assert.equal(backend.sent[0].text, 'first');
  assert.equal(app.snapshot()[0].status, 'busy');
  await app.ready('Tom'); assert.equal(backend.sent[1].text, 'second');
});
test('adopts existing pane without creating a session or blindly delivering', async () => {
  const {app, backend} = setup(); backend.panes.push({ session: 'agent-thomas', id: '%42', dead: false });
  await app.submit('Thomas, hello'); assert.equal(backend.panes.length, 1); assert.equal(backend.sent.length, 0);
  await app.ready('Thomas'); assert.equal(backend.sent[0].pane, '%42');
});
test('refuses ambiguous panes and retains the instruction', async () => {
  const {app, backend} = setup(); backend.panes.push(...['%1','%2'].map(id => ({ session:'agent-thomas', id, dead:false })));
  await assert.rejects(app.submit('Thomas, hello'), /multiple panes/); assert.equal(app.snapshot()[0].queue.length, 1);
});
test('partial delivery errors cannot be retried without clearing and inspecting', async () => {
  const {app, backend} = setup(); await app.submit('Thomas, hello'); backend.send = async () => { throw new Error('connection lost'); };
  await assert.rejects(app.ready('Thomas'), /connection lost/); assert.equal(app.snapshot()[0].status, 'delivery-uncertain');
  await assert.rejects(app.ready('Thomas'), /uncertain/);
  await app.clear('Thomas'); assert.equal(app.snapshot()[0].queue.length, 0);
});
test('dead panes do not receive instructions', async () => {
  const {app, backend} = setup(); backend.panes.push({session:'agent-thomas',id:'%1',dead:true});
  await assert.rejects(app.submit('Thomas, hello'), /exited/); assert.equal(backend.sent.length, 0);
});
test('rejects duplicate aliases and terminal control characters', async () => {
  const c = config(); c.agents[0].aliases = ['Thomas']; assert.throws(() => validateConfig(c), /Duplicate/);
  const {app} = setup(); await assert.rejects(app.submit('Thomas, hello\nexit'), /single-line/);
});

test('formats the delivered prompt while preserving the original instruction in state', async () => {
  const backend = new DemoTmux();
  const sent = [];
  backend.send = async (pane, text) => sent.push(text);
  const app = new Supervisor(config(), backend, (text, name) => name + ': protocol; ' + text);
  await app.submit('Thomas, run tests');
  await app.ready('Thomas');
  assert.deepEqual(sent, ['Thomas: protocol; run tests']);
  assert.equal(app.snapshot()[0].last, 'run tests');
});
