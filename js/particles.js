// The particle layer: thousands of tiny pieces that Matter.js could not handle.
// Shards fly with a hand-rolled integrator; once they come to rest they turn into
// grains in a falling-sand grid that piles up against whichever wall gravity points at.
// Everything is drawn into one small pixel buffer that gets scaled up, so the cost
// is a single putImageData per frame no matter how much sand there is.

import { G_STEP } from './world.js';

const MAX = 26000;
const CRUMBLE_STEPS = 50;

export class Particles {
  constructor(world) {
    this.world = world;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    this.pix = document.createElement('canvas');
    this.pctx = this.pix.getContext('2d');

    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.col = new Uint32Array(MAX);
    this.life = new Float32Array(MAX);
    this.delay = new Uint16Array(MAX);
    this.n = 0;
    this.sandCount = 0;
    this.frame = 0;
    this.crumbling = [];
    this.overlays = [];
    this.out = [0, 0];

    world.on('broken', () => { document.body.append(this.canvas); this.resize(); });
    world.on('rebuild-start', () => this.clear());
    world.on('resize', () => this.resize());
    world.afterStep(() => this.step());
    world.onRender(() => this.render());
  }

  clear() {
    this.n = 0;
    this.sandCount = 0;
    this.crumbling = [];
    this.grid?.fill(0);
    this.canvas.remove();
  }

