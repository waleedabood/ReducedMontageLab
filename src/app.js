// Reduced Montage Lab controller: one synthetic record, two stacked panes (full double banana above, a reduced
// montage below, time axes aligned), one shared sweeper, page, sensitivity and play state. Hovering either pane shows a guide at the same instant in
// the other; hovering a channel lights its electrode pair on that pane's head map.
import {MONTAGES, REDUCED, TEN_TWENTY, channelsOf, electrodes, electrodesOf} from './montages.js';
import {CHAPTERS, DURATION, FS, deriveChannels, featureWindows, generateRecord, peakDeflection} from './signal.js';
import {drawPane, layout, xToTime, yToRow} from './viewer.js';

const $ = id => document.getElementById(id);
const store = {
  get(key) { try { return localStorage.getItem(`rml:${key}`); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`rml:${key}`, value); } catch { /* storage unavailable */ } },
};

const state = {
  reduced: REDUCED.includes(store.get('montage')) ? store.get('montage') : 'subhairline',
  pageLen: 10, pageStart: 0, cursor: 0, playing: false, speed: 1, sens: 7, mode: 'page', showEvents: true,
  ghost: null, hoverRow: {full: -1, reduced: -1}, chapter: 'pdr',
  sensAuto: true, // sensitivity follows the window until the user picks one
};

const record = generateRecord();
const windows = featureWindows(record);
const cache = new Map(); // montage id → {channels, traces}
function montageData(id) {
  if (!cache.has(id)) {
    const channels = channelsOf(MONTAGES[id]);
    cache.set(id, {channels, traces: deriveChannels(record.data, channels)});
  }
  return cache.get(id);
}

// ------------------------------------------------------------------ panes
const panes = {
  full: setupPane($('pane-full'), 'full'),
  reduced: setupPane($('pane-reduced'), 'reduced'),
};

function setupPane(el, key) {
  const canvas = el.querySelector('canvas');
  const pane = {el, key, canvas, ctx: canvas.getContext('2d'), width: 0, height: 0, lay: null};
  new ResizeObserver(() => { sizeCanvas(pane); if (key === 'full') fitSensitivity(); render(); }).observe(canvas.parentElement);
  let dragging = false;
  const timeAt = ev => {
    const r = canvas.getBoundingClientRect();
    return {t: xToTime(pane.lay, ev.clientX - r.left, state.pageStart, state.pageLen), row: yToRow(pane.lay, ev.clientY - r.top)};
  };
  canvas.addEventListener('pointerdown', ev => {
    dragging = true; canvas.setPointerCapture(ev.pointerId);
    state.cursor = timeAt(ev).t; render();
  });
  canvas.addEventListener('pointermove', ev => {
    const {t, row} = timeAt(ev);
    state.ghost = t;
    if (state.hoverRow[key] !== row) { state.hoverRow[key] = row; drawHeadMap(key); }
    if (dragging) state.cursor = t;
    render();
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    state.ghost = null; state.hoverRow[key] = -1; drawHeadMap(key); render();
  });
  return pane;
}

// Starting sensitivity: the most sensitive standard value (7 µV/mm or above) at which 50 µV spans at most 1.6
// channel spacings of the full montage, so a short window does not bury the double banana in overlap.
function fitSensitivity() {
  if (!state.sensAuto || !panes.full.width) return;
  const {spacing} = layout(panes.full.width, panes.full.height, montageData('full').channels);
  const options = [...$('sens').options].map(o => Number(o.value)).filter(v => v >= 7);
  state.sens = options.find(v => 50 * 3.78 / v <= 1.6 * spacing) ?? options[options.length - 1];
  $('sens').value = String(state.sens);
}

function sizeCanvas(pane) {
  const r = pane.canvas.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  pane.width = Math.max(50, r.width); pane.height = Math.max(50, r.height);
  pane.canvas.width = Math.round(pane.width * dpr); pane.canvas.height = Math.round(pane.height * dpr);
  pane.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ------------------------------------------------------------------ palette from CSS tokens
let palette;
function readPalette() {
  const css = getComputedStyle(document.documentElement), v = name => css.getPropertyValue(name).trim();
  palette = {
    paper: v('--fig-paper'), trace: v('--fig-trace'), label: v('--fig-label'), channel: v('--fig-channel'),
    gridMajor: v('--fig-grid-major'), gridMinor: v('--fig-grid-minor'), cursor: v('--fig-cursor'), accent: v('--fig-accent'),
    mono: v('--font-mono'), sans: v('--font-sans'),
    event: {info: v('--info'), success: v('--success'), warning: v('--warning'), neutral: v('--neutral')},
  };
}

// ------------------------------------------------------------------ drawing
let frameQueued = false;
function render() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => { frameQueued = false; drawNow(); });
}

