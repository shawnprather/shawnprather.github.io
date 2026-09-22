// Sand planets: dust and pieces pull on dust, and the dust swirls around
// whatever pulls it, so clumps and pieces end up wrapped in spinning dust like
// little planets. The pieces feel the dust's pull too.
//
// Summing pulls between thousands of grains directly would be millions of
// pairs per step, so grains are binned into 40px cells and the pull is computed
// between cells instead (a particle-mesh shortcut), then blended per grain.
//
// Space has no air: nothing here slows grains down in absolute terms, so a
// flung grain keeps flying and clumps keep their momentum. The only friction is
// between neighbours, which pulls grains in a clump toward the clump's own
// velocity, so clumps hold together while still drifting and spinning.

import { clamp } from './world.js';
import { showLegend } from './ui.js';

const { Body } = window.Matter;
const CELL = 40;
// The pull from a mass m at distance d:
//   a = K * m * exp(-d / range) / (d + SOFT)
// 1/d is how gravity falls off in a flat 2D world (it reaches much farther than
// 1/d²), and the exponential fades it out smoothly past about half a screen.
const K = 0.0045;
const SOFT = 30;          // keeps close encounters from exploding
const MAX_ACCEL = 0.15;   // px per step, per step (normal gravity is about 0.28)
// Swirl: every pull also pushes sideways (always counterclockwise), so dust falling
// toward something circles it instead of landing on it. That's what makes the
// planets spin, and it never runs down.
const SWIRL = 0.5;        // sideways push as a share of the pull
// Pieces pull dust as if they were made of it, at this share of their area.
const PIECE_DENSITY = 0.5;
const BODY_PULL = 0.3;    // pieces feel the dust's pull at reduced strength
const DENSE = 20;         // grains per cell where neighbour friction starts
const MAX_FRICTION = 0.12;
const START_SPIN = 0.0025; // radians per step given to everything on entry
// Never trapped: the system as a whole is gently kept centred on screen (the same
// tiny push on everything, so it doesn't change how things move relative to each
// other), and the screen edges push back softly instead of pinning things.
const CENTRE_PULL = 0.00015; // per px the dust's centre is off the screen centre
const MAX_CENTRE = 0.06;
const EDGE = 90;             // px from an edge where the push starts
const EDGE_PUSH = 0.2;       // push right at the edge (stronger than the dust's pull)

export class Accretion {
  constructor(world, particles) {
    this.world = world;
    this.particles = particles;
    this.active = false;
    this.frame = 0;
    this.centre = [0, 0];
    world.onStep(() => this.pullBodies());
  }

  enter() {
    const w = this.world, p = this.particles;
    if (w.state !== 'broken' || this.active) return;
    this.active = true;
    this.formed = false;
    this.legend = showLegend('Sand planets', [
      'Dust is pulled toward other dust and toward the pieces, and swirls around them, so things turn into spinning planets.',
      'No dust yet? Use <b>Sand</b> or <b>Shatter</b> on a few pieces. Try the <b>Magnet</b> or a <b>Bomb</b> to fling it.',
      'Press <kbd>N</kbd> again to turn normal gravity back on.',
    ]);
    // Resting sand floats up so it can join in.
    p.liftSand(w.W / 2, w.H / 2, Math.hypot(w.W, w.H), Infinity, () => [rand(0.3), rand(0.3)]);
    // No air drag on the pieces either while this is on, and they bounce more.
    this.saved = new Map();
    for (const it of w.liveItems()) {
      this.saved.set(it, [it.body.frictionAir, it.body.restitution]);
      it.body.frictionAir = 0;
      it.body.restitution = 0.6;
    }
    this.centre = [0, 0];
    this.spin(START_SPIN);
    p.selfGravity = this;
  }

  exit(fromRebuild = false) {
    if (!this.active) return;
    this.active = false;
    this.particles.selfGravity = null;
    if (!fromRebuild) {
      for (const [it, [fa, rest]] of this.saved) {
        if (!it.body) continue;
        it.body.frictionAir = fa;
        it.body.restitution = rest;
      }
    }
    this.saved = null;
    this.legend?.remove();
    this.legend = null;
  }

