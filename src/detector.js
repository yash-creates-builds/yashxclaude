import { makeFrameReader } from './audio.js';

export const DEFAULTS = {
  band: [1500, 6000], // Hz — where a cooker whistle lives
  ratioMin: 0.45,     // share of energy that must be in the band
  marginDb: 10,       // how much louder than the kitchen's normal noise
  minDuration: 0.8,   // seconds the sound must last
  cooldown: 6,        // seconds to ignore after a count (one whistle = one count)
  learnTime: 3,       // seconds spent learning ambient noise
};

const SENSITIVITY = {
  low: { margin: 1.35, ratio: 1.15, dur: 1.25 },
  normal: { margin: 1, ratio: 1, dur: 1 },
  high: { margin: 0.7, ratio: 0.85, dur: 0.8 },
};

const FRAME_MS = 50;
const GAP_TOLERANCE = 0.25; // a whistle may flutter; allow short dips

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Builds the thresholds from defaults + saved calibration + sensitivity. */
export function buildParams(calib, sensitivity = 'normal') {
  const s = SENSITIVITY[sensitivity] ?? SENSITIVITY.normal;
  const p = { ...DEFAULTS };
  if (calib) {
    p.band = calib.band;
    p.ratioMin = clamp(calib.ratio * 0.6, 0.2, 0.75);
    p.marginDb = clamp(calib.snrDb * 0.5, 6, 20);
  }
  p.ratioMin = clamp(p.ratioMin * s.ratio, 0.15, 0.9);
  p.marginDb *= s.margin;
  p.minDuration *= s.dur;
  return p;
}

/**
 * Heuristic whistle detector.
 * A whistle = (band energy ratio high) AND (louder than ambient) AND (lasts ≥ minDuration).
 * The AI layer can add a vote through setAiScore().
 */
export class WhistleDetector {
  constructor(mic, params, { onWhistle, onPhase } = {}) {
    this.mic = mic;
    this.params = params;
    this.onWhistle = onWhistle;
    this.onPhase = onPhase;
    this.read = makeFrameReader(mic);
    this.live = { levelDb: -90, ratio: 0, baseline: -60, threshold: -50, ratioMin: params.ratioMin, progress: 0, hot: false, ai: 0, phase: 'learning', learnProgress: 0, cooldownLeft: 0 };
    this.aiScore = 0;
    this.aiAt = 0;
    this.aiThreshold = 0.3;
  }

