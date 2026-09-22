// Orbit mode: gravity off, a sun in the middle, and every piece of the page on
// its own circular orbit. Section headings are planets you can click to visit.
// Also home of the trajectory predictor the slingshot uses.

import { G_STEP, clamp } from './world.js';

const { Bodies, Body, Composite } = window.Matter;
const SETUP_STEPS = 54;
const GOLDEN_ANGLE = 2.39996;

export class Orbits {
  constructor(world) {
    this.world = world;
    this.active = false;
    this.trails = new Map();
    this.frame = 0;
    world.on('rebuild-start', () => this.exit(true));
    world.on('resize', () => { if (this.active) this.placeSun(); });
    world.on('release', ({ item }) => this.track(item));
    world.onStep(() => this.step());
  }

  enter() {
    const w = this.world;
    if (w.state !== 'broken' || this.active) return;
    this.active = true;
    document.documentElement.classList.add('orbiting');
    this.accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    this.showLegend();
    this.placeSun();

    const live = w.liveItems();
    const order = [
      ...live.filter((it) => it.section),
      ...live.filter((it) => it.isLetter),
      ...live.filter((it) => !it.section && !it.isLetter),
    ];
    const { cx, cy, R, reach } = this.geo;
    const phase = Math.random() * Math.PI * 2;
    this.setup = { t: 0, moves: [] };
    order.forEach((it, i) => {
      const b = it.body;
      it.saved = { frictionAir: b.frictionAir, inertia: b.inertia };
      b.frictionAir = 0;
      Body.setInertia(b, Infinity);
      b.collisionFilter.group = -1; // pieces pass through each other, so orbits stay clean
      // Keep each piece clear of the sun and of the screen edges, whatever its size.
      const half = (Math.hypot(it.w, it.h) * w.visualScale(it)) / 2;
      const lo = R + half + 8;
      const hi = Math.max(lo, reach - half);
      const f = order.length > 1 ? i / (order.length - 1) : 0;
      const r = lo + (hi - lo) * Math.sqrt(f);
      const ang = phase + i * GOLDEN_ANGLE;
      this.setup.moves.push({
        it, r, ang, fa: Math.atan2(Math.sin(b.angle), Math.cos(b.angle)),
        fx: b.position.x, fy: b.position.y,
        tx: cx + Math.cos(ang) * r, ty: cy + Math.sin(ang) * r,
      });
      it.pinned = true;
    });
    w.emit('orbit-on');
  }

  exit(fromRebuild = false) {
    if (!this.active) return;
    this.active = false;
    this.setup = null;
    this.tracking = null;
    this.trails.clear();
    document.documentElement.classList.remove('orbiting');
    this.legend?.remove();
    this.legend = null;
    const w = this.world;
    if (this.sun) {
      Composite.remove(w.engine.world, this.sun.body);
      w.fields = w.fields.filter((f) => f !== this.sun.field);
      this.sun.el.remove();
      this.sun = null;
    }
    if (!fromRebuild) {
      for (const it of w.items) {
        it.pinned = false;
        if (!it.body || !it.saved) continue;
        it.body.frictionAir = it.saved.frictionAir;
        Body.setInertia(it.body, it.saved.inertia);
        it.body.collisionFilter.group = 0;
      }
    }
    w.emit('orbit-off');
  }

  // Orbit mode is not obvious, so it explains itself for as long as it is on.
  showLegend() {
    const el = document.createElement('div');
    el.className = 'orbit-legend';
    el.innerHTML = `
      <strong>Solar system</strong>
      <ul>
        <li>The orange labels (About, Projects, Experience, Contact) are planets. Click one to fly to that section.</li>
        <li>Drag and fling anything to knock it into a new orbit.</li>
        <li>Press <kbd>O</kbd> or the Solar system button again to turn gravity back on.</li>
      </ul>`;
    document.body.append(el);
    this.legend = el;
  }

