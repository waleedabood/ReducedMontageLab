// Reduced Montage Lab renderer: draws one pane of bipolar EEG on a 2D canvas.
// Conventions follow EEGSimLab: negative up, sensitivity in µV/mm at 3.78 CSS px per mm, a minor grid line every
// 0.2 s and a major line every second. Both panes are drawn by the same function with the same page, sensitivity
// and sweeper time, so a deflection of a given size looks the same height in each.
// Two display modes: 'page' draws the whole page and moves the sweeper across it; 'sweep' paints new data to the
// left of the sweeper and leaves the previous page to its right, as a bedside monitor does.

/** Plot gutters in CSS px: labels left, time axis and event tags top, calibration bottom. */
export const GUTTER = Object.freeze({left: 74, right: 12, top: 40, bottom: 26});
/** CSS pixels per millimetre (96 dpi). */
export const PX_PER_MM = 3.78;
/** Blank gap between chains, in channel spacings. */
const CHAIN_GAP = .7;
/** Blank strip ahead of the sweeper in sweep mode, in seconds. */
const SWEEP_GAP = .12;

/** Plot rectangle and channel baselines for a pane of the given CSS size. */
export function layout(width, height, channels) {
  const plot = {x: GUTTER.left, y: GUTTER.top, w: Math.max(10, width - GUTTER.left - GUTTER.right), h: Math.max(10, height - GUTTER.top - GUTTER.bottom)};
  const chains = channels.length ? channels[channels.length - 1].chain + 1 : 1;
  const units = channels.length + CHAIN_GAP * (chains - 1);
  const spacing = plot.h / units;
  const rows = channels.map((ch, i) => ({label: ch.label, y: plot.y + spacing * (i + .5 + CHAIN_GAP * ch.chain)}));
  return {plot, rows, spacing};
}

/** Time (s) under a canvas x coordinate. */
export function xToTime(lay, x, pageStart, pageLen) {
  return pageStart + Math.min(1, Math.max(0, (x - lay.plot.x) / lay.plot.w)) * pageLen;
}

/** Index of the channel row nearest a canvas y coordinate, or -1 outside the plot. */
export function yToRow(lay, y) {
  if (y < lay.plot.y || y > lay.plot.y + lay.plot.h) return -1;
  let best = -1, d = Infinity;
  lay.rows.forEach((r, i) => { const di = Math.abs(r.y - y); if (di < d) { d = di; best = i; } });
  return best;
}

const EVENT_INK = {blink: 'info', 'eyes-open': 'warning', 'eyes-closed': 'warning', spindle: 'success', state: 'neutral'};

/**
 * Draws a pane. o: {width, height, channels, traces, fs, pageStart, pageLen, cursor, mode, ghost, sens,
 * palette, events, showEvents, highlightRow, duration}.
 */
