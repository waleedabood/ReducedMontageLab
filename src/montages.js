// Reduced Montage Lab: electrode geometry and montage definitions.
// Scalp positions use an azimuthal equidistant projection of the head seen from above: nose at y = -1,
// left ear at x = -1, vertex at (0, 0). The 10-20 equator ring (Fp, F7/F8, T7/T8, P7/P8, O) lies on r = 1 and
// the 10-10 inferior ring (T9/T10, TP9/TP10, P9/P10) on r = 1.2, i.e. 10% of the nasion-inion arc below it.
// Positions are idealized; they are for teaching, not for source localization.

const DEG = Math.PI / 180;
// Ring electrode at `angle` degrees back from the nose, on radius r; side -1 is left, +1 is right.
const ring = (angle, r, side) => [side * r * Math.sin(angle * DEG), -r * Math.cos(angle * DEG)];

/** Every electrode the lab uses: [name, x, y]. */
export const electrodes = [
  ['Fp1', ...ring(18, 1, -1)], ['Fp2', ...ring(18, 1, 1)],
  ['F7', ...ring(54, 1, -1)], ['F3', -.4, -.45], ['Fz', 0, -.5], ['F4', .4, -.45], ['F8', ...ring(54, 1, 1)],
  ['T7', ...ring(90, 1, -1)], ['C3', -.5, 0], ['Cz', 0, 0], ['C4', .5, 0], ['T8', ...ring(90, 1, 1)],
  ['P7', ...ring(126, 1, -1)], ['P3', -.4, .45], ['Pz', 0, .5], ['P4', .4, .45], ['P8', ...ring(126, 1, 1)],
  ['O1', ...ring(162, 1, -1)], ['O2', ...ring(162, 1, 1)],
  ['TP7', ...ring(108, 1, -1)], ['TP8', ...ring(108, 1, 1)],
  ['T9', ...ring(90, 1.2, -1)], ['T10', ...ring(90, 1.2, 1)],
  ['TP9', ...ring(108, 1.2, -1)], ['TP10', ...ring(108, 1.2, 1)],
  ['P9', ...ring(126, 1.2, -1)], ['P10', ...ring(126, 1.2, 1)],
];

/** Electrode name → row index in a record. */
export const electrodeIndex = Object.fromEntries(electrodes.map((e, i) => [e[0], i]));

/** The standard 19 electrodes of the 10-20 system (drawn on every head map). */
export const TEN_TWENTY = electrodes.slice(0, 19).map(e => e[0]);

/**
 * Montages. Each has chains (groups) of bipolar channels written 'A-B' (displayed value A minus B, negative up).
 * The full montage is the 18-channel longitudinal bipolar ("double banana") in the EEGSimLab order.
 * Reduced montages are editable: add or remove channels here and every view, head map and visibility
 * measurement follows.
 */
export const MONTAGES = {
  full: {
    id: 'full',
    name: 'Full 10-20 · longitudinal bipolar',
    short: 'Double banana',
    chains: [
      ['Fp1-F7', 'F7-T7', 'T7-P7', 'P7-O1'],
      ['Fp2-F8', 'F8-T8', 'T8-P8', 'P8-O2'],
      ['Fp1-F3', 'F3-C3', 'C3-P3', 'P3-O1'],
      ['Fp2-F4', 'F4-C4', 'C4-P4', 'P4-O2'],
      ['Fz-Cz', 'Cz-Pz'],
    ],
  },
  subhairline: {
    id: 'subhairline',
    name: 'Subhairline band · bipolar',
    short: 'Subhairline',
    chains: [
      ['Fp1-F7', 'F7-T7', 'T7-P7', 'P7-O1'],
      ['Fp2-F8', 'F8-T8', 'T8-P8', 'P8-O2'],
    ],
    placement: 'Ten electrodes, five per side, on a circumferential band around the head, mostly below the hairline, as in rapid-response headband systems (e.g. Ceribell): Fp1, F7, T7 (T3), P7 (T5), O1 and Fp2, F8, T8 (T4), P8 (T6), O2. The eight channels are the two temporal chains of the double banana.',
    notes: [
      'The temporal chains are identical channel for channel to the outer chains of the full montage, so the posterior dominant rhythm and its eye-closure reactivity remain visible in P7-O1 and P8-O2.',
      'There are no parasagittal or midline electrodes. Spindles have a central/vertex maximum, so they are faint or missed, and vertex sleep transients would be too.',
      'Blinks show in Fp1-F7 and Fp2-F8 as in the full montage, but without Fp1-F3 / Fp2-F4 there is no parasagittal channel to confirm the frontal field.',
    ],
  },
  frontal: {
    id: 'frontal',
    name: 'Frontal only · bipolar',
    short: 'Frontal only',
    chains: [
      ['Fp1-F7', 'Fp1-F3'],
      ['Fp2-F8', 'Fp2-F4'],
      ['F7-F3', 'F3-Fz', 'Fz-F4', 'F4-F8'],
    ],
    placement: 'Seven frontal electrodes (Fp1, Fp2, F7, F3, Fz, F4, F8), as in frontal-band or forehead-strip recordings.',
    notes: [
      'The posterior dominant rhythm is essentially absent: posterior background, its frequency and eye-closure reactivity cannot be assessed.',
      'Spindles stay visible: Fp1-F3, Fp2-F4 and the transverse chain sample the anterior edge of their frontocentral field. Their central maximum, and any centroparietal asymmetry, is not sampled.',
      'Every channel touching Fp1 or Fp2 carries the full blink; F7-F3 and F4-F8 sit behind the eyes and see much less of it.',
    ],
  },
  ear: {
    id: 'ear',
    name: 'Behind the ear · bipolar',
    short: 'Behind the ear',
    chains: [
      ['TP7-TP9', 'TP9-P9'],
      ['TP8-TP10', 'TP10-P10'],
      ['TP9-TP10', 'P9-P10'],
    ],
    placement: 'Electrodes around and behind the pinna: above-behind the ear (TP7, TP8), mastoid (TP9, TP10) and retro-auricular (P9, P10), as in ear-EEG and behind-the-ear devices.',
    notes: [
      'P9 and P10 are the electrodes nearest the occipital cortex, so a reduced but recognisable posterior dominant rhythm and its eye-opening block can appear in TP9-P9 and TP10-P10.',
      'Spindles are faint: short inter-electrode distances far from the vertex record little potential difference.',
      'Blinks almost disappear, which helps sleep scoring but means eye opening is easy to miss. Cross-head channels (TP9-TP10, P9-P10) cancel any symmetric field.',
    ],
  },
};

/** Reduced montages offered in the right-hand pane, in menu order. */
export const REDUCED = ['subhairline', 'frontal', 'ear'];

/** Flat channel list of a montage with chain index and electrode rows: [{label, a, b, chain}]. */
export function channelsOf(montage) {
  return montage.chains.flatMap((chain, c) => chain.map(label => {
    const [a, b] = label.split('-');
    if (!(a in electrodeIndex) || !(b in electrodeIndex)) throw new Error(`Unknown electrode in ${label}`);
    return {label, a: electrodeIndex[a], b: electrodeIndex[b], chain: c};
  }));
}

/** Electrode names a montage uses. */
export function electrodesOf(montage) {
  return [...new Set(montage.chains.flat().flatMap(c => c.split('-')))];
}