function drawNow() {
  for (const pane of Object.values(panes)) {
    if (!pane.width) continue;
    const id = pane.key === 'full' ? 'full' : state.reduced, {channels, traces} = montageData(id);
    pane.lay = drawPane(pane.ctx, {
      width: pane.width, height: pane.height, channels, traces, fs: FS, duration: DURATION,
      pageStart: state.pageStart, pageLen: state.pageLen, cursor: state.cursor, mode: state.mode,
      ghost: state.ghost, sens: state.sens, palette, events: record.events, showEvents: state.showEvents,
      highlightRow: state.hoverRow[pane.key],
    });
    pane.canvas.setAttribute('aria-label', `${MONTAGES[id].name}: ${channels.length} channels, ${state.pageStart}-${state.pageStart + state.pageLen} s, sweeper at ${state.cursor.toFixed(1)} s`);
  }
  $('clock').textContent = `${state.cursor.toFixed(1)} s`;
  const tl = $('timeline');
  $('timeline-window').style.left = `${state.pageStart / DURATION * 100}%`;
  $('timeline-window').style.width = `${state.pageLen / DURATION * 100}%`;
  $('timeline-head').style.left = `${state.cursor / DURATION * 100}%`;
  tl.setAttribute('aria-valuenow', state.cursor.toFixed(1));
  tl.setAttribute('aria-valuetext', `${state.cursor.toFixed(1)} seconds`);
  const current = CHAPTERS.filter(c => c.start <= state.cursor + 1e-6).pop() || CHAPTERS[0];
  if (current.id !== state.chapter) { state.chapter = current.id; $('chapter').value = current.id; }
}