export function drawPane(ctx, o) {
  const {width, height, palette: p, pageStart, pageLen, fs} = o;
  const lay = layout(width, height, o.channels);
  const {plot} = lay;
  const x = t => plot.x + (t - pageStart) / pageLen * plot.w;
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, width, height);

  // Grid and time labels.
  ctx.lineWidth = 1;
  const minor = .2, first = Math.ceil(pageStart / minor - 1e-6);
  for (let k = first; k * minor <= pageStart + pageLen + 1e-6; k++) {
    const t = k * minor, major = Math.abs(t - Math.round(t)) < 1e-6, xx = Math.round(x(t)) + .5;
    ctx.strokeStyle = major ? p.gridMajor : p.gridMinor;
    ctx.beginPath(); ctx.moveTo(xx, plot.y); ctx.lineTo(xx, plot.y + plot.h); ctx.stroke();
    if (major && xx < plot.x + plot.w - 8) {
      ctx.fillStyle = p.label; ctx.font = `11px ${p.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${Math.round(t)} s`, xx, 13);
    }
  }

  // Events: shaded spans in the plot, tags in the top gutter.
  const eventsIn = (t0, t1, shift) => o.events.filter(e => e.end >= t0 && e.t <= t1).map(e => ({...e, shift}));
  const ranges = sweepRanges(o);
  if (o.showEvents) {
    const shown = ranges.flatMap(([t0, t1, shift]) => eventsIn(t0, t1, shift));
    let lastTagEnd = -Infinity;
    for (const e of shown) {
      const ink = p.event[EVENT_INK[e.type]] || p.label;
      const x0 = x(e.t + e.shift), x1 = x(e.end + e.shift);
      if (e.type === 'spindle' || e.type === 'blink') {
        ctx.fillStyle = withAlpha(ink, .1);
        ctx.fillRect(x0, plot.y, Math.max(2, x1 - x0), plot.h);
      } else {
        ctx.strokeStyle = withAlpha(ink, .75); ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(Math.round(x0) + .5, plot.y); ctx.lineTo(Math.round(x0) + .5, plot.y + plot.h); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = `600 11px ${p.sans}`;
      const w = ctx.measureText(e.label).width + 10, tx = Math.max(plot.x, Math.min(x0, plot.x + plot.w - w));
      const overlaps = tx < lastTagEnd; // a tag that would cover the previous one is drawn faded
      if (!overlaps) lastTagEnd = tx + w + 4;
      if (tx >= plot.x - 1 && x0 <= plot.x + plot.w) {
        const ty = 18;
        ctx.globalAlpha = overlaps ? .55 : 1;
        ctx.fillStyle = withAlpha(ink, .14);
        roundRect(ctx, tx, ty, w, 16, 4); ctx.fill();
        ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(e.label, tx + 5, ty + 8.5);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Channel labels and baselines.
  ctx.font = `12px ${p.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  lay.rows.forEach((r, i) => {
    const hot = i === o.highlightRow;
    if (hot) { ctx.fillStyle = withAlpha(p.accent, .12); ctx.fillRect(0, r.y - lay.spacing / 2, width, lay.spacing); }
    ctx.fillStyle = hot ? p.accent : p.channel;
    ctx.font = `${hot ? 700 : 400} 12px ${p.mono}`;
    ctx.fillText(r.label, plot.x - 10, r.y);
  });

  // Traces.
  const pxPerUv = PX_PER_MM / o.sens;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, plot.y - 2, width, plot.h + 4); ctx.clip();
  ctx.lineJoin = 'round'; ctx.lineWidth = 1;
  o.traces.forEach((trace, c) => {
    const base = lay.rows[c].y;
    ctx.strokeStyle = c === o.highlightRow ? p.accent : p.trace;
    ctx.lineWidth = c === o.highlightRow ? 1.3 : 1;
    ctx.beginPath();
    for (const [t0, t1, shift] of ranges) {
      const i0 = Math.max(0, Math.floor(t0 * fs)), i1 = Math.min(trace.length - 1, Math.ceil(t1 * fs));
      for (let i = i0; i <= i1; i++) {
        const xx = x(i / fs + shift), yy = base + trace[i] * pxPerUv; // negative up: canvas y grows downward
        if (i === i0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
    }
    ctx.stroke();
  });
  ctx.restore();

  // Hover ghost (from either pane) and the sweeper.
  if (o.ghost != null && o.ghost >= pageStart && o.ghost <= pageStart + pageLen) {
    const gx = Math.round(x(o.ghost)) + .5;
    ctx.strokeStyle = withAlpha(p.cursor, .55); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h); ctx.stroke(); ctx.setLineDash([]);
  }
  const cx = Math.round(x(o.cursor)) + .5;
  ctx.strokeStyle = p.cursor; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, plot.y - 4); ctx.lineTo(cx, plot.y + plot.h); ctx.stroke();
  ctx.fillStyle = p.cursor;
  ctx.beginPath(); ctx.moveTo(cx - 5, plot.y - 9); ctx.lineTo(cx + 5, plot.y - 9); ctx.lineTo(cx, plot.y - 3); ctx.closePath(); ctx.fill();

  // Calibration: 50 µV vertical and 1 s horizontal at the bottom right.
  const calH = 50 * pxPerUv, cx0 = plot.x + plot.w - 8, cy0 = height - 8;
  const secW = plot.w / pageLen;
  ctx.strokeStyle = p.label; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx0 - secW, cy0); ctx.lineTo(cx0, cy0); ctx.lineTo(cx0, cy0 - Math.min(calH, height - 12)); ctx.stroke();
  ctx.fillStyle = p.label; ctx.font = `11px ${p.sans}`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`50 µV · 1 s`, cx0 - secW - 6, cy0);
  ctx.textAlign = 'left';
  ctx.fillText(`${o.sens} µV/mm · ${pageLen} s page`, 8, cy0);
  ctx.restore();
  return lay;
}

// Time ranges to draw: [from, to, shift] where data at time t appears at display time t + shift.
function sweepRanges(o) {
  const {pageStart, pageLen, cursor, mode, duration} = o;
  if (mode !== 'sweep') return [[pageStart, Math.min(duration, pageStart + pageLen), 0]];
  const ranges = [[pageStart, cursor, 0]];
  const prevStart = pageStart - pageLen;
  if (prevStart >= 0 && cursor + SWEEP_GAP < pageStart + pageLen) ranges.push([cursor + SWEEP_GAP - pageLen, pageStart, pageLen]);
  return ranges;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Colour with an alpha, from #rrggbb. */
export function withAlpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