  resize() {
    const { W, H } = this.world;
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.C = W * H > 2.6e6 ? 4 : 3;
    this.gw = Math.ceil(W / this.C);
    this.gh = Math.ceil(H / this.C);
    this.grid = new Uint32Array(this.gw * this.gh);
    this.sandCount = 0;
    this.pix.width = this.gw;
    this.pix.height = this.gh;
    this.img = this.pctx.createImageData(this.gw, this.gh);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  add(x, y, vx, vy, col, delay = 0) {
    if (this.n >= MAX) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.col[i] = col;
    this.life[i] = 2400 + Math.random() * 1200;
    this.delay[i] = delay;
    return i;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
    this.col[i] = this.col[j]; this.life[i] = this.life[j];
    this.delay[i] = this.delay[j];
  }

  // ---------- turning elements into particles ----------

  // mode 'shatter': burst outward from origin. mode 'sand': crumble top to bottom.
  emitFromItem(item, mode, origin) {
    const body = item.body;
    if (!body || !this.grid) return;
    const img = rasterize(item.el, item.w, item.h);
    const data = new Uint32Array(img.data.buffer);
    const w = img.width, h = img.height;
    const s = this.world.visualScale(item);
    const cos = Math.cos(body.angle), sin = Math.sin(body.angle);
    const { x: bx, y: by } = body.position;
    const { x: bvx, y: bvy } = body.velocity;

    // One sample per grid cell on screen; thin it out if we're near the budget.
    let step = Math.max(1, this.C / s);
    let count = 0;
    for (let ly = step / 2; ly < h; ly += step)
      for (let lx = step / 2; lx < w; lx += step)
        if ((data[(ly | 0) * w + (lx | 0)] >>> 24) > 110) count++;
    const room = MAX - this.n;
    if (count > room) step *= Math.sqrt(count / Math.max(1, room)) * 1.05;

    for (let ly = step / 2; ly < h; ly += step) {
      for (let lx = step / 2; lx < w; lx += step) {
        const px = data[(ly | 0) * w + (lx | 0)];
        if ((px >>> 24) <= 110) continue;
        const ox = (lx - w / 2) * s, oy = (ly - h / 2) * s;
        const wx = bx + ox * cos - oy * sin;
        const wy = by + ox * sin + oy * cos;
        const col = (px | 0xff000000) >>> 0;
        if (mode === 'shatter') {
          const dx = wx - origin.x, dy = wy - origin.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = 2 + Math.random() * 8;
          if (this.add(wx, wy,
            bvx + (dx / d) * sp + (Math.random() - 0.5) * 2,
            bvy + (dy / d) * sp + (Math.random() - 0.5) * 2 - 2, col) < 0) return;
        } else {
          const delay = ((ly / h) * CRUMBLE_STEPS + Math.random() * 4) | 0;
          if (this.add(wx, wy, bvx * 0.3 + (Math.random() - 0.5) * 0.6,
            bvy * 0.3 + (Math.random() - 0.5) * 0.6, col, delay) < 0) return;
        }
      }
    }
  }

  // Hides an element from the top down while its sand pours out.
  crumble(item) {
    this.crumbling.push({ item, t: 0 });
  }

  burst(x, y, n, colors, speed) {
    const cols = colors.map(cssToABGR);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.9);
      this.add(x, y, Math.cos(a) * sp, Math.sin(a) * sp - speed * 0.3, cols[i % cols.length]);
    }
  }

  // Pushes particles outward and blasts a crater in the sand.
  impulse(p, R, power) {
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - p.x, dy = this.y[i] - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = power * (1 - d / R) * (0.6 + Math.random() * 0.8);
      this.vx[i] += (dx / d) * f;
      this.vy[i] += (dy / d) * f;
      this.delay[i] = 0;
    }
    this.liftSand(p.x, p.y, R * 0.6, 6000, (dx, dy, d) => {
      const f = power * (1 - d / (R * 0.6)) * (0.5 + Math.random());
      return [(dx / d) * f, (dy / d) * f - 1];
    });
  }

  // Pulls sand grains out of the grid and turns them back into flying particles.
  liftSand(px, py, R, max, velFn) {
    if (!this.sandCount) return;
    const { C, gw, gh, grid } = this;
    const x0 = Math.max(0, ((px - R) / C) | 0), x1 = Math.min(gw - 1, ((px + R) / C) | 0);
    const y0 = Math.max(0, ((py - R) / C) | 0), y1 = Math.min(gh - 1, ((py + R) / C) | 0);
    let lifted = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = y * gw + x;
        const c = grid[idx];
        if (!c) continue;
        const cx = (x + 0.5) * C, cy = (y + 0.5) * C;
        const dx = cx - px, dy = cy - py;
        const d = Math.hypot(dx, dy) || 1;
        if (d > R) continue;
        const [vx, vy] = velFn ? velFn(dx, dy, d) : [0, 0];
        if (this.add(cx, cy, vx, vy, c) < 0) return;
        grid[idx] = 0;
        this.sandCount--;
        if (++lifted >= max) return;
      }
    }
  }

  // ---------- simulation ----------

  step() {
    if (!this.grid) return;
    this.stepCrumble();
    if (!this.n && !this.sandCount) return;

    const world = this.world;
    const g = world.gravity;
    const gx = g.x * G_STEP, gy = g.y * G_STEP;
    const dir = gravityDir(g);
    const { C, gw, gh, grid, out } = this;
    const W = world.W - 0.01, H = world.H - 0.01;
    const hasFields = world.fields.length > 0;
    const X = this.x, Y = this.y, VX = this.vx, VY = this.vy;

    let i = 0;
    while (i < this.n) {
      if (this.delay[i] > 0) { this.delay[i]--; i++; continue; }
      let vx = VX[i] + gx, vy = VY[i] + gy;
      let x = X[i], y = Y[i];
      if (hasFields) {
        if (world.accelAt(x, y, out)) { this.kill(i); continue; }
        vx += out[0];
        vy += out[1];
      }
      vx *= 0.992;
      vy *= 0.992;
      x += vx;
      y += vy;

      if (x < 0) { x = 0; vx = -vx * 0.35; vy *= 0.8; }
      else if (x > W) { x = W; vx = -vx * 0.35; vy *= 0.8; }
      if (y < 0) { y = 0; vy = -vy * 0.35; vx *= 0.8; }
      else if (y > H) { y = H; vy = -vy * 0.35; vx *= 0.8; }

      // Settle into the sand grid once it lands on the floor or on other sand.
      if (dir && vx * vx + vy * vy < 9) {
        const cx = (x / C) | 0, cy = (y / C) | 0;
        const nx = cx + dir[0], ny = cy + dir[1];
        const blocked = nx < 0 || ny < 0 || nx >= gw || ny >= gh || grid[ny * gw + nx] !== 0;
        if (blocked) {
          const idx = cy * gw + cx;
          if (grid[idx] === 0) {
            grid[idx] = this.col[i];
            this.sandCount++;
            this.kill(i);
            continue;
          }
          x = Math.min(W, Math.max(0, x - dir[0] * C));
          y = Math.min(H, Math.max(0, y - dir[1] * C));
          vx = vy = 0;
        }
      }

      if (--this.life[i] <= 0) { this.kill(i); continue; }
      X[i] = x; Y[i] = y; VX[i] = vx; VY[i] = vy;
      i++;
    }

    // Two passes: one cell per step (180px/s) looked like slow motion.
    if (dir && this.sandCount) {
      this.stepSand(dir);
      this.stepSand(dir);
    }
  }

  stepCrumble() {
    if (!this.crumbling.length) return;
    this.crumbling = this.crumbling.filter((c) => {
      c.t++;
      const pct = Math.min(100, (c.t / CRUMBLE_STEPS) * 100);
      c.item.el.style.clipPath = `inset(${pct.toFixed(1)}% 0 0 0)`;
      if (c.t < CRUMBLE_STEPS) return true;
      c.item.el.classList.add('phys-hidden');
      c.item.el.style.clipPath = '';
      return false;
    });
  }

  // One pass of falling sand: each grain drops one cell, or slides diagonally.
  stepSand(dir) {
    const { grid, gw, gh } = this;
    const flip = (this.frame++ & 1) === 1;
    const rnd = () => (Math.random() < 0.5 ? -1 : 1);

    if (dir[1] !== 0) {
      const dy = dir[1];
      for (let y = dy > 0 ? gh - 2 : 1; dy > 0 ? y >= 0 : y < gh; y -= dy) {
        const row = y * gw, next = (y + dy) * gw;
        for (let k = 0; k < gw; k++) {
          const x = flip ? gw - 1 - k : k;
          const c = grid[row + x];
          if (!c) continue;
          if (!grid[next + x]) { grid[next + x] = c; grid[row + x] = 0; continue; }
          const s = rnd();
          const a = x + s, b = x - s;
          if (a >= 0 && a < gw && !grid[next + a]) { grid[next + a] = c; grid[row + x] = 0; }
          else if (b >= 0 && b < gw && !grid[next + b]) { grid[next + b] = c; grid[row + x] = 0; }
        }
      }
    } else {
      const dx = dir[0];
      for (let x = dx > 0 ? gw - 2 : 1; dx > 0 ? x >= 0 : x < gw; x -= dx) {
        for (let k = 0; k < gh; k++) {
          const y = flip ? gh - 1 - k : k;
          const idx = y * gw + x;
          const c = grid[idx];
          if (!c) continue;
          if (!grid[idx + dx]) { grid[idx + dx] = c; grid[idx] = 0; continue; }
          const s = rnd();
          const a = y + s, b = y - s;
          if (a >= 0 && a < gh && !grid[a * gw + x + dx]) { grid[a * gw + x + dx] = c; grid[idx] = 0; }
          else if (b >= 0 && b < gh && !grid[b * gw + x + dx]) { grid[b * gw + x + dx] = c; grid[idx] = 0; }
        }
      }
    }
  }

  // ---------- drawing ----------

  render() {
    const { ctx, world } = this;
    if (!this.grid) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, world.W, world.H);

    if (this.n || this.sandCount) {
      const { buf, C, gw, gh } = this;
      buf.set(this.grid);
      for (let i = 0; i < this.n; i++) {
        if (this.delay[i]) continue;
        const cx = (this.x[i] / C) | 0, cy = (this.y[i] / C) | 0;
        if (cx >= 0 && cx < gw && cy >= 0 && cy < gh) buf[cy * gw + cx] = this.col[i];
      }
      this.pctx.putImageData(this.img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.pix, 0, 0, gw * C, gh * C);
    }
    for (const draw of this.overlays) draw(ctx);
  }
}

