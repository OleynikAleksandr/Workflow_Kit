import { SpeechResampler } from './resampler.js';
// At most 1.6 seconds / 102400 bytes may await the main thread. Its ack means
// synchronous handoff to the separately bounded WebSocket queue, not inference.
const MAX_PENDING = 8;
class SpeechWorklet extends AudioWorkletProcessor {
  constructor() {
    super(); this.resampler = new SpeechResampler(sampleRate); this.active = true;
    this.pending = new Set(); this.sequence = 0;
    this.port.onmessage = event => {
      if (event.data?.type === 'ack') { this.pending.delete(event.data.sequence); return; }
      if (event.data !== 'finish' || !this.active) return;
      this.active = false;
      for (const pcm of this.resampler.finish()) if (!this.emit(pcm)) return;
      this.port.postMessage({ type: 'flushed' });
    };
  }
  emit(pcm) {
    if (this.pending.size >= MAX_PENDING) {
      this.active = false; this.port.postMessage({ type: 'overload' }); return false;
    }
    const sequence = this.sequence++;
    this.pending.add(sequence); this.port.postMessage({ type: 'audio', pcm, sequence }, [pcm.buffer]);
    return true;
  }
  process(inputs) {
    if (!this.active) return false;
    const channels = inputs[0];
    if (!channels?.length || !channels[0]?.length) return true;
    const mono = new Float32Array(channels[0].length);
    for (const channel of channels) for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
    for (const pcm of this.resampler.push(mono)) if (!this.emit(pcm)) return false;
    return true;
  }
}
registerProcessor('wfk-speech', SpeechWorklet);
