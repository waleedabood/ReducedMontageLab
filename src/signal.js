// Reduced Montage Lab signal generator: one seeded 64-s synthetic recording at every electrode.
// The record is a sum of scalp potentials (µV, referential to an ideal distant reference):
// - background: spatially correlated coloured noise from many cortical patches, awake (low-voltage, fast)
//   cross-fading into N2 sleep (higher-voltage theta/delta);
// - posterior dominant rhythm (PDR): ~10 Hz from occipital and parietal patches with small phase lags, waxing and
//   waning, blocked by eye opening, briefly faster just after eye closure (alpha squeak), fading in drowsiness;
// - sleep spindles: 12-14 Hz waxing-waning bursts with a central/vertex field from several patches;
// - eye potentials: blinks (cornea moves up under the lid, Bell's phenomenon → positive at Fp1/Fp2) and the
//   slower eye-closure/eye-opening deflections.
// Each component keeps its own array so the visibility panel can measure it alone in any montage.
import {electrodes} from './montages.js';

const TAU = 2 * Math.PI;
/** Samples per second. */
export const FS = 256;
/** Samples per record (a power of two for the FFT): 64 s. */
export const N = 16384;
/** Record length in seconds. */
export const DURATION = N / FS;

/** Seeded uniform generator (mulberry32). */
export function rng32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = rand => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand()); };
const gauss = (x, m, w) => Math.exp(-.5 * ((x - m) / w) ** 2);
const smoothstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// In-place iterative radix-2 FFT (length must be a power of two).
function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? TAU : -TAU) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Stationary Gaussian noise of N samples with amplitude spectrum shape(f), scaled to unit RMS. */
export function shapedNoise(rand, shape) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 1; k < N / 2; k++) {
    const a = shape(k * FS / N);
    if (!a) continue;
    re[k] = a * normal(rand); im[k] = a * normal(rand);
    re[N - k] = re[k]; im[N - k] = -im[k];
  }
  fft(re, im, true);
  let ss = 0;
  for (let i = 0; i < N; i++) ss += re[i] * re[i];
  const k = 1 / Math.sqrt(ss / N || 1), out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = re[i] * k;
  return out;
}

// Background spectra (amplitude, not power). Both are band-limited to roughly 0.5-40 Hz like a displayed EEG.
const band = f => smoothstep(.3, .8, f) * (1 - smoothstep(35, 45, f));
const AWAKE_SPECTRUM = f => band(f) * (f ** -.7 + .35 * gauss(f, 20, 5) / 20 ** .7);
const SLEEP_SPECTRUM = f => band(f) * (f ** -1.25 + .9 * gauss(f, 5, 1.6) / 5 ** 1.25);

/** Scalp field of a cortical patch centred at (cx, cy) with spread sigma (projection units), sampled at every electrode. */
export function patchField(cx, cy, sigma) {
  return electrodes.map(([, x, y]) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma ** 2)));
}

// The scripted 64-s tour. Times in seconds.
export const SCRIPT = {
  eyesClose: [4, 26],
  eyesOpen: [19],
  blinks: [0.9, 2.6, 20.1, 21.7, 23.4, 24.9],
  drowsy: 33, // PDR fades and background slows from here
  n2: 39, // N2 sleep from here
  spindles: [[40.6, 1.0, 13.2], [43.9, 1.3, 12.6], [47.3, .8, 13.8], [50.2, 1.1, 12.9], [54, 1.4, 13.4],
    [57.5, .9, 12.3], [61.2, 1.2, 13.6]], // [start, duration, Hz]
};

/** Chapters offered as quick jumps: [label, page start s, what to look for]. */
export const CHAPTERS = [
  {id: 'pdr', label: 'PDR & eye closure', start: 0, hint: 'Eyes open with two blinks, then eye closure at 4 s brings in the posterior dominant rhythm.'},
  {id: 'blinks', label: 'Eye opening & blinks', start: 16, hint: 'Eye opening at 19 s blocks the PDR; four blinks follow; the eyes close again at 26 s.'},
  {id: 'drowsy', label: 'Drowsiness', start: 30, hint: 'The PDR drops out and the background slows from 33 s into N2 sleep at 39 s.'},
  {id: 'spindles', label: 'N2 · spindles', start: 40, hint: 'Sleep spindles: 12-14 Hz waxing-waning bursts with a central/vertex maximum.'},
];

// Eye-closure window helper: is time t (s) inside an eyes-closed stretch that precedes drowsiness?
function eyesClosedAt(t) {
  const marks = [...SCRIPT.eyesClose.map(x => [x, 1]), ...SCRIPT.eyesOpen.map(x => [x, 0])].sort((a, b) => a[0] - b[0]);
  let closed = 0, since = -Infinity;
  for (const [x, v] of marks) if (t >= x) { closed = v; since = x; }
  return {closed, since};
}

// Blink waveform at time u (s) after onset: fast rise (~0.1 s) and slower fall (~0.25 s), peak 1.
function blinkWave(u) {
  if (u < 0 || u > .38) return 0;
  if (u < .1) { const s = Math.sin(Math.PI / 2 * u / .1); return s * s; }
  const s = Math.cos(Math.PI / 2 * (u - .1) / .28); return s * s;
}

