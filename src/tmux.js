import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
const exec = promisify(execFile);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
export class Tmux {
  async run(args) {
    try { return (await exec('tmux', args, { timeout: 10000, maxBuffer: 1024 * 1024 })).stdout.trim(); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error('tmux is not installed. On macOS run: brew install tmux');
      throw new Error(error.stderr?.trim() || error.message);
    }
  }
  async list() {
    try {
      const output = await this.run(['list-panes', '-a', '-F', '#{session_name}\t#{pane_id}\t#{pane_dead}\t#{pane_current_command}']);
      return output ? output.split('\n').map(line => { const [session, id, dead, process] = line.split('\t'); return { session, id, dead: dead === '1', process }; }) : [];
    } catch (error) {
      if (/no server running|no sessions|error connecting to/.test(error.message)) return [];
      throw error;
    }
  }
  async create(profile) {
    const cwd = profile.cwd.replace(/^~(?=\/|$)/, homedir());
    // A dedicated supervisor script keeps the pane inspectable after agent exit.
    const script = `tmux set-option -p remain-on-exit on; exec ${profile.command.map(quote).join(' ')}`;
    await this.run(['new-session', '-d', '-s', profile.session, '-c', cwd, '/bin/sh', '-lc', script]);
    return (await this.list()).filter(p => p.session === profile.session)[0];
  }
  async send(pane, instruction) {
    await this.run(['send-keys', '-t', pane, '-l', '--', instruction]);
    await this.run(['send-keys', '-t', pane, 'Enter']);
  }
}
export class DemoTmux {
  panes = [];
  async list() { return this.panes; }
  async create(profile) { const pane = { session: profile.session, id: `%${this.panes.length}`, dead: false, process: 'demo-agent' }; this.panes.push(pane); return pane; }
  async send() {}
}
