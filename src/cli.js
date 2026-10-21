const base = `http://127.0.0.1:${process.env.PORT || 3210}`;
async function request(path, data) {
  const options = data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Token': (await (await fetch(base + '/api/token')).json()).token }, body: JSON.stringify(data) } : {};
  const response = await fetch(base + path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  console.log(JSON.stringify(result, null, 2));
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'say') await request('/api/instructions', { text: args.join(' ') });
  else if (command === 'ready' || command === 'clear') await request('/api/' + command, { name: args.join(' ') });
  else if (command === 'list') await request('/api/state');
  else console.log('Usage: npm run agent -- list | say "Agent Thomas, run tests" | ready Thomas | clear Thomas');
} catch (error) { console.error(error.message); process.exitCode = 1; }
