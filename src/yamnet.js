// Optional AI layer: YAMNet (Google's free sound classifier, 521 sound types) running in the browser.
// Loaded lazily so the app opens fast; cached in IndexedDB + the service worker for offline use.

const MODEL_URLS = [
  // Self-hosted copy (optional): put model.json + shards in public/models/yamnet/
  { url: '/models/yamnet/model.json', tfhub: false },
  { url: 'https://www.kaggle.com/models/google/yamnet/TfJs/tfjs/1', tfhub: true },
  { url: 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1', tfhub: true },
];
const IDB_KEY = 'indexeddb://seeti-yamnet-v1';

// YAMNet class indices (from yamnet_class_map.csv) that sound like a cooker whistle.
export const WHISTLE_CLASSES = {
  35: 'Whistling',
  79: 'Hiss',
  290: 'Steam',
  324: 'Train whistle',
  396: 'Whistle',
  397: 'Steam whistle',
};
const CLASS_IDS = Object.keys(WHISTLE_CLASSES).map(Number);
const TARGET_SR = 16000;

let tf = null;
let model = null;
let loading = null;

async function loadModel() {
  tf = await import('@tensorflow/tfjs');
  try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
  await tf.ready();

  try {
    model = await tf.loadGraphModel(IDB_KEY);
    return model;
  } catch { /* not cached yet */ }

  let lastErr;
  for (const src of MODEL_URLS) {
    try {
      if (!src.tfhub) {
        const head = await fetch(src.url, { method: 'HEAD' });
        if (!head.ok || !(head.headers.get('content-type') || '').includes('json')) continue;
      }
      model = await tf.loadGraphModel(src.url, { fromTFHub: src.tfhub });
      try { await model.save(IDB_KEY); } catch { /* storage full — fine */ }
      return model;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Could not load YAMNet');
}

export function preloadYamnet() {
  if (!loading) loading = loadModel().catch((e) => { loading = null; throw e; });
  return loading;
}

/** Simple resampler (averaging) to 16 kHz mono, which YAMNet expects. */
function resample(input, fromRate) {
  const ratio = fromRate / TARGET_SR;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let j = 0; j < outLen; j++) {
    const a = Math.floor(j * ratio);
    const b = Math.min(input.length, Math.floor((j + 1) * ratio));
    let s = 0;
    for (let i = a; i < b; i++) s += input[i];
    out[j] = b > a ? s / (b - a) : input[a] || 0;
  }
  return out;
}

/**
 * Starts classifying 1-second windows every 0.5s.
 * onScore(score, label) gets the best whistle-like confidence (0..1).
 */
export async function startYamnet(mic, onScore) {
  await preloadYamnet();
  const ok = await mic.enablePcmTap();
  if (!ok) throw new Error('AudioWorklet not supported');

  const sr = mic.sampleRate;
  const ring = new Float32Array(sr); // last 1 second
  let write = 0;
  let filled = 0;
  const off = mic.onPcm((chunk) => {
    for (let i = 0; i < chunk.length; i++) {
      ring[write] = chunk[i];
      write = (write + 1) % ring.length;
    }
    filled = Math.min(ring.length, filled + chunk.length);
  });

  let busy = false;
  let stopped = false;
  const timer = setInterval(async () => {
    if (busy || stopped || filled < ring.length) return;
    busy = true;
    try {
      const ordered = new Float32Array(ring.length);
      ordered.set(ring.subarray(write));
      ordered.set(ring.subarray(0, write), ring.length - write);
      const wave = resample(ordered, sr);
      const input = tf.tensor1d(wave);
      let out = model.predict(input);
      const scoresT = Array.isArray(out) ? out[0] : out;
      const scores = await scoresT.data();
      const frames = scores.length / 521;
      let best = 0, bestId = null;
      for (let f = 0; f < frames; f++) {
        for (const id of CLASS_IDS) {
          const v = scores[f * 521 + id];
          if (v > best) { best = v; bestId = id; }
        }
      }
      tf.dispose([input, ...(Array.isArray(out) ? out : [out])]);
      if (!stopped) onScore(best, bestId != null ? WHISTLE_CLASSES[bestId] : null);
    } catch (e) {
      console.warn('YAMNet frame failed', e);
    } finally {
      busy = false;
    }
  }, 500);

  return () => { stopped = true; clearInterval(timer); off(); };
}
