import test from 'node:test';
import assert from 'node:assert/strict';
import {MONTAGES, REDUCED, channelsOf, electrodeIndex as ix} from '../src/montages.js';
import {DURATION, FS, featureWindows, generateRecord, peakDeflection} from '../src/signal.js';

const record = generateRecord();
const windows = featureWindows(record);
const peak = (part, id) => peakDeflection(record.parts[part], channelsOf(MONTAGES[id]), windows[part]);
const rmsBetween = (arr, t0, t1) => {
  let s = 0; const i0 = t0 * FS, i1 = t1 * FS;
  for (let i = i0; i < i1; i++) s += arr[i] ** 2;
  return Math.sqrt(s / (i1 - i0));
};

test('every montage channel names known electrodes', () => {
  for (const m of Object.values(MONTAGES)) assert.ok(channelsOf(m).length > 0);
  assert.equal(channelsOf(MONTAGES.full).length, 18);
  for (const id of REDUCED) assert.ok(MONTAGES[id].notes.length && MONTAGES[id].placement);
});

test('record is deterministic and finite', () => {
  const again = generateRecord();
  assert.equal(record.data.length, Object.keys(ix).length);
  assert.equal(record.data[0].length, DURATION * FS);
  assert.deepEqual(again.data[ix.O1].slice(0, 500), record.data[ix.O1].slice(0, 500));
  assert.ok(record.data.every(a => a.every(Number.isFinite)));
});

test('PDR is occipital, blocked by eye opening and absent in N2', () => {
  const o2 = record.parts.pdr[ix.O2], f4 = record.parts.pdr[ix.F4];
  assert.ok(rmsBetween(o2, 6, 18) > 5 * rmsBetween(f4, 6, 18), 'occipital > frontal');
  assert.ok(rmsBetween(o2, 6, 18) > 5 * rmsBetween(o2, 20, 25.5), 'eyes closed > eyes open');
  assert.ok(rmsBetween(o2, 45, 60) < .5, 'no PDR in N2');
  const full = peak('pdr', 'full');
  assert.match(full.channel, /O[12]$/);
});

test('blinks are positive at the frontal poles and fall off steeply', () => {
  const t = record.events.find(e => e.type === 'blink').t, i = Math.round((t + .1) * FS);
  const fp1 = record.parts.eye[ix.Fp1][i];
  assert.ok(fp1 > 100, 'Fp1 positive (downward in Fp1-F3)');
  assert.ok(record.parts.eye[ix.C3][i] < .1 * fp1);
  assert.ok(peak('eye', 'ear').uv < 2, 'behind-the-ear channels barely see blinks');
});

test('spindles are central and missed by distant montages', () => {
  const cz = rmsBetween(record.parts.spindle[ix.Cz], 40, 64), o1 = rmsBetween(record.parts.spindle[ix.O1], 40, 64);
  assert.ok(cz > 4 * o1);
  assert.ok(peak('spindle', 'subhairline').uv < .3 * peak('spindle', 'full').uv);
  assert.ok(peak('spindle', 'ear').uv < .3 * peak('spindle', 'full').uv);
});

test('each reduced montage tells its teaching story', () => {
  const full = k => peak(k, 'full').uv;
  assert.equal(channelsOf(MONTAGES.subhairline).length, 8, 'five electrodes per side, two temporal chains');
  assert.ok(peak('pdr', 'subhairline').uv > .8 * full('pdr'), 'the band keeps the PDR in P7-O1 / P8-O2');
  assert.ok(peak('eye', 'subhairline').uv > .8 * full('eye'), 'the band keeps blinks');
  assert.ok(peak('pdr', 'frontal').uv < .05 * full('pdr'));
  assert.ok(peak('pdr', 'ear').uv > .1 * full('pdr'), 'behind the ear keeps some PDR');
});

test('a symmetric blink nearly cancels in a transverse Fp1-Fp2 channel', () => {
  const fpfp = peakDeflection(record.parts.eye, channelsOf({chains: [['Fp1-Fp2']]}), windows.eye).uv;
  assert.ok(fpfp < .1 * peak('eye', 'full').uv);
});
