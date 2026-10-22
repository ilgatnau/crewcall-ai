import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const base = `http://127.0.0.1:${process.env.PORT || 3210}`;
export async function request(path, data) {
  const options = data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Token': (await (await fetch(base + '/api/token')).json()).token }, body: JSON.stringify(data) } : {};
  const response = await fetch(base + path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'say') result = await request('/api/instructions', { text: args.join(' ') });
  else if (command === 'ready' || command === 'clear') result = await request('/api/' + command, { name: args.join(' ') });
  else if (command === 'list') result = await request('/api/state');
  else if (command === 'respond') {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 20000) throw new Error('Response input is too large.');
    }
    result = await request('/api/responses', { ...JSON.parse(input), name: args.join(' ') });
  } else {
    console.log('Usage: npm run agent -- list | say "Agent Thomas, run tests" | ready Thomas | clear Thomas | respond Thomas < response.json');
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