  start() {
    this.t0 = performance.now();
    this.learnLevels = [];
    this.learnRatios = [];
    this.baseline = null;
    this.active = false;
    this.activeStart = 0;
    this.lastHot = 0;
    this.cooldownUntil = 0;
    this.setPhase('learning');
    this.timer = setInterval(() => this.tick(), FRAME_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  setPhase(p) {
    if (this.live.phase === p && this.baseline != null) return;
    this.live.phase = p;
    this.onPhase?.(p);
  }

  /** AI vote (0..1). Treated as "hot" for ~0.8s after it arrives. */
  setAiScore(score) {
    this.aiScore = score;
    this.aiAt = performance.now();
  }

  tick() {
    const now = performance.now();
    const t = (now - this.t0) / 1000;
    const p = this.params;
    const f = this.read(p.band);
    const L = this.live;
    L.levelDb = f.levelDb;
    L.ratio = f.ratio;

    // 1) Learn the kitchen's normal noise.
    if (this.baseline == null) {
      this.learnLevels.push(f.levelDb);
      this.learnRatios.push(f.ratio);
      L.learnProgress = Math.min(1, t / p.learnTime);
      if (t >= p.learnTime) {
        this.baseline = median(this.learnLevels);
        const baseRatio = median(this.learnRatios);
        // If the kitchen is already hissing in the whistle band, demand a clearer signal.
        this.ratioMin = clamp(Math.max(p.ratioMin, baseRatio + 0.15), 0.15, 0.9);
        L.ratioMin = this.ratioMin;
        this.setPhase('listening');
      }
      L.baseline = median(this.learnLevels);
      L.threshold = L.baseline + p.marginDb;
      return;
    }

    const threshold = this.baseline + p.marginDb;
    const loud = f.levelDb >= threshold;
    const tonal = f.ratio >= this.ratioMin;
    const aiFresh = now - this.aiAt < 800;
    const aiHot = aiFresh && this.aiScore >= this.aiThreshold && f.levelDb >= this.baseline + 3;
    L.ai = aiFresh ? this.aiScore : 0;
    const hot = (loud && tonal) || aiHot;
    L.hot = hot;

    // 2) Cooldown after a count.
    if (now < this.cooldownUntil) {
      L.cooldownLeft = (this.cooldownUntil - now) / 1000;
      L.progress = 0;
      this.active = false;
      if (L.phase !== 'cooldown') this.setPhase('cooldown');
      return;
    }
    L.cooldownLeft = 0;

    // 3) Slowly follow the ambient noise (only on quiet frames, so whistles don't raise it).
    if (!hot && !this.active && f.levelDb < this.baseline + p.marginDb / 2) {
      this.baseline = this.baseline * 0.995 + f.levelDb * 0.005;
    }
    L.baseline = this.baseline;
    L.threshold = threshold;

    // 4) Is it sustained?
    if (hot) {
      if (!this.active) { this.active = true; this.activeStart = now; }
      this.lastHot = now;
    } else if (this.active && (now - this.lastHot) / 1000 > GAP_TOLERANCE) {
      this.active = false;
    }

    const dur = this.active ? (now - this.activeStart) / 1000 : 0;
    L.progress = clamp(dur / p.minDuration, 0, 1);
    this.setPhase(this.active ? 'hearing' : 'listening');

    if (this.active && dur >= p.minDuration) {
      this.active = false;
      this.cooldownUntil = now + p.cooldown * 1000;
      L.progress = 0;
      this.setPhase('cooldown');
      this.onWhistle?.({ source: aiHot && !(loud && tonal) ? 'ai' : 'sound', at: new Date() });
    }
  }

  /** Call after a manual +1 so the same whistle isn't counted again. */
  pauseFor(seconds) {
    this.cooldownUntil = performance.now() + seconds * 1000;
    this.active = false;
  }
}

/**
 * Calibration: learn ambient for 3s, then wait for one whistle,
 * and measure its loudness above ambient + main frequency band.
 */
export function calibrate(mic, { onUpdate, onDone, onFail, timeoutSec = 90 }) {
  const read = makeFrameReader(mic);
  const t0 = performance.now();
  const learn = [];
  let baseline = null;
  let loudFrames = []; // {levelDb, power copy}
  let lastLoud = 0;
  let stopped = false;

  const finish = () => {
    stopped = true;
    clearInterval(timer);
    const n = loudFrames.length;
    if (n * FRAME_MS < 500) return onFail?.('short');
    const binHz = loudFrames[0].binHz;
    const avg = new Float32Array(loudFrames[0].power.length);
    loudFrames.forEach((fr) => fr.power.forEach((v, i) => { avg[i] += v / n; }));
    let peak = 0, peakBin = 0;
    for (let i = 0; i < avg.length; i++) {
      const hz = i * binHz;
      if (hz < 500 || hz > 9000) continue;
      if (avg[i] > peak) { peak = avg[i]; peakBin = i; }
    }
    const peakHz = peakBin * binHz;
    const band = [Math.round(Math.max(400, peakHz * 0.7)), Math.round(Math.min(10000, peakHz * 1.45))];
    // Ratio of energy in that band during the whistle.
    let inBand = 0, total = 0;
    const start = Math.ceil(80 / binHz);
    for (let i = start; i < avg.length; i++) {
      total += avg[i];
      const hz = i * binHz;
      if (hz >= band[0] && hz <= band[1]) inBand += avg[i];
    }
    const levels = loudFrames.map((f) => f.levelDb).sort((a, b) => a - b);
    const level = levels[Math.floor(levels.length / 2)];
    onDone?.({
      band,
      peakHz: Math.round(peakHz),
      ratio: total > 0 ? inBand / total : 0.5,
      snrDb: level - baseline,
      durationSec: (n * FRAME_MS) / 1000,
      at: Date.now(),
    });
  };

  const timer = setInterval(() => {
    if (stopped) return;
    const now = performance.now();
    const t = (now - t0) / 1000;
    const f = read(DEFAULTS.band);
    if (baseline == null) {
      learn.push(f.levelDb);
      onUpdate?.({ phase: 'learning', progress: Math.min(1, t / 3), levelDb: f.levelDb });
      if (t >= 3) baseline = median(learn);
      return;
    }
    const isLoud = f.levelDb > baseline + 8;
    if (isLoud) {
      loudFrames.push({ levelDb: f.levelDb, power: Float32Array.from(f.power), binHz: f.binHz });
      lastLoud = now;
    }
    const heardSec = (loudFrames.length * FRAME_MS) / 1000;
    onUpdate?.({ phase: isLoud ? 'hearing' : 'waiting', levelDb: f.levelDb, baseline, heardSec, peakHz: f.peakHz });
    // A whistle that lasted ≥ 0.8s and then stopped for 0.7s → done.
    if (heardSec >= 0.8 && now - lastLoud > 700) finish();
    // Short blips (a spoon, a door) — forget them.
    if (heardSec > 0 && heardSec < 0.8 && now - lastLoud > 700) loudFrames = [];
    if (t > timeoutSec) { stopped = true; clearInterval(timer); onFail?.('timeout'); }
  }, FRAME_MS);

  return {
    finishNow: () => { if (!stopped) finish(); },
    cancel: () => { stopped = true; clearInterval(timer); },
  };
}
