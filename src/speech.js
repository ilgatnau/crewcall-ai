import { getAllAudioBase64 } from '@sefinek/google-tts-api';

export class Speech {
  constructor(synthesize = getAllAudioBase64) { this.synthesize = synthesize; this.pending = null; }
  async audio(text) {
    if (this.pending) throw new Error('Speech synthesis is busy. Try again shortly.');
    const task = Promise.resolve().then(() => this.synthesize(text, { lang: 'en', timeout: 10000 }));
    this.pending = task;
    try {
      const parts = await task;
      return Buffer.concat(parts.map(part => Buffer.from(part.base64, 'base64')));
    } finally { this.pending = null; }
  }
}