/**
 * Generates the full record. Returns {fs, n, duration, data, parts, events}:
 * data[e] is the summed signal at electrode e (Float32Array, µV); parts.{background,pdr,spindle,eye}[e] the same
 * for one component; events lists annotations {t, end, type, label}.
 */
export function generateRecord(seed = 20261026) {
  const rand = rng32(seed);
  const E = electrodes.length;
  const zero = () => Array.from({length: E}, () => new Float32Array(N));
  const parts = {background: zero(), pdr: zero(), spindle: zero(), eye: zero()};
  const time = i => i / FS;
  // Sleep weight of the background: 0 awake → 1 in N2.
  const sleepWeight = t => smoothstep(SCRIPT.drowsy + 1, SCRIPT.n2, t);

  // --- background: cortical patches spread over the head, each with its own awake and sleep noise.
  const patches = [];
  for (let k = 0; k < 22; k++) {
    const r = 1.15 * Math.sqrt(rand()), a = TAU * rand();
    patches.push(patchField(r * Math.sin(a), r * Math.cos(a), .42));
  }
  // Per-electrode scaling so every electrode has the same background RMS.
  const norm = Array.from({length: E}, (_, e) => 1 / Math.sqrt(patches.reduce((s, p) => s + p[e] ** 2, 0)));
  const AWAKE_UV = 9, SLEEP_UV = 15, LOCAL_UV = 1.6;
  const wAwake = new Float32Array(N), wSleep = new Float32Array(N);
  for (let i = 0; i < N; i++) { const w = sleepWeight(time(i)); wAwake[i] = Math.cos(w * Math.PI / 2); wSleep[i] = Math.sin(w * Math.PI / 2); }
  for (const field of patches) {
    const awake = shapedNoise(rand, AWAKE_SPECTRUM), sleep = shapedNoise(rand, SLEEP_SPECTRUM);
    for (let e = 0; e < E; e++) {
      const g = field[e] * norm[e];
      if (g < 1e-4) continue;
      const out = parts.background[e];
      for (let i = 0; i < N; i++) out[i] += g * (AWAKE_UV * wAwake[i] * awake[i] + SLEEP_UV * wSleep[i] * sleep[i]);
    }
  }
  for (let e = 0; e < E; e++) { // small independent electrode noise
    const local = shapedNoise(rand, f => band(f) * f ** -.3), out = parts.background[e];
    for (let i = 0; i < N; i++) out[i] += LOCAL_UV * local[i];
  }

  // --- posterior dominant rhythm.
  const PDR_UV = 30;
  const drift = shapedNoise(rand, f => gauss(f, 0, .15)); // slow frequency wander
  const sharedEnv = shapedNoise(rand, f => gauss(f, .25, .2)); // waxing and waning
  // Gate: 1 with eyes closed (rising over ~0.35 s after closure), ~0.1 with eyes open, fading in drowsiness.
  const gate = new Float32Array(N), squeak = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = time(i), {closed, since} = eyesClosedAt(t);
    let g = closed ? smoothstep(since + .15, since + .5, t) : .1 + .9 * (1 - smoothstep(since, since + .25, t));
    if (!closed && since === -Infinity) g = .1;
    g *= 1 - smoothstep(SCRIPT.drowsy, SCRIPT.drowsy + 4, t);
    gate[i] = g;
    squeak[i] = closed ? Math.exp(-(t - since) / .8) : 0;
  }
  const phase = new Float64Array(N);
  for (let i = 1; i < N; i++) phase[i] = phase[i - 1] + TAU * (9.8 + .25 * drift[i] + 1.1 * squeak[i]) / FS;
  const pdrPatches = [ // [x, y, sigma, gain, phase lag (rad)]
    [-.3, 1.02, .38, 1, 0], [.3, 1.02, .38, 1.1, .2], [-.45, .58, .34, .45, -.45], [.45, .58, .34, .5, -.3],
  ];
  for (const [x, y, sigma, gain, lag] of pdrPatches) {
    const field = patchField(x, y, sigma), own = shapedNoise(rand, f => gauss(f, .3, .25));
    const wander = shapedNoise(rand, f => gauss(f, 0, .3));
    const wave = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const env = Math.max(.25, 1 + .28 * sharedEnv[i] + .12 * own[i]);
      const p = phase[i] + lag + .25 * wander[i];
      wave[i] = PDR_UV * gain * gate[i] * env * (Math.sin(p) + .12 * Math.sin(2 * p + .6));
    }
    for (let e = 0; e < E; e++) {
      if (field[e] < 1e-4) continue;
      const out = parts.pdr[e];
      for (let i = 0; i < N; i++) out[i] += field[e] * wave[i];
    }
  }

  // --- sleep spindles: central/vertex patches with small frequency and phase differences.
  const SPINDLE_UV = 38;
  const spindlePatches = [[0, -.05, .45, 1.15], [-.35, -.2, .32, .5], [.35, -.2, .32, .5], [-.35, .25, .32, .5], [.35, .25, .32, .5]];
  const events = [];
  for (const [start, dur, hz] of SCRIPT.spindles) {
    events.push({t: start, end: start + dur, type: 'spindle', label: `Spindle ${hz.toFixed(1)} Hz`});
    const i0 = Math.round(start * FS), i1 = Math.min(N, Math.round((start + dur) * FS));
    for (const [x, y, sigma, gain] of spindlePatches) {
      const field = patchField(x, y, sigma), f = hz + .35 * normal(rand), lag = .9 * normal(rand), g = gain * (.75 + .5 * rand());
      for (let i = i0; i < i1; i++) {
        const u = (i - i0) / (i1 - i0), env = Math.sin(Math.PI * u) ** 2;
        const v = SPINDLE_UV * g * env * Math.sin(TAU * f * (i - i0) / FS + lag);
        for (let e = 0; e < E; e++) if (field[e] > 1e-4) parts.spindle[e][i] += field[e] * v;
      }
    }
  }

  // --- eye potentials: both corneas act as one positive source just in front of the frontal poles.
  // The right eye is weighted slightly less so a transverse Fp1-Fp2 channel is small but not exactly zero.
  const rightEye = patchField(.26, -1.22, .44);
  const eyeField = patchField(-.26, -1.22, .44).map((v, e) => v + .93 * rightEye[e]);
  const eyePeak = Math.max(...eyeField);
  const BLINK_UV = 150;
  const eye = new Float32Array(N);
  const addEvent = (t0, fn, span) => {
    for (let i = Math.max(0, Math.floor(t0 * FS)); i < Math.min(N, Math.ceil((t0 + span) * FS)); i++) eye[i] += fn(time(i) - t0);
  };
  for (const t of SCRIPT.blinks) {
    const amp = BLINK_UV * (.8 + .4 * rand());
    addEvent(t, u => amp * blinkWave(u), .4);
    events.push({t, end: t + .38, type: 'blink', label: 'Blink'});
  }
  for (const t of SCRIPT.eyesClose) { // lid closure with a blink, then the upturned eyes keep Fp positive (decays on the high-pass)
    addEvent(t, u => BLINK_UV * 1.05 * blinkWave(u) + 55 * smoothstep(0, .25, u) * Math.exp(-u / 1.2), 6);
    events.push({t, end: t + .4, type: 'eyes-closed', label: 'Eyes closed'});
  }
  for (const t of SCRIPT.eyesOpen) { // the eyes turn back down: Fp swings negative, then the high-pass restores baseline
    addEvent(t, u => -70 * smoothstep(0, .2, u) * Math.exp(-u / 1), 5);
    events.push({t, end: t + .4, type: 'eyes-open', label: 'Eyes open'});
  }
  for (let e = 0; e < E; e++) {
    const g = eyeField[e] / eyePeak, out = parts.eye[e];
    if (g > 1e-4) for (let i = 0; i < N; i++) out[i] = g * eye[i];
  }

  events.push({t: SCRIPT.drowsy, end: SCRIPT.drowsy, type: 'state', label: 'Drowsy'});
  events.push({t: SCRIPT.n2, end: SCRIPT.n2, type: 'state', label: 'N2 sleep'});
  events.sort((a, b) => a.t - b.t);

  const data = Array.from({length: E}, (_, e) => {
    const out = new Float32Array(N);
    for (const p of Object.values(parts)) for (let i = 0; i < N; i++) out[i] += p[e][i];
    return out;
  });
  return {fs: FS, n: N, duration: DURATION, data, parts, events};
}