  placeSun() {
    const { W, H } = this.world;
    // Fit the system between the toolbar and the legend card.
    const top = (document.querySelector('.toolbar')?.getBoundingClientRect().bottom || 0) + 8;
    const bottom = (this.legend?.getBoundingClientRect().top || H) - 8;
    const cx = W / 2, cy = (top + bottom) / 2;
    const reach = Math.max(80, Math.min(cx, (bottom - top) / 2));
    const R = clamp(reach * 0.14, 24, 56);
    const rMax = Math.max(R + 60, reach);
    // Pick GM so the outermost orbit takes about 16 seconds.
    const T = 960;
    const GM = Math.pow((2 * Math.PI * Math.pow(rMax, 1.5)) / T, 2);
    this.geo = { cx, cy, R, reach, rMax, GM };

    if (!this.sun) {
      const el = document.createElement('div');
      el.className = 'sun fx-el';
      el.textContent = 'SP';
      el.setAttribute('aria-hidden', 'true');
      document.body.append(el);
      const body = Bodies.circle(cx, cy, R, { isStatic: true, label: 'sun' });
      Composite.add(this.world.engine.world, body);
      // Particles that fall into the sun burn up (sinkR); bodies just orbit.
      const field = { kind: 'grav', x: cx, y: cy, GM, rmin: R, sinkR: R * 0.9 };
      this.world.fields.push(field);
      this.sun = { el, body, field };
    } else {
      Body.setPosition(this.sun.body, { x: cx, y: cy });
      Object.assign(this.sun.field, { x: cx, y: cy, GM, rmin: R, sinkR: R * 0.9 });
    }
    const st = this.sun.el.style;
    st.width = st.height = 2 * R + 'px';
    st.fontSize = R * 0.7 + 'px';
    st.transform = `translate(${cx - R}px, ${cy - R}px)`;
  }

  step() {
    if (!this.active) return;
    const S = this.setup;
    if (S) {
      S.t++;
      const k = easeInOut(Math.min(1, S.t / SETUP_STEPS));
      for (const m of S.moves) {
        const b = m.it.body;
        if (!b) continue;
        Body.setPosition(b, { x: m.fx + (m.tx - m.fx) * k, y: m.fy + (m.ty - m.fy) * k });
        Body.setAngle(b, m.fa * (1 - k));
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setAngularVelocity(b, 0); // no air friction in orbit, so old spin would never stop
      }
      if (S.t >= SETUP_STEPS) {
        const { GM } = this.geo;
        for (const m of S.moves) {
          m.it.pinned = false;
          const b = m.it.body;
          if (!b) continue;
          const v = Math.sqrt(GM / m.r);
          Body.setVelocity(b, { x: -Math.sin(m.ang) * v, y: Math.cos(m.ang) * v });
        }
        this.setup = null;
      }
    }

    if (++this.frame % 3 === 0) {
      for (const it of this.world.liveItems()) {
        let t = this.trails.get(it);
        if (!t) this.trails.set(it, (t = []));
        t.push(it.body.position.x, it.body.position.y);
        if (t.length > 48) t.splice(0, 2);
      }
    }

    // "Stable orbit": a thrown piece that loops all the way around the sun.
    const tr = this.tracking;
    if (tr) {
      const b = tr.it.body;
      const { cx, cy, R, rMax } = this.geo;
      const { W, H } = this.world;
      if (!b) { this.tracking = null; return; }
      const dx = b.position.x - cx, dy = b.position.y - cy;
      const d = Math.hypot(dx, dy);
      const bb = b.bounds;
      if (d < R + 4 || d > rMax * 1.6 || bb.min.x < 2 || bb.min.y < 2 || bb.max.x > W - 2 || bb.max.y > H - 2) {
        this.tracking = null;
        return;
      }
      const a = Math.atan2(dy, dx);
      tr.sum += Math.atan2(Math.sin(a - tr.prev), Math.cos(a - tr.prev));
      tr.prev = a;
      if (Math.abs(tr.sum) >= Math.PI * 2) {
        this.world.emit('stable-orbit');
        this.tracking = null;
      }
    }
  }

  track(item) {
    if (!this.active || this.setup || !item?.body) return;
    const { cx, cy } = this.geo;
    this.tracking = { it: item, sum: 0, prev: Math.atan2(item.body.position.y - cy, item.body.position.x - cx) };
  }

  drawTrails(ctx) {
    if (!this.active || this.setup) return;
    ctx.save();
    ctx.strokeStyle = this.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const [it, t] of this.trails) {
      if (!it.body || t.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(t[0], t[1]);
      for (let i = 2; i < t.length; i += 2) ctx.lineTo(t[i], t[i + 1]);
      ctx.lineTo(it.body.position.x, it.body.position.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Where a body launched from (x, y) at (vx, vy) will go under the current
  // gravity and fields. Mirrors the integration Matter does each step.
  predict(x, y, vx, vy, steps, frictionAir) {
    const w = this.world;
    const gx = w.gravity.x * G_STEP, gy = w.gravity.y * G_STEP;
    const out = [0, 0];
    const pts = [];
    for (let i = 0; i < steps; i++) {
      w.accelAt(x, y, out);
      vx = (vx + out[0]) * (1 - frictionAir) + gx;
      vy = (vy + out[1]) * (1 - frictionAir) + gy;
      x += vx;
      y += vy;
      if (x < 0 || y < 0 || x > w.W || y > w.H) break;
      if (i % 3 === 2) pts.push(x, y);
    }
    return pts;
  }
}

function easeInOut(k) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}
