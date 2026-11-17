// Stateful, windowed-sinc low-pass resampling. A packet boundary is not an audio boundary.
export class SpeechResampler {
  constructor(inputRate, outputRate = 16000, packetSize = 3200) {
    if (!Number.isFinite(inputRate) || inputRate < outputRate || inputRate > 192000) throw new Error('Неподдерживаемая частота микрофона');
    this.ratio = inputRate / outputRate;
    this.radius = 24;
    this.cutoff = .45 / this.ratio;
    this.samples = [];
    this.start = 0;
    this.position = 0;
    this.totalInput = 0;
    this.totalOutput = 0;
    this.packet = [];
    this.packetSize = packetSize;
    this.finished = false;
  }
  push(samples) {
    if (this.finished) throw new Error('Audio already finished');
    for (const sample of samples) { if (!Number.isFinite(sample)) throw new Error('Неверный аудиосигнал'); this.samples.push(sample); }
    this.totalInput += samples.length;
    return this.drain(false);
  }
  drain(final) {
    const packets = [], limit = Math.round(this.totalInput / this.ratio);
    while (final ? this.totalOutput < limit : this.position + this.radius < this.totalInput) {
      let value = 0, sum = 0;
      const center = Math.floor(this.position);
      for (let i = center - this.radius + 1; i <= center + this.radius; i++) {
        const d = i - this.position, x = 2 * this.cutoff * d;
        const sinc = Math.abs(x) < 1e-10 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const weight = 2 * this.cutoff * sinc * (.5 + .5 * Math.cos(Math.PI * d / this.radius));
        value += (this.samples[i - this.start] ?? 0) * weight; sum += weight;
      }
      this.packet.push(value / sum);
      this.totalOutput++; this.position = this.totalOutput * this.ratio;
      if (this.packet.length === this.packetSize) { packets.push(Float32Array.from(this.packet)); this.packet = []; }
    }
    const consumed = Math.max(0, Math.floor(this.position) - this.radius - this.start);
    this.samples.splice(0, consumed); this.start += consumed;
    if (final && this.packet.length) { packets.push(Float32Array.from(this.packet)); this.packet = []; }
    return packets;
  }
  finish() { if (this.finished) return []; this.finished = true; return this.drain(true); }
}
