// Sand planets: every grain pulls on every other grain, so dust clumps into
// little worlds that orbit, collide and merge. The pieces feel the pull too.
//
// Summing pulls between thousands of grains directly would be millions of
// pairs per step, so grains are binned into 40px cells and the pull is computed
// between cells instead (a particle-mesh shortcut), then blended per grain.
//
// Space has no air: nothing here slows grains down in absolute terms, so a
// flung grain keeps flying and clumps keep their momentum. The only friction is
// between neighbours, which pulls grains in a clump toward the clump's own
// velocity, so clumps hold together while still drifting and orbiting.

import { clamp } from './world.js';
import { showLegend } from './ui.js';

const { Body } = window.Matter;
const CELL = 40;
// The pull from a clump of mass m at distance d:
//   a = K * m * exp(-d / range) / (d + SOFT)
// 1/d is how gravity falls off in a flat 2D world (it reaches much farther than
// 1/d²), and the exponential fades it out smoothly past about half a screen.
const K = 0.0045;
const SOFT = 30;          // keeps close encounters from exploding
const MAX_ACCEL = 0.15;   // px per step, per step (normal gravity is about 0.28)
const BODY_PULL = 0.3;    // pieces feel less of it than dust does
const DENSE = 20;         // grains per cell where neighbour friction starts
const MAX_FRICTION = 0.12;

export class Accretion {
  constructor(world, particles) {
    this.world = world;
    this.particles = particles;
    this.active = false;
    this.frame = 0;
    world.onStep(() => this.pullBodies());
  }

  enter() {
    const w = this.world, p = this.particles;
    if (w.state !== 'broken' || this.active) return;
    this.active = true;
    this.formed = false;
    this.legend = showLegend('Sand planets', [
      'Every grain of sand pulls on every other grain, so dust clumps into planets that drift and orbit.',
      'No dust yet? Use <b>Sand</b> or <b>Shatter</b> on a few pieces. Try the <b>Magnet</b> or a <b>Bomb</b> to fling it.',
      'Press <kbd>N</kbd> again to turn normal gravity back on.',
    ]);
    // Resting sand floats up so it can join in.
    p.liftSand(w.W / 2, w.H / 2, Math.hypot(w.W, w.H), Infinity, () => [rand(0.3), rand(0.3)]);
    // No air drag on the pieces either, while this is on.
    this.saved = new Map();
    for (const it of w.liveItems()) {
      this.saved.set(it, it.body.frictionAir);
      it.body.frictionAir = 0;
    }
    p.selfGravity = this;
  }

  exit(fromRebuild = false) {
    if (!this.active) return;
    this.active = false;
    this.particles.selfGravity = null;
    if (!fromRebuild) {
      for (const [it, fa] of this.saved) if (it.body) it.body.frictionAir = fa;
    }
    this.saved = null;
    this.legend?.remove();
    this.legend = null;
  }

  // Bin the grains into cells, then work out the pull at every cell corner.
  compute(p) {
    const { W, H } = this.world;
    const cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    const nw = cw + 1, nh = ch + 1;
    if (this.cw !== cw || this.ch !== ch) {
      this.cw = cw; this.ch = ch; this.nw = nw;
      this.mass = new Float32Array(cw * ch);
      this.sx = new Float32Array(cw * ch);
      this.sy = new Float32Array(cw * ch);
      this.mvx = new Float32Array(cw * ch);
      this.mvy = new Float32Array(cw * ch);
      this.ax = new Float32Array(nw * nh);
      this.ay = new Float32Array(nw * nh);
    }
    const { mass, sx, sy, mvx, mvy, ax, ay } = this;
    mass.fill(0); sx.fill(0); sy.fill(0); mvx.fill(0); mvy.fill(0);
    for (let i = 0; i < p.n; i++) {
      if (p.delay[i]) continue;
      const x = p.x[i], y = p.y[i];
      const c = clamp((y / CELL) | 0, 0, ch - 1) * cw + clamp((x / CELL) | 0, 0, cw - 1);
      mass[c]++;
      sx[c] += x;
      sy[c] += y;
      mvx[c] += p.vx[i];
      mvy[c] += p.vy[i];
    }
    // Sources: occupied cells at their centre of mass. Also each cell's average
    // velocity, which neighbour friction pulls its grains toward.
    const src = [];
    for (let c = 0; c < mass.length; c++) {
      if (!mass[c]) continue;
      mvx[c] /= mass[c];
      mvy[c] /= mass[c];
      src.push(sx[c] / mass[c], sy[c] / mass[c], mass[c]);
    }
    const range = Math.max(250, Math.min(W, H) * 0.6);
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nw; i++) {
        const nx = i * CELL, ny = j * CELL;
        let gx = 0, gy = 0;
        for (let k = 0; k < src.length; k += 3) {
          const dx = src[k] - nx, dy = src[k + 1] - ny;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const a = (K * src[k + 2] * Math.exp(-d / range)) / (d + SOFT);
          gx += (dx / d) * a;
          gy += (dy / d) * a;
        }
        const a = Math.hypot(gx, gy);
        if (a > MAX_ACCEL) { gx *= MAX_ACCEL / a; gy *= MAX_ACCEL / a; }
        ax[j * nw + i] = gx;
        ay[j * nw + i] = gy;
      }
    }
    // A planet is born: lots of dust packed into a 3x3 block of cells.
    if (!this.formed && ++this.frame % 30 === 0) {
      let best = 0;
      for (let y = 1; y < ch - 1; y++) {
        for (let x = 1; x < cw - 1; x++) {
          let m = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m += mass[(y + dy) * cw + x + dx];
          if (m > best) best = m;
        }
      }
      if (best >= 900) {
        this.formed = true;
        this.world.emit('planet-formed');
      }
    }
  }

  // Blend the pull from the four corners of the grain's cell into out[0..1].
  // out[2] is how strongly neighbour friction acts there (0 in empty space),
  // out[3..4] the velocity it pulls toward: the cell's average.
  sample(x, y, out) {
    const { nw, ax, ay } = this;
    const fx = clamp(x / CELL, 0, this.cw - 0.001), fy = clamp(y / CELL, 0, this.ch - 0.001);
    const i = fx | 0, j = fy | 0;
    const tx = fx - i, ty = fy - j;
    const a = j * nw + i, b = a + 1, c = a + nw, d = c + 1;
    out[0] = (ax[a] * (1 - tx) + ax[b] * tx) * (1 - ty) + (ax[c] * (1 - tx) + ax[d] * tx) * ty;
    out[1] = (ay[a] * (1 - tx) + ay[b] * tx) * (1 - ty) + (ay[c] * (1 - tx) + ay[d] * tx) * ty;
    const cell = j * this.cw + i;
    const m = this.mass[cell];
    out[2] = m > DENSE ? Math.min(MAX_FRICTION, (m - DENSE) / 800) : 0;
    out[3] = this.mvx[cell];
    out[4] = this.mvy[cell];
  }

  pullBodies() {
    if (!this.active || !this.ax) return;
    const out = [0, 0, 0, 0, 0];
    for (const it of this.world.liveItems()) {
      if (it.pinned) continue;
      const b = it.body;
      this.sample(b.position.x, b.position.y, out);
      Body.setVelocity(b, { x: b.velocity.x + out[0] * BODY_PULL, y: b.velocity.y + out[1] * BODY_PULL });
    }
  }
}

function rand(n) { return (Math.random() - 0.5) * 2 * n; }
