// ASCII mode: the broken page, sand and water included, redrawn every frame as
// text characters. The physics keeps running underneath; only the drawing changes.
//
// Each frame the scene is painted into a tiny canvas with one pixel per character
// cell, then every pixel becomes a character picked by how much ink it holds.

import { rasterize } from './particles.js';

const RAMP = ' .:-=+*#%@';
const FONT = '600 12px ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
const ROW_H = 13;
const FX = '.sun, .planet, .blackhole, .golf-ball, .golf-cup, .valve, .hoop-board, .hoop-rim';

export class Ascii {
  constructor(world, particles) {
    this.world = world;
    this.particles = particles;
    this.on = false;
    this.cache = new Map();
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'ascii';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    this.small = document.createElement('canvas');
    this.sctx = this.small.getContext('2d', { willReadFrequently: true });
    world.onRender(() => this.render());
    world.on('rebuild-start', () => this.set(false));
  }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    document.documentElement.classList.toggle('ascii', on);
    this.particles.hidePixels = on;
    if (on) {
      const css = getComputedStyle(document.documentElement);
      this.colors = {
        ink: css.getPropertyValue('--ink').trim(),
        accent: css.getPropertyValue('--accent').trim(),
        muted: css.getPropertyValue('--muted').trim(),
        water: '#3787E6',
      };
      this.bgLum = lum(...hexRGB(css.getPropertyValue('--bg').trim()));
      document.body.append(this.canvas);
      this.world.emit('ascii');
    } else {
      this.canvas.remove();
    }
  }

  // Each piece is painted once and reused, like a sprite.
  sprite(it) {
    let c = this.cache.get(it.el);
    if (c) return c;
    const img = rasterize(it.el, it.w, it.h);
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    this.cache.set(it.el, c);
    return c;
  }

  render() {
    if (!this.on) return;
    const { W, H } = this.world;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const ctx = this.ctx;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      // Display size must be set explicitly, or a Retina screen shows it at 2x.
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;
    const cw = ctx.measureText('M').width;
    const cols = Math.ceil(W / cw), rows = Math.ceil(H / ROW_H);

    // 1. Paint the scene at one pixel per character.
    const s = this.small, sx = this.sctx;
    if (s.width !== cols || s.height !== rows) { s.width = cols; s.height = rows; }
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.clearRect(0, 0, cols, rows);
    sx.setTransform(1 / cw, 0, 0, 1 / ROW_H, 0, 0);
    for (const it of this.world.liveItems()) {
      const b = it.body;
      const k = this.world.visualScale(it);
      sx.save();
      sx.translate(b.position.x, b.position.y);
      sx.rotate(b.angle);
      sx.scale(k, k);
      sx.drawImage(this.sprite(it), -it.w / 2, -it.h / 2);
      sx.restore();
    }
    const p = this.particles;
    if (p.grid && (p.n || p.sandCount)) sx.drawImage(p.pix, 0, 0, p.gw * p.C, p.gh * p.C);
    for (const el of document.querySelectorAll(FX)) {
      const r = el.getBoundingClientRect();
      sx.fillStyle = getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)' ? this.colors.ink : getComputedStyle(el).backgroundColor;
      sx.beginPath();
      sx.ellipse(r.left + r.width / 2, r.top + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
      sx.fill();
    }

    // 2. Turn pixels into characters, one string per colour per row.
    const data = sx.getImageData(0, 0, cols, rows).data;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    const lines = { ink: [], accent: [], water: [], muted: [] };
    for (let y = 0; y < rows; y++) {
      const row = { ink: '', accent: '', water: '', muted: '' };
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const a = data[i + 3] / 255;
        let bucket = null, ch = ' ';
        if (a > 0.12) {
          const r = data[i], g = data[i + 1], bl = data[i + 2];
          if (bl > r + 50 && bl > g + 15) { bucket = 'water'; ch = a > 0.6 ? '~' : '-'; }
          else if (r > 170 && g < 140 && bl < 110) { bucket = 'accent'; ch = RAMP[Math.min(9, 3 + Math.round(a * 6))]; }
          else {
            const c = a * Math.abs(lum(r, g, bl) - this.bgLum) / Math.max(this.bgLum, 1 - this.bgLum);
            if (c < 0.1) { if (a > 0.5) { bucket = 'muted'; ch = '.'; } }
            else { bucket = 'ink'; ch = RAMP[Math.min(9, Math.max(1, Math.round(c * 9)))]; }
          }
        }
        for (const k in row) row[k] += k === bucket ? ch : ' ';
      }
      for (const k in row) lines[k].push(row[k]);
    }
    for (const k in lines) {
      ctx.fillStyle = this.colors[k];
      lines[k].forEach((line, y) => { if (line.trim()) ctx.fillText(line, 0, y * ROW_H); });
    }
  }
}

function hexRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum(r, g, b) { return (0.3 * r + 0.59 * g + 0.11 * b) / 255; }
