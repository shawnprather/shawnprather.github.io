// The particle layer: thousands of tiny pieces that Matter.js could not handle.
//
// Two kinds of sand live here:
//  - flying grains: free particles with velocity (shards, dust, anything falling)
//  - resting grains: cells in a grid that piles up against whichever wall gravity
//    points at, and slides down slopes
// A resting grain with nothing under it becomes a flying grain again, so sand pours
// and accelerates instead of sliding as a rigid sheet. The physics pieces are drawn
// into a mask every step, so sand lands on them and gets pushed aside by them.
//
// Everything is drawn into one small pixel buffer that gets scaled up, so the cost
// is a single putImageData per frame no matter how much sand there is.

import { G_STEP } from './world.js';

const { Composite } = window.Matter;
const MAX = 26000;
const CRUMBLE_STEPS = 50;

// Water is stored like sand, told apart by an alpha byte of 0xFE instead of 0xFF.
export const WATER_A = 0xfe;
const WATER_COLS = ['#2F7FE0', '#3787E6'].map((hex) => ((cssToABGR(hex) & 0xffffff) | (WATER_A << 24)) >>> 0);
const WATER_CAP = 30000;

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
    this.maskBodies = [];
    this.out = [0, 0, 0, 0, 0];
    this.waterTotal = 0;
    this.selfGravity = null; // set by sand planets mode
    this.hidePixels = false; // set by ASCII mode, which draws the sand itself

    world.on('broken', () => { document.body.append(this.canvas); this.resize(); });
    world.on('rebuild-start', () => this.clear());
    world.on('resize', () => this.resize());
    world.afterStep(() => this.step());
    world.onRender(() => this.render());
  }

  clear() {
    this.n = 0;
    this.sandCount = 0;
    this.waterTotal = 0;
    this.crumbling = [];
    this.grid?.fill(0);
    this.canvas.remove();
  }

  resize() {
    const { W, H } = this.world;
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    // A grain is a whole number of device pixels, so scaled displays (125%, 150%)
    // don't draw some grains wider than others and make the sand shimmer.
    this.D = Math.max(2, Math.round((W * H > 2.6e6 ? 4 : 3) * this.dpr));
    this.C = this.D / this.dpr;
    this.gw = Math.ceil(W / this.C);
    this.gh = Math.ceil(H / this.C);
    this.grid = new Uint32Array(this.gw * this.gh);
    this.mask = new Uint8Array(this.gw * this.gh);
    this.prevMask = new Uint8Array(this.gw * this.gh);
    this.occ = new Uint8Array(this.gw * this.gh);
    this.done = new Uint8Array(this.gw * this.gh);
    this.offsets = null;
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

    // Grains the same colour as the page background (card paper, row fills) would
    // be invisible, so they become sand-coloured instead.
    const [br, bg, bb] = hexRGB(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    const light = br + bg + bb > 382;
    const tans = (light ? ['#DCCFB6', '#D2C3A6', '#E4D9C3'] : ['#6B5E48', '#5E5240', '#7A6C53']).map(cssToABGR);
    const bgLike = (px) => {
      const r = px & 255, g = (px >> 8) & 255, b = (px >> 16) & 255;
      return Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) < 40;
    };

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
        const col = bgLike(px) ? tans[(Math.random() * 3) | 0] : (px | 0xff000000) >>> 0;
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

  // Pulls resting grains out of the grid and turns them back into flying ones.
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

  // ---------- the pieces, as seen by the sand ----------

  // Paints every physics piece into the mask (value = index into maskBodies).
  // Last step's mask is kept: a grain only gets pushed if a piece overlapped it
  // two steps running, so a resting piece's sub-pixel jitter doesn't shove sand.
  buildMask() {
    [this.prevMask, this.mask] = [this.mask, this.prevMask];
    const { mask, gw, gh, C } = this;
    mask.fill(0);
    const list = this.maskBodies;
    list.length = 1;
    for (const b of Composite.allBodies(this.world.engine.world)) {
      if (b.isSensor || b.label === 'wall' || list.length > 250) continue;
      const k = list.length;
      list.push(b);
      const v = b.vertices;
      let minY = Infinity, maxY = -Infinity;
      for (const p of v) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
      const r0 = Math.max(0, Math.ceil(minY / C - 0.5));
      const r1 = Math.min(gh - 1, Math.floor(maxY / C - 0.5));
      for (let r = r0; r <= r1; r++) {
        const yc = (r + 0.5) * C;
        let xl = Infinity, xr = -Infinity;
        for (let i = 0, n = v.length; i < n; i++) {
          const a = v[i], q = v[(i + 1) % n];
          if ((a.y <= yc && q.y > yc) || (q.y <= yc && a.y > yc)) {
            const x = a.x + ((yc - a.y) / (q.y - a.y)) * (q.x - a.x);
            if (x < xl) xl = x;
            if (x > xr) xr = x;
          }
        }
        if (xl > xr) continue;
        const c0 = Math.max(0, Math.ceil(xl / C - 0.5));
        const c1 = Math.min(gw - 1, Math.floor(xr / C - 0.5));
        const row = r * gw;
        for (let c = c0; c <= c1; c++) mask[row + c] = k;
      }
    }
  }

  solidAt(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.gw || cy >= this.gh) return false;
    const idx = cy * this.gw + cx;
    return this.grid[idx] !== 0 || this.mask[idx] !== 0;
  }

  // The closest open cell to (cx, cy), never further along gravity, preferring up.
  // Keeps displaced sand next to the piece that moved it instead of teleporting it
  // to the far side. Falls back to a straight search against gravity.
  // With no gravity (dir null) it looks in every direction, nearby only.
  findFree(cx, cy, dir) {
    const { grid, mask, gw, gh } = this;
    const d0 = dir || [0, 0];
    const key = d0.join();
    if (this.offsets?.key !== key) {
      const list = [];
      for (let oy = -4; oy <= 4; oy++) {
        for (let ox = -4; ox <= 4; ox++) {
          const along = ox * d0[0] + oy * d0[1];
          const d = Math.hypot(ox, oy);
          if ((ox || oy) && along <= 0 && d <= 4.5) list.push([ox, oy, d + along * 0.01]);
        }
      }
      list.sort((a, b) => a[2] - b[2]);
      this.offsets = { key, list };
    }
    const s = dir ? 0 : (Math.random() * 8) | 0; // no gravity: no preferred side either
    for (const o of this.offsets.list) {
      const [ox, oy] = turn(o[0], o[1], s);
      const x = cx + ox, y = cy + oy;
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      const j = y * gw + x;
      if (!grid[j] && !mask[j]) return j;
    }
    if (!dir) return -1;
    for (let t = 5; t <= 80; t++) {
      const x = cx - dir[0] * t, y = cy - dir[1] * t;
      if (x < 0 || y < 0 || x >= gw || y >= gh) break;
      const j = y * gw + x;
      if (!grid[j] && !mask[j]) return j;
    }
    return -1;
  }

  // ---------- simulation ----------

  step() {
    if (!this.grid) return;
    this.stepCrumble();
    if (!this.n && !this.sandCount) return;
    this.buildMask();

    const world = this.world;
    const g = world.gravity;
    const gx = g.x * G_STEP, gy = g.y * G_STEP;
    const dir = gravityDir(g);
    const { C, gw, gh, grid, mask, out } = this;
    const W = world.W - 0.01, H = world.H - 0.01;
    const hasFields = world.fields.length > 0;
    const X = this.x, Y = this.y, VX = this.vx, VY = this.vy;

    // Sand planets: grains pull on each other, and bump into each other instead
    // of passing through, so clumps pack into solid little worlds.
    const sg = this.selfGravity;
    if (sg) {
      sg.compute(this);
      this.markFlying();
    }
    const occ = this.occ;

    let i = 0;
    while (i < this.n) {
      if (this.delay[i] > 0) { this.delay[i]--; i++; continue; }
      if (!sg && --this.life[i] <= 0) { this.kill(i); continue; }
      let vx = VX[i] + gx, vy = VY[i] + gy;
      const x0 = X[i], y0 = Y[i];
      if (hasFields) {
        if (world.accelAt(x0, y0, out)) { this.kill(i); continue; }
        vx += out[0];
        vy += out[1];
      }
      if (sg) {
        // No air in space: momentum is kept. Inside a clump, friction between
        // neighbours pulls a grain toward the clump's own velocity instead.
        sg.sample(x0, y0, out);
        // Past a cruising speed the swirl can't speed a grain up any more (it can
        // still steer and slow it), so orbits settle instead of winding up forever.
        // Flung grains keep whatever speed they were given.
        let ax = out[0], ay = out[1];
        const v2 = vx * vx + vy * vy;
        if (v2 > 6.25) {
          const along = (ax * vx + ay * vy) / v2;
          if (along > 0) { ax -= along * vx; ay -= along * vy; }
        }
        vx += ax + (out[3] - vx) * out[2];
        vy += ay + (out[4] - vy) * out[2];
        const sp = vx * vx + vy * vy;
        if (sp > 144) { const k = 12 / Math.sqrt(sp); vx *= k; vy *= k; }
      } else {
        vx *= 0.992;
        vy *= 0.992;
      }

      // Buried inside a pile or a piece (two grains landed in the same cell, or a
      // piece moved over it): settle it into the nearest open cell right away.
      // Moving it there as a flying grain instead made whole clumps pile into the
      // same cell again every step, which is what made the sand jump.
      const inside = this.solidAt((x0 / C) | 0, (y0 / C) | 0);
      if (inside && dir) {
        const j = this.findFree((x0 / C) | 0, (y0 / C) | 0, dir);
        if (j >= 0) {
          grid[j] = this.col[i];
          this.sandCount++;
        }
        this.kill(i);
        continue;
      }
      // No gravity: a piece drifting through dust shoves it aside and carries it
      // along, instead of the dust sitting on top of the piece hiding its text.
      if (inside) {
        const cx0 = (x0 / C) | 0, cy0 = (y0 / C) | 0;
        const b = this.maskBodies[mask[cy0 * gw + cx0]];
        const j = this.findFree(cx0, cy0, null);
        if (j >= 0) {
          X[i] = ((j % gw) + 0.5) * C;
          Y[i] = (((j / gw) | 0) + 0.5) * C;
        } else if (b) {
          const dx = x0 - b.position.x, dy = y0 - b.position.y;
          const d = Math.hypot(dx, dy) || 1;
          X[i] = x0 + (dx / d) * C * 2;
          Y[i] = y0 + (dy / d) * C * 2;
        }
        VX[i] = b ? b.velocity.x : vx * 0.3;
        VY[i] = b ? b.velocity.y : vy * 0.3;
        i++;
        continue;
      }

      let x1 = x0 + vx, y1 = y0 + vy;
      // Screen edges. In sand planets they're nearly elastic, so motion isn't lost there.
      const bounce = sg ? 0.85 : 0.35, slide = sg ? 0.98 : 0.8;
      if (x1 < 0) { x1 = 0; vx = -vx * bounce; vy *= slide; }
      else if (x1 > W) { x1 = W; vx = -vx * bounce; vy *= slide; }
      if (y1 < 0) { y1 = 0; vy = -vy * bounce; vx *= slide; }
      else if (y1 > H) { y1 = H; vy = -vy * bounce; vx *= slide; }

      // Walk the path one cell at a time, so fast grains can't tunnel into piles.
      // hit: 0 = clear, 1 = sand or a piece, 2 = another flying grain (sand planets).
      let hit = 0;
      if (!inside) {
        const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / C);
        const start = ((y0 / C) | 0) * gw + ((x0 / C) | 0);
        let px = x0, py = y0;
        for (let s = 1; s <= n; s++) {
          const tx = x0 + ((x1 - x0) * s) / n, ty = y0 + ((y1 - y0) * s) / n;
          const tcx = (tx / C) | 0, tcy = (ty / C) | 0;
          if (this.solidAt(tcx, tcy)) { hit = 1; break; }
          if (sg && tcy * gw + tcx !== start && occ[tcy * gw + tcx]) { hit = 2; break; }
          px = tx; py = ty;
        }
        if (hit) { x1 = px; y1 = py; }
      }

      if (dir) {
        // Landed on something (sand, a piece, the floor): become a resting grain.
        const cx = (x1 / C) | 0, cy = (y1 / C) | 0;
        const nx = cx + dir[0], ny = cy + dir[1];
        const supported = nx < 0 || ny < 0 || nx >= gw || ny >= gh || this.solidAt(nx, ny);
        if (supported && (hit || vx * vx + vy * vy < 9)) {
          const idx = cy * gw + cx;
          if (!grid[idx] && !mask[idx]) {
            grid[idx] = this.col[i];
            this.sandCount++;
            this.kill(i);
            continue;
          }
        }
        if (hit) { vx *= 0.2; vy *= 0.2; } // clipped a side: lose speed, then fall
      } else if (hit === 2) {
        // Grain on grain: an inelastic bump that keeps the clump's momentum
        // (only the speed relative to the neighbours is lost).
        vx = out[3] + (vx - out[3]) * 0.3;
        vy = out[4] + (vy - out[4]) * 0.3;
      } else if (hit) {
        vx *= -0.3;
        vy *= -0.3;
      }

      X[i] = x1; Y[i] = y1; VX[i] = vx; VY[i] = vy;
      i++;
    }

    if (sg) this.pack();
    if (!this.sandCount) return;
    if (dir) {
      // Mark cells that flying grains are in. The resting sand treats them as
      // taken; otherwise a neighbour slides into the cell a grain just fell out
      // of, buries it, and the two keep knocking each other loose forever.
      this.markFlying();
      this.stepSand(dir);
      this.stepSand(dir);
    } else {
      this.scatterBuried();
    }
  }

  // Sand planets: one grain per cell. A grain that ends up sharing a cell moves
  // to the nearest open one, so a clump builds into a solid disc instead of
  // collapsing into a single dot.
  pack() {
    const { occ, grid, mask, C, gw, gh, x: X, y: Y, vx: VX, vy: VY, out } = this;
    const sg = this.selfGravity;
    occ.fill(0);
    if (this.offsets?.key !== '0,0') this.findFree(0, 0, null); // builds the all-directions offsets
    const offs = this.offsets.list;
    for (let i = 0; i < this.n; i++) {
      if (this.delay[i]) continue;
      const cx = Math.min(gw - 1, Math.max(0, (X[i] / C) | 0));
      const cy = Math.min(gh - 1, Math.max(0, (Y[i] / C) | 0));
      const j = cy * gw + cx;
      if (!occ[j] && !grid[j] && !mask[j]) { occ[j] = 1; continue; }
      const s = (Math.random() * 8) | 0; // random mirror/turn, so pushes don't all favour one side
      for (const o of offs) {
        const [ox, oy] = turn(o[0], o[1], s);
        const x = cx + ox, y = cy + oy;
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const k = y * gw + x;
        if (occ[k] || grid[k] || mask[k]) continue;
        occ[k] = 1;
        X[i] = (x + 0.5) * C;
        Y[i] = (y + 0.5) * C;
        // Being squeezed out costs speed relative to the clump, not the clump's own.
        sg.sample(X[i], Y[i], out);
        VX[i] = out[3] + (VX[i] - out[3]) * 0.5;
        VY[i] = out[4] + (VY[i] - out[4]) * 0.5;
        break;
      }
    }
  }

  markFlying() {
    const { occ, C, gw, gh, x: X, y: Y } = this;
    occ.fill(0);
    for (let k = 0; k < this.n; k++) {
      if (this.delay[k]) continue;
      const cx = (X[k] / C) | 0, cy = (Y[k] / C) | 0;
      if (cx >= 0 && cy >= 0 && cx < gw && cy < gh) occ[cy * gw + cx] = 1;
    }
  }

  // Water pouring out of a valve.
  pour(x, y, vx, vy) {
    if (this.waterTotal >= WATER_CAP) return false;
    if (this.add(x, y, vx, vy, WATER_COLS[(Math.random() * WATER_COLS.length) | 0]) < 0) return false;
    this.waterTotal++;
    return true;
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

  // One pass over the resting grains. u runs along gravity, v across it.
  // A grain with nothing under it starts falling; otherwise it tries to slide
  // diagonally; a grain that a piece moved on top of gets pushed out.
  stepSand(dir) {
    const { grid, mask, prevMask, occ, done, gw, gh, C } = this;
    const vert = dir[1] !== 0;
    const s = vert ? dir[1] : dir[0];
    const U = vert ? gh : gw, V = vert ? gw : gh;
    const su = vert ? gw : 1, sv = vert ? 1 : gw;
    const flip = (this.frame++ & 1) === 1;
    done.fill(0); // water that already flowed sideways this pass

    for (let k = 0; k < U - 1; k++) {
      const u = s > 0 ? U - 2 - k : 1 + k;
      const base = u * su, next = (u + s) * su;
      for (let m = 0; m < V; m++) {
        const v = flip ? V - 1 - m : m;
        const idx = base + v * sv;
        const c = grid[idx];
        if (!c || done[idx]) continue;
        if (mask[idx]) {
          if (prevMask[idx]) this.pushOut(idx, c, vert ? v : u, vert ? u : v, dir);
          continue;
        }

        const below = next + v * sv;
        if (occ[below]) continue; // a flying grain is passing underneath: wait
        const water = (c >>> 24) === WATER_A;
        const under = grid[below];
        // Sand is heavier than water: it swaps its way down through a pool.
        if (!water && under && (under >>> 24) === WATER_A) {
          if (Math.random() < 0.5) { grid[below] = c; grid[idx] = under; }
          continue;
        }
        if (!under && !mask[below]) {
          // A one-cell gap (a hole inside a pile) just closes; only a real drop
          // turns the grain into a flying one. Otherwise holes bubble up through
          // settled piles one flickering grain at a time.
          const u2 = u + 2 * s;
          const below2 = u2 >= 0 && u2 < U ? u2 * su + v * sv : -1;
          if (below2 < 0 || grid[below2] || mask[below2]) {
            grid[below] = c;
            grid[idx] = 0;
            continue;
          }
          const col = vert ? v : u, row = vert ? u : v;
          if (this.add((col + 0.5) * C, (row + 0.5) * C,
            vert ? rand(0.15) : s * 0.5, vert ? s * 0.5 : rand(0.15), c) >= 0) {
            grid[idx] = 0;
            occ[idx] = 1;
            this.sandCount--;
          } else {
            grid[below] = c;
            grid[idx] = 0;
          }
          continue;
        }

        const r = Math.random() < 0.5 ? -1 : 1;
        let moved = false;
        for (let t = 0; t < 2 && !moved; t++) {
          const v2 = v + (t ? -r : r);
          if (v2 < 0 || v2 >= V) continue;
          const diag = next + v2 * sv, side = base + v2 * sv;
          if (!grid[diag] && !mask[diag] && !occ[diag] && !grid[side] && !mask[side] && !occ[side]) {
            grid[diag] = c;
            grid[idx] = 0;
            moved = true;
          }
        }
        if (moved || !water) continue;

        // Water that can't go down spreads sideways, up to 3 cells a pass.
        for (let t = 0; t < 2 && !moved; t++) {
          const dv = t ? -r : r;
          let to = -1;
          for (let d = 1; d <= 3; d++) {
            const v2 = v + dv * d;
            if (v2 < 0 || v2 >= V) break;
            const j = base + v2 * sv;
            if (grid[j] || mask[j] || occ[j]) break;
            to = j;
            if (!grid[next + v2 * sv] && !mask[next + v2 * sv]) break; // found an edge to spill over
          }
          if (to >= 0) {
            grid[to] = c;
            grid[idx] = 0;
            done[to] = 1;
            moved = true;
          }
        }
      }
    }
  }

  // A piece moved onto a resting grain. Usually it just nudges the grain to the
  // nearest open cell; only a real impact (a thrown or falling piece) splashes it.
  pushOut(idx, c, cx, cy, dir) {
    const { grid, mask, gw, C } = this;
    const free = this.findFree(cx, cy, dir);
    if (free < 0) return;
    const b = this.maskBodies[mask[idx]];
    const speed = b ? Math.hypot(b.velocity.x, b.velocity.y) : 0;
    if (speed > 6) {
      const kick = Math.min(3, 0.5 + speed * 0.12);
      if (this.add(((free % gw) + 0.5) * C, (((free / gw) | 0) + 0.5) * C,
        b.velocity.x * 0.4 + rand(0.8) - dir[0] * kick,
        b.velocity.y * 0.4 + rand(0.8) - dir[1] * kick, c) >= 0) {
        grid[idx] = 0;
        this.sandCount--;
        return;
      }
    }
    grid[free] = c;
    grid[idx] = 0;
  }

  // Zero gravity: nothing piles up, but pieces drifting through sand scatter it.
  scatterBuried() {
    const { grid, mask, prevMask, gw, C } = this;
    for (let idx = 0; idx < grid.length; idx++) {
      if (!grid[idx] || !mask[idx] || !prevMask[idx]) continue;
      const b = this.maskBodies[mask[idx]];
      const x = idx % gw, y = (idx / gw) | 0;
      if (this.add((x + 0.5) * C, (y + 0.5) * C, (b?.velocity.x || 0) + rand(1), (b?.velocity.y || 0) + rand(1), grid[idx]) < 0) return;
      grid[idx] = 0;
      this.sandCount--;
    }
  }

  // ---------- drawing ----------

  render() {
    const { ctx, world } = this;
    if (!this.grid) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.n || this.sandCount) {
      const { buf, C, gw, gh } = this;
      buf.set(this.grid);
      for (let i = 0; i < this.n; i++) {
        if (this.delay[i]) continue;
        const cx = (this.x[i] / C) | 0, cy = (this.y[i] / C) | 0;
        if (cx >= 0 && cx < gw && cy >= 0 && cy < gh) buf[cy * gw + cx] = this.col[i];
      }
      this.pctx.putImageData(this.img, 0, 0);
      if (!this.hidePixels) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.pix, 0, 0, gw * this.D, gh * this.D);
      }
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const draw of this.overlays) draw(ctx);
  }
}

// Paints an element (background, borders, text, images) onto a canvas at 1:1,
// so its real pixels can become particles.
export function rasterize(el, w, h) {
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

function rand(n) { return (Math.random() - 0.5) * 2 * n; }

function hexRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// One of the 8 mirror/quarter-turn versions of an offset (s = 0 leaves it alone).
function turn(x, y, s) {
  if (s & 1) x = -x;
  if (s & 2) y = -y;
  return s & 4 ? [y, x] : [x, y];
}
