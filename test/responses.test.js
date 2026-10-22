import test from 'node:test';
import assert from 'node:assert/strict';
import { Responses, responsePrompt } from '../src/responses.js';
import { Speech } from '../src/speech.js';

test('text updates append without speaking until a voice summary is reported', () => {
  const responses = new Responses(['Thomas']);
  responses.publish({ name: 'Thomas', text: 'Working' });
  const progress = responses.publish({ name: 'Thomas', text: ' on tests.', append: true });
  assert.equal(progress.text, 'Working on tests.');
  assert.equal(progress.voice, '');
  const done = responses.publish({ name: 'Thomas', text: 'All tests passed.', voice: 'Tests pass.' });
  assert.equal(responses.get('Thomas', done.id).voice, 'Tests pass.');
  assert.throws(() => responses.get('Thomas', progress.id), /unavailable/);
  assert.equal(responses.snapshot().length, 1);
});
test('rejects invalid responses and oversized voice summaries', () => {
  const responses = new Responses(['Thomas']);
  for (const data of [
    { name: 'Other', text: 'hello' },
    { name: 'Thomas', text: '' },
    { name: 'Thomas', text: 'x', voice: 'word '.repeat(36) },
    { name: 'Thomas', text: 'x', voice: 'x'.repeat(301) },
    { name: 'Thomas', text: 'x', voice: 'hello\nworld' },
    { name: 'Thomas', text: 'x', append: 'true' }
  ]) assert.throws(() => responses.publish(data));
});
test('prompt includes the reporting command and separate speech rules', () => {
  const prompt = responsePrompt('run tests', 'Thomas', '/app/src/cli.js', '/bin/node');
  assert.match(prompt, /35 words/);
  assert.match(prompt, /'respond' 'Thomas'/);
  assert.match(prompt, /User instruction: run tests$/);
});
test('speech joins generated MP3 chunks and releases its lock on failure', async () => {
  const speech = new Speech(async (text, options) => {
    assert.equal(text, 'Tests pass.');
    assert.equal(options.lang, 'en');
    return [{ base64: Buffer.from('one').toString('base64') }, { base64: Buffer.from('two').toString('base64') }];
  });
  assert.equal((await speech.audio('Tests pass.')).toString(), 'onetwo');
  speech.synthesize = async () => { throw new Error('offline'); };
  await assert.rejects(speech.audio('test'), /offline/);
  assert.equal(speech.pending, null);
});
test('speech prevents overlapping provider requests', async () => {
  let finish;
  const speech = new Speech(() => new Promise(resolve => { finish = resolve; }));
  const first = speech.audio('first');
  await assert.rejects(speech.audio('second'), /busy/);
  finish([]);
  await first;
});
