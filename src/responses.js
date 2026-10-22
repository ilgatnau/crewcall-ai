import { randomUUID } from 'node:crypto';

export class Responses {
  constructor(names) { this.names = new Set(names); this.latest = new Map(); }
  publish({ name, text, voice = '', append = false }) {
    if (!this.names.has(name)) throw new Error('Unknown response agent.');
    if (typeof text !== 'string' || !text.trim() || text.length > 16000) throw new Error('Response text must contain 1–16000 characters.');
    if (typeof voice !== 'string' || voice.length > 300 || voice.trim().split(/\s+/).length > 35 || /[\x00-\x1f\x7f]/.test(voice)) throw new Error('Voice summary must be a single line of at most 35 words and 300 characters.');
    if (typeof append !== 'boolean') throw new Error('append must be a boolean.');
    const previous = this.latest.get(name);
    const combined = append ? (previous?.text || '') + text : text;
    if (combined.length > 16000) throw new Error('Combined response exceeds 16000 characters.');
    const response = { id: randomUUID(), name, text: combined, voice: voice.trim(), time: new Date().toISOString() };
    this.latest.set(name, response);
    return response;
  }
  snapshot() { return [...this.latest.values()]; }
  get(name, id) {
    const response = this.latest.get(name);
    if (!response || response.id !== id || !response.voice) throw new Error('Spoken response is unavailable. Refresh the dashboard.');
    return response;
  }
}

const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
export function responsePrompt(instruction, name, cli, node) {
  const command = [node, cli, 'respond', name].map(quote).join(' ');
  return [
    'You are connected to CrewCall. Show useful written progress and a detailed final text response.',
    'Report responses by executing this command with a JSON object on stdin: ' + command + '.',
    'The JSON fields are text (required), voice (optional), and append (optional boolean, default false).',
    'Report progress using text only; replace the displayed response by default or use append:true for incremental text chunks.',
    'At completion, a blocker, or a decision, report the full text plus a separate voice summary of 1–2 short sentences, at most 35 words and 300 characters.',
    'Lead speech with the outcome or the one question needing input. Omit code, paths, URLs, formatting, routine acknowledgments, and spoken progress.',
    'Be truthful about completed work and failed checks. Do not read the full text aloud.',
    'Reporting a response does not confirm readiness; the user controls the queue.',
    'User instruction: ' + instruction
  ].join(' ');
}