/** Bipolar derivations of electrode arrays: one Float32Array per channel ({a, b} electrode rows). */
export function deriveChannels(arrays, channels) {
  return channels.map(({a, b}) => {
    const x = arrays[a], y = arrays[b], out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = x[i] - y[i];
    return out;
  });
}

// Windows (s) in which each teaching feature is present, for the visibility measurement.
export function featureWindows(record) {
  const closed = [];
  for (const t of SCRIPT.eyesClose) {
    const next = [...SCRIPT.eyesOpen, SCRIPT.drowsy].filter(x => x > t).sort((a, b) => a - b)[0];
    closed.push([t + 1, next]);
  }
  return {
    pdr: closed,
    spindle: record.events.filter(e => e.type === 'spindle').map(e => [e.t, e.end]),
    eye: record.events.filter(e => e.type === 'blink').map(e => [e.t - .05, e.end + .05]),
  };
}

/**
 * Largest absolute deflection of one component in a montage, inside that component's windows.
 * Returns {uv, channel} for the channel where it is largest.
 */
export function peakDeflection(component, channels, windows, fs = FS) {
  let best = {uv: 0, channel: null};
  for (const ch of channels) {
    const x = component[ch.a], y = component[ch.b];
    for (const [t0, t1] of windows) {
      for (let i = Math.max(0, Math.round(t0 * fs)); i < Math.min(x.length, Math.round(t1 * fs)); i++) {
        const v = Math.abs(x[i] - y[i]);
        if (v > best.uv) best = {uv: v, channel: ch.label};
      }
    }
  }
  return best;
}
