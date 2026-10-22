export function validateConfig(config) {
  if (!Array.isArray(config.agents) || !config.agents.length) throw new Error('Configure at least one agent.');
  const names = new Set(), sessions = new Set();
  for (const p of config.agents) {
    if (typeof p.name !== 'string' || !/^[a-z][a-z0-9 -]*$/i.test(p.name)) throw new Error('Agent names must start with a letter and contain letters, numbers, spaces or hyphens.');
    if (!/^[a-zA-Z0-9_-]+$/.test(p.session)) throw new Error(`Invalid session for ${p.name}`);
    if (sessions.has(p.session)) throw new Error('Each agent needs a distinct session.');
    sessions.add(p.session);
    if (typeof p.cwd !== 'string' || !p.cwd || !Array.isArray(p.command) || !p.command.length || p.command.some(x => typeof x !== 'string' || !x || x.includes('\0'))) throw new Error(`Invalid launch configuration for ${p.name}`);
    if (p.pane != null && !/^%\d+$/.test(p.pane)) throw new Error('Pane must be a tmux pane ID such as %3.');
    if (p.aliases != null && !Array.isArray(p.aliases)) throw new Error('Aliases must be an array.');
    for (const name of [p.name, ...(p.aliases || [])]) {
      if (typeof name !== 'string' || !name.trim()) throw new Error('Invalid alias.');
      const key = name.toLowerCase().trim();
      if (names.has(key)) throw new Error(`Duplicate name or alias: ${name}`);
      names.add(key);
    }
  }
  return config;
}
export class Supervisor {
  constructor(config, tmux, formatInstruction = instruction => instruction) {
    this.formatInstruction = formatInstruction;
    this.profiles = validateConfig(config).agents;
    this.tmux = tmux;
    this.states = new Map(this.profiles.map(p => [p.name, { status: 'unverified', pane: null, queue: [], last: '', error: null }]));
    this.locks = new Map();
  }
  profile(name) {
    const p = this.profiles.find(p => [p.name, ...(p.aliases || [])].some(n => n.toLowerCase() === name.toLowerCase()));
    if (!p) throw new Error(`Unknown agent: ${name}`);
    return p;
  }
  parse(text) {
    const input = text.trim().replace(/^agent\s+/i, '');
    const candidates = this.profiles.flatMap(p => [p.name, ...(p.aliases || [])].map(n => ({ p, n }))).sort((a,b) => b.n.length - a.n.length);
    for (const { p, n } of candidates) {
      if (input.slice(0, n.length).toLowerCase() === n.toLowerCase() && /^[\s,:.!?-]/.test(input.slice(n.length))) {
        const instruction = input.slice(n.length).replace(/^[\s,:.!?-]+/, '').trim();
        if (instruction) return { name: p.name, instruction };
      }
    }
    throw new Error('Start with a configured agent name and an instruction, e.g. “Agent Thomas, run the tests”.');
  }
  async locked(name, fn) {
    const previous = this.locks.get(name) || Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.locks.set(name, next);
    try { return await next; } finally { if (this.locks.get(name) === next) this.locks.delete(name); }
  }
  async inspect(profile, create) {
    const state = this.states.get(profile.name);
    const panes = (await this.tmux.list()).filter(p => p.session === profile.session);
    let pane = profile.pane ? panes.find(p => p.id === profile.pane) : panes.length === 1 ? panes[0] : null;
    if (panes.length && !pane) throw new Error('Session has multiple panes or the configured pane is missing. Set its pane ID in config.local.json.');
    if (!pane && create) {
      if (profile.pane) throw new Error('Bound session is missing. Remove the pane binding before creating a replacement.');
      pane = await this.tmux.create(profile);
    }
    if (!pane) { state.status = 'missing'; state.pane = null; return state; }
    if (pane.dead) { state.status = 'stopped'; state.pane = pane.id; throw new Error('Agent process exited. Inspect the terminal and restart it manually, then confirm readiness.'); }
    if (state.pane !== pane.id || ['missing', 'stopped', 'unverified'].includes(state.status)) state.status = 'awaiting-ready';
    state.pane = pane.id;
    return state;
  }
  async drain(state, name) {
    if (state.status !== 'ready' || !state.queue.length) return;
    const instruction = state.queue[0];
    // If submission partially fails, require human inspection before retrying.
    state.status = 'busy';
    try { await this.tmux.send(state.pane, this.formatInstruction(instruction, name)); state.queue.shift(); state.last = instruction; }
    catch (error) { state.status = 'delivery-uncertain'; throw error; }
  }
  async submit(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 16000 || /[\x00-\x1f\x7f]/.test(text)) throw new Error('Use a single-line instruction of 1–16000 characters.');
    const { name, instruction } = this.parse(text);
    return this.locked(name, async () => {
      const state = this.states.get(name);
      if (state.queue.length >= 100) throw new Error('Agent queue is full.');
      state.queue.push(instruction);
      try { await this.inspect(this.profile(name), true); await this.drain(state, name); state.error = null; }
      catch (error) { state.error = error.message; throw error; }
      return this.snapshot();
    });
  }
  async ready(name) {
    const profile = this.profile(name);
    return this.locked(profile.name, async () => {
      const state = await this.inspect(profile, false);
      if (!state.pane) throw new Error('No session exists. Send an instruction first.');
      if (state.status === 'delivery-uncertain') throw new Error('Delivery was uncertain. Clear the queue and inspect the terminal before confirming readiness.');
      state.status = 'ready'; state.error = null;
      await this.drain(state, profile.name);
      return this.snapshot();
    });
  }
  async clear(name) {
    const p = this.profile(name);
    return this.locked(p.name, async () => { const s = this.states.get(p.name); s.queue = []; s.status = 'unverified'; s.error = null; return this.snapshot(); });
  }
  snapshot() { return this.profiles.map(p => ({ name: p.name, session: p.session, ...this.states.get(p.name), queue: [...this.states.get(p.name).queue] })); }
}
