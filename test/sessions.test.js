import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDashboardCommand, routeInput } from '../public/commands.js';
import { listAgentSessions } from '../src/sessions.js';

test('recognizes spoken session-list commands and transcription punctuation', () => {
  for (const text of ['Show all agent sessions', 'Please display all the agent sessions.', 'List agent sessions!', 'show me all agents', 'Open the agent sessions?', '  SHOW   ALL AGENT SESSIONS.  ']) {
    assert.equal(parseDashboardCommand(text), 'show-sessions', text);
  }
});
test('never treats agent-addressed instructions or partial matches as dashboard commands', () => {
  for (const text of ['Agent Thomas, show all agent sessions', 'Thomas, list agent sessions', 'show all agent sessions and delete them', 'show all agent sessions in code', '', null]) {
    assert.equal(parseDashboardCommand(text), null);
  }
});
test('session commands display without submitting instructions', async () => {
  const calls = [];
  const handlers = { showSessions: async () => calls.push('display'), submitInstruction: async text => calls.push(text) };
  await routeInput('show all agent sessions', handlers);
  assert.deepEqual(calls, ['display']);
  await routeInput('Thomas, run tests', handlers);
  assert.deepEqual(calls, ['display', 'Thomas, run tests']);
});
test('lists all configured agents and actual pane availability without creating sessions', async () => {
  const profiles = ['live', 'dead', 'missing', 'ambiguous', 'bound', 'badbound'].map(name => ({
    name, session: name, ...(name.includes('bound') ? { pane: '%5' } : {})
  }));
  const panes = [
    { session: 'live', id: '%1', dead: false, process: 'node' },
    { session: 'dead', id: '%2', dead: true, process: 'node' },
    { session: 'ambiguous', id: '%3', dead: false, process: 'sh' },
    { session: 'ambiguous', id: '%4', dead: false, process: 'node' },
    { session: 'bound', id: '%5', dead: false, process: 'node' },
    { session: 'bound', id: '%6', dead: false, process: 'sh' },
    { session: 'badbound', id: '%7', dead: false, process: 'sh' },
    { session: 'unrelated', id: '%8', dead: false, process: 'sh' }
  ];
  let inspections = 0;
  const result = await listAgentSessions(profiles, { list: async () => { inspections++; return panes; } });
  assert.equal(inspections, 1);
  assert.deepEqual(result.map(x => x.availability), ['running', 'stopped', 'missing', 'multiple-panes', 'running', 'bound-pane-missing']);
  assert.equal(result[4].pane, '%5');
  assert.equal(result[2].attach, null);
  assert.equal(result[0].attach, 'tmux attach-session -t live');
  assert.equal(result.length, 6);
});
test('surfaces session inspection errors instead of claiming there are no sessions', async () => {
  await assert.rejects(listAgentSessions([], { list: async () => { throw new Error('tmux unavailable'); } }), /tmux unavailable/);
});
