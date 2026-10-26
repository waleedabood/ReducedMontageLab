# Reduced Montage Lab

A local, browser-based teaching demo that shows the same synthetic EEG in two stacked panes:

- **Top:** the full 10-20 longitudinal bipolar montage ("double banana", 18 channels).
- **Bottom:** a reduced bipolar montage — **Subhairline** band, **Frontal only** or **Behind the ear**.

Both panes have the full page width and share one time axis, so a 10-s page fills the screen. One red **sweeper** runs through both at the same instant, so you can compare what each montage shows of the same event. The page is just the viewer: explanations sit in the **Captures**, **Montage notes** and **Help** dropdowns. It is a companion to EEGSimLab and uses its conventions (negative up, µV/mm sensitivity, 0.2-s grid, forest/white-paper design). It is an educational simulation. It uses no patient data and must not be used for clinical decisions.

## Open it

- **Online:** https://waleedabood.github.io/ReducedMontageLab/ (nothing to install).
- **Single file:** `dist/ReducedMontageLab.html` holds the whole lab in one file that opens offline by double-click. Download it from https://waleedabood.github.io/ReducedMontageLab/dist/ReducedMontageLab.html or rebuild it with `npm run build`.
- **Locally from source:** see below.

## Start

```sh
npm start
```

Open **http://127.0.0.1:8440/**. On macOS you can also double-click `launch.command`. Set `RML_PORT=8441` to use another port. Node.js 22 or newer is required. There are no dependencies.

## The recording (64 s, seeded and identical every time)

| Time | What happens | Look for |
|---|---|---|
| 0–4 s | Awake, eyes open, two blinks | Blinks: downward in Fp1-F7/Fp1-F3, positive at Fp1/Fp2 (Bell's phenomenon) |
| 4 s | Eyes close | Downward (Fp-positive) deflection, then a ~10-Hz posterior dominant rhythm (PDR), briefly faster at first (alpha squeak) |
| 19 s | Eyes open | PDR blocks; frontal channels swing the other way |
| 20–25 s | Four blinks | |
| 26 s | Eyes close again | PDR returns |
| 33–39 s | Drowsiness | PDR drops out; background slows |
| 39–64 s | N2 sleep | Seven 12–14 Hz spindles (0.8–1.4 s) with a central/vertex maximum |

**Jump to** in the top bar goes to each part. The overview strip under the toolbar marks every event; click it to seek.

## Controls

- **Sweeper:** click or drag in either pane. Hovering one pane draws a dashed guide at the same time in the other.
- **Channel hover:** lights up that electrode pair on the pane's head map.
- **Display:** *Page + sweeper* (the whole page drawn, sweeper moving across it) or *Live sweep* (new data painted left of the sweeper over the previous page, like a bedside monitor).
- **Keys:** Space play/pause · ←/→ page · `,`/`.` nudge the sweeper 0.2 s · ↑/↓ sensitivity.
- Both panes always share sensitivity and time base, so equal deflections are equal voltages. Until you pick a sensitivity, the starting value (7 µV/mm or above) adapts to the window height so the double banana does not overlap badly.
- Drag the bar between the panes to share the height differently.

The **Captures** dropdown measures each pattern on its own, without background, and compares its largest deflection in the best full-montage channel with the best reduced channel. These numbers come from the model, not from published data.

## Reduced montages

Defined in `src/montages.js`. Edit the `chains` there to change them. The views, head maps and measurements all update to match.

| Montage | Electrodes | Channels |
|---|---|---|
| Subhairline band | Fp1, F7, T7, P7, O1 · Fp2, F8, T8, P8, O2 (5 per side) | Fp1-F7, F7-T7, T7-P7, P7-O1 · Fp2-F8, F8-T8, T8-P8, P8-O2 |
| Frontal only | Fp1, Fp2, F7, F3, Fz, F4, F8 | Fp1-F7, Fp1-F3 · Fp2-F8, Fp2-F4 · F7-F3, F3-Fz, Fz-F4, F4-F8 |
| Behind the ear | TP7, TP8, TP9, TP10, P9, P10 | TP7-TP9, TP9-P9 · TP8-TP10, TP10-P10 · TP9-TP10, P9-P10 |

The subhairline band follows the layout of rapid-response headband systems such as Ceribell (in old names Fp1, F7, T3, T5, O1 per side), so its channels are the two temporal chains of the double banana. Electrode positions are idealized 10-10 positions: inferior-ring electrodes (T9/T10, TP9/TP10, P9/P10) are 10% below the 10-20 equator. Commercial reduced-montage devices place their electrodes differently. Check the montage of the device you teach against its documentation.

## Signal model (`src/signal.js`)

Every pattern is a scalp potential from one or more cortical "patches", each with a Gaussian field over the projected head:

- **Background:** 22 patches of coloured noise, awake (low-voltage, 1/f with a little beta) cross-fading to N2 (theta/delta). There is also a small amount of independent noise at each electrode.
- **PDR:** about 9.8 Hz from occipital and parietal patches with small phase lags and waxing-waning envelopes. It is gated by eye state and fades in drowsiness. Right is slightly larger than left.
- **Spindles:** one central patch and four parasagittal patches, each with a slightly different frequency and phase.
- **Eyes:** a positive source in front of each frontal pole. The right eye is weighted 0.93, so Fp1-Fp2 is small but not exactly zero.

## Tests

```sh
npm test
```

The tests check that the record is deterministic and that the physiology behaves as expected: the PDR is occipital, reactive and absent in N2; blinks are positive at Fp and fall off steeply; spindles are central. They also check each reduced montage's teaching claim.

## Files

```
index.html          page
server.mjs          loopback-only static server (port 8440)
launch.command      macOS double-click launcher
src/montages.js     electrode positions and montage definitions
src/signal.js       seeded record generator and visibility measurement
src/viewer.js       canvas renderer (one pane)
src/app.js          controller: shared sweeper, stacked panes, head maps, dropdown explanations
src/style.css       design tokens (light / dim room) and layout
scripts/build-single.mjs  builds dist/ReducedMontageLab.html (npm run build)
dist/               the built single-file version
tests/              node --test suite
```