  // Adds a slow turn around the dust's centre of mass to every grain and piece.
  spin(omega) {
    const p = this.particles;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < p.n; i++) {
      if (p.delay[i]) continue;
      sx += p.x[i]; sy += p.y[i]; n++;
    }
    if (!n) return;
    const cx = sx / n, cy = sy / n;
    for (let i = 0; i < p.n; i++) {
      p.vx[i] -= (p.y[i] - cy) * omega;
      p.vy[i] += (p.x[i] - cx) * omega;
    }
    for (const it of this.world.liveItems()) {
      if (it.pinned) continue;
      const b = it.body;
      Body.setVelocity(b, {
        x: b.velocity.x - (b.position.y - cy) * omega,
        y: b.velocity.y + (b.position.x - cx) * omega,
      });
    }
  }

  // Bin the grains into cells, then work out the pull at every cell corner:
  // once from the dust alone (what the pieces feel) and once from dust and
  // pieces together (what the dust feels).
  compute(p) {
    const w = this.world;
    const { W, H } = w;
    const cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    const nw = cw + 1, nh = ch + 1;
    if (this.cw !== cw || this.ch !== ch) {
      this.cw = cw; this.ch = ch; this.nw = nw;
      this.mass = new Float32Array(cw * ch);
      this.sx = new Float32Array(cw * ch);
      this.sy = new Float32Array(cw * ch);
      this.mvx = new Float32Array(cw * ch);
      this.mvy = new Float32Array(cw * ch);
      this.dx = new Float32Array(nw * nh); // pull from dust only
      this.dy = new Float32Array(nw * nh);
      this.tx = new Float32Array(nw * nh); // pull from dust and pieces
      this.ty = new Float32Array(nw * nh);
    }
    const { mass, sx, sy, mvx, mvy } = this;
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
    // Dust sources: occupied cells at their centre of mass. Also each cell's
    // average velocity, which neighbour friction pulls its grains toward.
    const dust = [];
    let tm = 0, tsx = 0, tsy = 0;
    for (let c = 0; c < mass.length; c++) {
      if (!mass[c]) continue;
      tm += mass[c]; tsx += sx[c]; tsy += sy[c];
      mvx[c] /= mass[c];
      mvy[c] /= mass[c];
      dust.push(sx[c] / mass[c], sy[c] / mass[c], mass[c]);
    }
    // Piece sources: each piece counts as dust spread over its area.
    const pieces = [];
    const cell2 = p.C * p.C;
    for (const it of w.liveItems()) {
      const s = w.visualScale(it);
      pieces.push(it.body.position.x, it.body.position.y, ((it.w * it.h * s * s) / cell2) * PIECE_DENSITY);
    }
    // The gentle pull that keeps the whole system near the middle of the screen.
    if (tm) {
      let cx = (W / 2 - tsx / tm) * CENTRE_PULL, cy = (H / 2 - tsy / tm) * CENTRE_PULL;
      const a = Math.hypot(cx, cy);
      if (a > MAX_CENTRE) { cx *= MAX_CENTRE / a; cy *= MAX_CENTRE / a; }
      this.centre = [cx, cy];
    }

    const range = Math.max(250, Math.min(W, H) * 0.6);
    const field = [0, 0];
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nw; i++) {
        const n = j * nw + i, nx = i * CELL, ny = j * CELL;
        pull(dust, nx, ny, range, field);
        const gx = field[0], gy = field[1];
        cap(field);
        this.dx[n] = field[0];
        this.dy[n] = field[1];
        pull(pieces, nx, ny, range, field);
        field[0] += gx;
        field[1] += gy;
        cap(field);
        this.tx[n] = field[0];
        this.ty[n] = field[1];
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

  // What a grain at (x, y) feels. out[0..1]: pull, swirl, centring and edge
  // push. out[2]: how strongly neighbour friction acts there (0 in empty
  // space). out[3..4]: the velocity that friction pulls toward (the cell's average).
  sample(x, y, out) {
    this.field(this.tx, this.ty, x, y, out);
    const { W, H } = this.world;
    out[0] += this.centre[0] + edgePush(x, x, W);
    out[1] += this.centre[1] + edgePush(y, y, H);
    const i = clamp((x / CELL) | 0, 0, this.cw - 1), j = clamp((y / CELL) | 0, 0, this.ch - 1);
    const cell = j * this.cw + i;
    const m = this.mass[cell];
    out[2] = m > DENSE ? Math.min(MAX_FRICTION, (m - DENSE) / 800) : 0;
    out[3] = this.mvx[cell];
    out[4] = this.mvy[cell];
  }

  // Blend a field from the four corners of the cell (x, y) is in.
  field(fx, fy, x, y, out) {
    const nw = this.nw;
    const gx = clamp(x / CELL, 0, this.cw - 0.001), gy = clamp(y / CELL, 0, this.ch - 0.001);
    const i = gx | 0, j = gy | 0;
    const tx = gx - i, ty = gy - j;
    const a = j * nw + i, b = a + 1, c = a + nw, d = c + 1;
    out[0] = (fx[a] * (1 - tx) + fx[b] * tx) * (1 - ty) + (fx[c] * (1 - tx) + fx[d] * tx) * ty;
    out[1] = (fy[a] * (1 - tx) + fy[b] * tx) * (1 - ty) + (fy[c] * (1 - tx) + fy[d] * tx) * ty;
  }

  pullBodies() {
    if (!this.active || !this.dx) return;
    const out = [0, 0];
    const { W, H } = this.world;
    for (const it of this.world.liveItems()) {
      if (it.pinned) continue;
      const b = it.body;
      // Pieces feel only the dust (not each other, and not themselves), at reduced
      // strength; the centring and edge push act in full, measured from their
      // edges since a big piece touches the wall long before its middle does.
      this.field(this.dx, this.dy, b.position.x, b.position.y, out);
      const { min, max } = b.bounds;
      Body.setVelocity(b, {
        x: b.velocity.x + out[0] * BODY_PULL + this.centre[0] + edgePush(min.x, max.x, W),
        y: b.velocity.y + out[1] * BODY_PULL + this.centre[1] + edgePush(min.y, max.y, H),
      });
    }
  }
}

// Adds up the pull (and swirl) at (x, y) from a flat list of [x, y, mass] sources.
function pull(src, x, y, range, out) {
  let gx = 0, gy = 0;
  for (let k = 0; k < src.length; k += 3) {
    const dx = src[k] - x, dy = src[k + 1] - y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const a = (K * src[k + 2] * Math.exp(-d / range)) / (d + SOFT) / d;
    gx += (dx - dy * SWIRL) * a;
    gy += (dy + dx * SWIRL) * a;
  }
  out[0] = gx;
  out[1] = gy;
}

function cap(v) {
  const a = Math.hypot(v[0], v[1]);
  if (a > MAX_ACCEL) { v[0] *= MAX_ACCEL / a; v[1] *= MAX_ACCEL / a; }
}

// Push away from the screen edges for something spanning lo..hi along one axis.
function edgePush(lo, hi, size) {
  let a = 0;
  if (lo < EDGE) a += EDGE_PUSH * (1 - Math.max(0, lo) / EDGE);
  if (hi > size - EDGE) a -= EDGE_PUSH * (1 - Math.max(0, size - hi) / EDGE);
  return a;
}

function rand(n) { return (Math.random() - 0.5) * 2 * n; }
