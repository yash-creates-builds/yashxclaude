// Opens the microphone and exposes an AnalyserNode (+ optional raw PCM tap for the AI model).

const TAP_WORKLET = `
class SeetiTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('seeti-tap', SeetiTap);
`;

export async function openMic() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('This browser cannot use the microphone (needs HTTPS).'), { code: 'unsupported' });
  }
  // Turn OFF voice-call processing: noise suppression treats a steady whistle as "noise" and removes it.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.25;
  analyser.minDecibels = -110;
  analyser.maxDecibels = -10;
  source.connect(analyser);

  // Some browsers only process nodes that lead to the speakers — connect through a muted gain.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  analyser.connect(mute).connect(ctx.destination);

  let tapNode = null;
  const pcmListeners = new Set();

  async function enablePcmTap() {
    if (tapNode || !ctx.audioWorklet) return !!tapNode;
    const url = URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    tapNode = new AudioWorkletNode(ctx, 'seeti-tap');
    tapNode.port.onmessage = (e) => pcmListeners.forEach((fn) => fn(e.data));
    source.connect(tapNode);
    tapNode.connect(mute);
    return true;
  }

  return {
    stream,
    ctx,
    analyser,
    sampleRate: ctx.sampleRate,
    enablePcmTap,
    onPcm(fn) { pcmListeners.add(fn); return () => pcmListeners.delete(fn); },
    async resume() { if (ctx.state === 'suspended') await ctx.resume(); },
    close() {
      pcmListeners.clear();
      stream.getTracks().forEach((t) => t.stop());
      try { ctx.close(); } catch { /* ignore */ }
    },
  };
}

/** Reads one analysis frame: loudness + how much energy sits in a frequency band. */
export function makeFrameReader(mic) {
  const { analyser, sampleRate } = mic;
  const freq = new Float32Array(analyser.frequencyBinCount);
  const time = new Float32Array(analyser.fftSize);
  const binHz = sampleRate / analyser.fftSize;
  const power = new Float32Array(analyser.frequencyBinCount);

  return function read(band) {
    analyser.getFloatTimeDomainData(time);
    analyser.getFloatFrequencyData(freq);
    let sq = 0;
    for (let i = 0; i < time.length; i++) sq += time[i] * time[i];
    const rms = Math.sqrt(sq / time.length);
    const levelDb = 20 * Math.log10(rms + 1e-9);

    const lo = Math.floor(band[0] / binHz);
    const hi = Math.ceil(band[1] / binHz);
    const start = Math.ceil(80 / binHz); // ignore DC / rumble
    let total = 0, inBand = 0, peakP = 0, peakBin = 0;
    for (let i = start; i < freq.length; i++) {
      const p = Number.isFinite(freq[i]) ? Math.pow(10, freq[i] / 10) : 0;
      power[i] = p;
      total += p;
      if (i >= lo && i <= hi) inBand += p;
      if (p > peakP && i * binHz > 300 && i * binHz < 9000) { peakP = p; peakBin = i; }
    }
    return {
      levelDb,
      ratio: total > 0 ? inBand / total : 0,
      peakHz: peakBin * binHz,
      power, // shared buffer — copy if you keep it
      binHz,
    };
  };
}