// Paints an element (background, borders, text, images) onto a canvas at 1:1,
// so its real pixels can become particles.
function rasterize(el, w, h) {
  const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true });

  const prev = el.style.transform;
  el.style.transform = 'none';
  const base = el.getBoundingClientRect();

  for (const b of [el, ...el.querySelectorAll('*')]) {
    const cs = getComputedStyle(b);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = b === el ? base : b.getBoundingClientRect();
    const x = r.left - base.left, y = r.top - base.top;
    const rad = radius(cs.borderTopLeftRadius, r);
    if (!isClear(cs.backgroundColor)) {
      c.fillStyle = cs.backgroundColor;
      c.beginPath();
      c.roundRect(x, y, r.width, r.height, rad);
      c.fill();
    }
    const bt = parseFloat(cs.borderTopWidth) || 0;
    const uniform = bt > 0 && cs.borderTopWidth === cs.borderRightWidth &&
      cs.borderTopWidth === cs.borderBottomWidth && cs.borderTopWidth === cs.borderLeftWidth;
    if (uniform && cs.borderTopStyle !== 'none') {
      c.strokeStyle = cs.borderTopColor;
      c.lineWidth = bt;
      c.beginPath();
      c.roundRect(x + bt / 2, y + bt / 2, r.width - bt, r.height - bt, Math.max(0, rad - bt / 2));
      c.stroke();
    } else {
      for (const [side, fx, fy, fw, fh] of [
        ['Top', 0, 0, 1, 0], ['Bottom', 0, 1, 1, 0], ['Left', 0, 0, 0, 1], ['Right', 1, 0, 0, 1],
      ]) {
        const bw = parseFloat(cs[`border${side}Width`]) || 0;
        if (!bw || cs[`border${side}Style`] === 'none') continue;
        c.fillStyle = cs[`border${side}Color`];
        c.fillRect(x + fx * (r.width - bw), y + fy * (r.height - bw), fw ? r.width : bw, fh ? r.height : bw);
      }
    }
    if (b.tagName === 'IMG' && b.complete) c.drawImage(b, x, y, r.width, r.height);
  }

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const cs = getComputedStyle(node.parentElement);
    if (cs.visibility === 'hidden') continue;
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in c) c.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const upper = cs.textTransform === 'uppercase';
    const underline = cs.textDecorationLine.includes('underline');
    const re = /\S+/g;
    let m;
    while ((m = re.exec(node.textContent))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rr = range.getClientRects()[0];
      if (!rr) continue;
      const word = upper ? m[0].toUpperCase() : m[0];
      const mt = c.measureText(word);
      const A = mt.fontBoundingBoxAscent, D = mt.fontBoundingBoxDescent;
      const bx = rr.left - base.left;
      const by = rr.top - base.top + (rr.height - (A + D)) / 2 + A;
      c.fillStyle = cs.color;
      c.fillText(word, bx, by);
      if (underline) {
        c.fillStyle = cs.textDecorationColor;
        const th = parseFloat(cs.textDecorationThickness) || 2;
        c.fillRect(bx, by + (parseFloat(cs.textUnderlineOffset) || 2), rr.width, th);
      }
    }
  }

  el.style.transform = prev;
  return c.getImageData(0, 0, W, H);
}

function radius(v, r) {
  const n = parseFloat(v) || 0;
  return v.endsWith('%') ? (n / 100) * Math.min(r.width, r.height) : Math.min(n, r.width / 2, r.height / 2);
}

function isClear(color) {
  return color === 'transparent' || /rgba\(.*,\s*0\)$/.test(color);
}

// Which grid direction sand falls: the dominant axis of gravity, or none in zero-G.
function gravityDir(g) {
  if (Math.abs(g.x) < 0.05 && Math.abs(g.y) < 0.05) return null;
  return Math.abs(g.y) >= Math.abs(g.x) ? [0, Math.sign(g.y)] : [Math.sign(g.x), 0];
}

function cssToABGR(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