// ------------------------------------------------------------------ head maps
function drawHeadMap(key) {
  const id = key === 'full' ? 'full' : state.reduced, montage = MONTAGES[id];
  const used = new Set(electrodesOf(montage)), pos = Object.fromEntries(electrodes.map(e => [e[0], [e[1], e[2]]]));
  const {channels} = montageData(id), hot = channels[state.hoverRow[key]];
  const hotNames = hot ? hot.label.split('-') : [];
  const shown = electrodes.filter(e => TEN_TWENTY.includes(e[0]) || used.has(e[0]));
  const links = channels.map(ch => {
    const [a, b] = ch.label.split('-'), [x1, y1] = pos[a], [x2, y2] = pos[b];
    return `<line class="hm-link${ch === hot ? ' hot' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const dots = shown.map(([name, x, y]) => {
    const cls = hotNames.includes(name) ? 'hm-el on hot' : used.has(name) ? 'hm-el on' : 'hm-el';
    return `<circle class="${cls}" cx="${x}" cy="${y}" r="${used.has(name) ? .09 : .065}"><title>${name}</title></circle>`;
  }).join('');
  panes[key].el.querySelector('.head-map').innerHTML = `<svg viewBox="-1.38 -1.38 2.76 2.76" role="img" aria-label="Electrodes of ${montage.name}">
    <path class="hm-head" d="M-.12 -.99 L0 -1.16 L.12 -.99 Z"/>
    <ellipse class="hm-head" cx="-1.02" cy="0" rx=".08" ry=".2"/><ellipse class="hm-head" cx="1.02" cy="0" rx=".08" ry=".2"/>
    <circle class="hm-head" cx="0" cy="0" r="1"/>${links}${dots}</svg>`;
}

function paneHeaders() {
  for (const key of ['full', 'reduced']) {
    const id = key === 'full' ? 'full' : state.reduced, m = MONTAGES[id], n = montageData(id).channels.length;
    const head = panes[key].el.querySelector('.pane-head');
    head.querySelector('h2').textContent = m.name;
    head.querySelector('.meta').textContent = `${n} ch · ${electrodesOf(m).length} electrodes`;
    drawHeadMap(key);
  }
}

// ------------------------------------------------------------------ teaching panel
function updateTeaching() {
  const m = MONTAGES[state.reduced];
  const full = montageData('full').channels, reduced = montageData(state.reduced).channels;
  const features = [['pdr', 'Posterior dominant rhythm', 'pdr'], ['spindle', 'Sleep spindles', 'spindle'], ['eye', 'Blinks', 'eye']];
  $('bars').innerHTML = features.map(([key, title]) => {
    const f = peakDeflection(record.parts[key], full, windows[key]), r = peakDeflection(record.parts[key], reduced, windows[key]);
    const pct = f.uv ? Math.round(100 * r.uv / f.uv) : 0;
    const row = (label, v, color) => `<div class="bar-row"><span>${label}</span>
      <span class="track"><span class="fill" style="width:${Math.max(1, 100 * v.uv / f.uv)}%;background:var(${color})"></span></span>
      <span class="val">${Math.round(v.uv)} µV · ${v.channel ?? '-'}</span></div>`;
    return `<div class="bar-group"><h4><span>${title}</span><span class="pct" title="Reduced peak as a share of the full-montage peak">${pct}%</span></h4>
      ${row('Full', f, '--bar-full')}${row(m.short, r, '--bar-reduced')}</div>`;
  }).join('');
  $('notes-title').textContent = `${m.short}: what to expect`;
  $('placement').textContent = m.placement;
  $('note-list').innerHTML = m.notes.map(n => `<li>${n}</li>`).join('');
}

// ------------------------------------------------------------------ chapters and timeline
function jumpTo(start, cursor = start) {
  state.pageStart = Math.max(0, Math.min(DURATION - state.pageLen, start));
  state.cursor = Math.min(state.pageStart + state.pageLen, Math.max(state.pageStart, cursor));
  render();
}

function buildTimeline() {
  const tl = $('timeline'), pct = t => `${t / DURATION * 100}%`;
  const ink = {blink: '--info', 'eyes-open': '--warning', 'eyes-closed': '--warning', spindle: '--success', state: '--neutral'};
  const sleepZone = record.events.find(e => e.label === 'N2 sleep');
  const html = [];
  if (sleepZone) {
    html.push(`<div class="zone" style="left:${pct(sleepZone.t)};right:0;background:color-mix(in srgb, var(--info) 7%, transparent)"></div>`);
    html.push(`<span class="zone-label" style="left:${pct(sleepZone.t)}">N2</span>`);
  }
  for (const e of record.events) {
    if (e.type === 'spindle') html.push(`<div class="span" style="left:${pct(e.t)};width:${pct(e.end - e.t)};background:var(${ink[e.type]})" title="${e.label} at ${e.t.toFixed(1)} s"></div>`);
    else html.push(`<div class="tick" style="left:${pct(e.t)};background:var(${ink[e.type]})" title="${e.label} at ${e.t.toFixed(1)} s"></div>`);
  }
  tl.insertAdjacentHTML('afterbegin', html.join(''));
  const seek = ev => {
    const r = tl.getBoundingClientRect(), t = Math.min(DURATION, Math.max(0, (ev.clientX - r.left) / r.width * DURATION));
    const inPage = t >= state.pageStart && t <= state.pageStart + state.pageLen;
    if (inPage) { state.cursor = t; render(); } else jumpTo(Math.floor(t - state.pageLen / 2), t);
  };
  let drag = false;
  tl.addEventListener('pointerdown', ev => { drag = true; tl.setPointerCapture(ev.pointerId); seek(ev); });
  tl.addEventListener('pointermove', ev => { if (drag) seek(ev); });
  tl.addEventListener('pointerup', () => { drag = false; });
  tl.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); pageStep(ev.key === 'ArrowLeft' ? -1 : 1); }
  });
}

// ------------------------------------------------------------------ playback
let last = null;
function tick(now) {
  if (!state.playing) { last = null; return; }
  if (last != null) {
    state.cursor += Math.min(.1, (now - last) / 1000) * state.speed;
    if (state.cursor >= state.pageStart + state.pageLen || state.cursor >= DURATION) {
      const next = state.pageStart + state.pageLen;
      state.pageStart = next + state.pageLen > DURATION + 1e-6 ? 0 : next;
      state.cursor = state.pageStart;
    }
  }
  last = now;
  drawNow();
  requestAnimationFrame(tick);
}

function setPlaying(on) {
  state.playing = on;
  $('play').textContent = on ? 'Pause' : 'Play';
  $('play').setAttribute('aria-pressed', String(on));
  if (on) requestAnimationFrame(tick);
}

function pageStep(dir) {
  let start = state.pageStart + dir * state.pageLen;
  if (start < 0) start = 0;
  if (start > DURATION - state.pageLen) start = dir > 0 ? 0 : DURATION - state.pageLen;
  jumpTo(start);
}

// ------------------------------------------------------------------ controls
function setReduced(id) {
  state.reduced = id; store.set('montage', id); state.hoverRow.reduced = -1;
  for (const b of $('montages').children) b.setAttribute('aria-checked', String(b.dataset.id === id));
  paneHeaders(); updateTeaching(); render();
}

function initControls() {
  $('montages').innerHTML = REDUCED.map(id => `<button type="button" role="radio" data-id="${id}" aria-checked="false">${MONTAGES[id].short}</button>`).join('');
  $('montages').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) setReduced(b.dataset.id); });
  $('montages').addEventListener('keydown', ev => {
    if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    ev.preventDefault(); ev.stopPropagation();
    const i = (REDUCED.indexOf(state.reduced) + (ev.key === 'ArrowRight' ? 1 : REDUCED.length - 1)) % REDUCED.length;
    setReduced(REDUCED[i]); $('montages').children[i].focus();
  });
  $('chapter').innerHTML = CHAPTERS.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  $('chapter-list').innerHTML = CHAPTERS.map(c => `<li><strong>${c.label}:</strong> ${c.hint}</li>`).join('');
  $('chapter').addEventListener('change', ev => {
    const c = CHAPTERS.find(c => c.id === ev.target.value);
    state.chapter = c.id; jumpTo(c.start);
  });

  // Explanation dropdowns: one open at a time; Escape or a click elsewhere closes them.
  const menus = [...document.querySelectorAll('details.menu')];
  for (const m of menus) m.addEventListener('toggle', () => { if (m.open) menus.forEach(o => { if (o !== m) o.open = false; }); });
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('details.menu')) menus.forEach(m => { m.open = false; }); });
  document.addEventListener('keydown', ev => {
    const open = menus.find(m => m.open);
    if (ev.key === 'Escape' && open) { open.open = false; open.querySelector('summary').focus(); }
  });
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('mode').addEventListener('change', ev => { state.mode = ev.target.value; render(); });
  $('page').addEventListener('change', ev => {
    state.pageLen = Number(ev.target.value);
    jumpTo(Math.min(state.pageStart, DURATION - state.pageLen), state.cursor);
  });
  $('sens').addEventListener('change', ev => { state.sens = Number(ev.target.value); state.sensAuto = false; render(); });
  $('speed').addEventListener('change', ev => { state.speed = Number(ev.target.value); });
  $('events').addEventListener('change', ev => { state.showEvents = ev.target.checked; render(); });

  const applyTheme = theme => {
    document.documentElement.dataset.theme = theme;
    $('theme').textContent = theme === 'dim' ? 'Light' : 'Dim';
    $('theme').setAttribute('aria-label', theme === 'dim' ? 'Switch to light theme' : 'Switch to dim room theme');
    readPalette(); render();
  };
  $('theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dim' ? 'light' : 'dim';
    store.set('theme', next); applyTheme(next);
  });
  applyTheme(store.get('theme') || 'light'); // white EEG paper by default, as in EEGSimLab

  // Splitter between the stacked panes: the share of height given to the full montage (pointer and keyboard).
  const split = $('split'), splitter = $('splitter');
  const setSplit = pct => {
    pct = Math.min(80, Math.max(35, pct));
    split.style.setProperty('--top', `${pct}%`); splitter.setAttribute('aria-valuenow', String(Math.round(pct)));
    store.set('split-rows', String(pct));
  };
  setSplit(Number(store.get('split-rows')) || 62);
  let dragging = false;
  splitter.addEventListener('pointerdown', ev => { dragging = true; splitter.setPointerCapture(ev.pointerId); });
  splitter.addEventListener('pointermove', ev => {
    if (!dragging) return;
    const r = split.getBoundingClientRect(), inner = r.height - 10;
    setSplit((ev.clientY - r.top) / inner * 100);
  });
  splitter.addEventListener('pointerup', () => { dragging = false; });
  splitter.addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault(); ev.stopPropagation();
    setSplit(Number(splitter.getAttribute('aria-valuenow')) + (ev.key === 'ArrowUp' ? -2 : 2));
  });

  const SENS = [...$('sens').options].map(o => Number(o.value));
  document.addEventListener('keydown', ev => {
    if (ev.target.closest('select, input, textarea, details.menu') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === ' ' && !ev.target.closest('button')) { ev.preventDefault(); setPlaying(!state.playing); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); pageStep(ev.key === 'ArrowLeft' ? -1 : 1); }
    else if (ev.key === ',' || ev.key === '.') {
      state.cursor = Math.min(state.pageStart + state.pageLen, Math.max(state.pageStart, state.cursor + (ev.key === ',' ? -.2 : .2))); render();
    } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      // Up makes traces larger: a lower µV/mm value.
      const i = Math.min(SENS.length - 1, Math.max(0, SENS.indexOf(state.sens) + (ev.key === 'ArrowUp' ? -1 : 1)));
      state.sens = SENS[i]; state.sensAuto = false; $('sens').value = String(state.sens); render();
    }
  });
}

initControls();
buildTimeline();
setReduced(state.reduced);
render();
