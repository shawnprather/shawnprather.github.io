// Water valves, and pieces that float.
//
// The water itself lives in the particle layer (it's sand with a different flag
// that spreads sideways). This module places the valves and pushes pieces up
// when they sit in a pool, by comparing the pool's surface to the piece's bottom.

import { fxEl } from './ui.js';
import { WATER_A } from './particles.js';

const { Body } = window.Matter;
const MAX_VALVES = 3;
const FLOW = 7;          // drops per step per valve
const BUOYANCY = 1.8;    // >1 so pieces float with part of them above water

export class Water {
  constructor(world, particles) {
    this.world = world;
    this.particles = particles;
    this.valves = [];
    this.floatTimer = 0;
    this.flooded = false;
    world.onStep(() => this.step());
    world.on('rebuild-start', () => this.clear());
  }

  clear() {
    this.valves.forEach((v) => v.el.remove());
    this.valves = [];
    this.flooded = false;
  }

  // Click empty space to add a valve, click a valve to turn it off.
  toggleValve(p, say) {
    const hit = this.valves.find((v) => Math.hypot(v.x - p.x, v.y - p.y) < 26);
    if (hit) {
      hit.el.remove();
      this.valves = this.valves.filter((v) => v !== hit);
      return;
    }
    if (this.valves.length >= MAX_VALVES) {
      say('Three valves is plenty. Click one to shut it off.');
      return;
    }
    const el = fxEl('valve');
    el.style.transform = `translate(${p.x - 22}px, ${p.y - 22}px)`;
    this.valves.push({ x: p.x, y: p.y, el });
    this.world.emit('valve');
  }

  step() {
    const w = this.world, p = this.particles;
    if (w.state !== 'broken' || !p.grid) return;

    if (this.valves.length) {
      // Valves point along gravity (straight down when gravity is off).
      const g = w.gravity;
      const len = Math.hypot(g.x, g.y);
      const dx = len ? g.x / len : 0, dy = len ? g.y / len : 1;
      let poured = false;
      for (const v of this.valves) {
        for (let k = 0; k < FLOW; k++) {
          poured = p.pour(v.x + dx * 16 + rand(3), v.y + dy * 16 + rand(3),
            dx * 2 + rand(0.35), dy * 2 + rand(0.35)) || poured;
        }
        v.el.classList.toggle('dry', !poured);
      }
      if (!this.flooded && p.waterTotal > 12000) {
        this.flooded = true;
        w.emit('flood');
      }
    }

    if (p.waterTotal) this.buoy();
  }

  // Pieces in a pool get pushed up in proportion to how deep they sit.
  buoy() {
    const w = this.world, p = this.particles;
    if (w.gravity.x !== 0 || w.gravity.y <= 0) return; // only for normal, downward gravity
    const { grid, C, gw, gh } = p;
    const isWater = (x, y) => {
      if (x < 0 || y < 0 || x >= gw || y >= gh) return false;
      const c = grid[y * gw + x];
      return c !== 0 && c >>> 24 === WATER_A;
    };
    // Top of the water in a column, searching up from a starting row.
    const surface = (cx, row) => {
      let r = row;
      if (!isWater(cx, r)) return null;
      while (r > 0 && isWater(cx, r - 1)) r--;
      return r * C;
    };

    let floating = false;
    for (const it of w.liveItems()) {
      const b = it.body;
      if (it.pinned || b.isStatic) continue;
      const { min, max } = b.bounds;
      const h = max.y - min.y;
      const row = Math.min(gh - 1, ((max.y - C) / C) | 0);
      const left = surface(((min.x - C) / C) | 0, row);
      const right = surface(((max.x + C) / C) | 0, row);
      const top = left === null ? right : right === null ? left : Math.min(left, right);
      if (top === null) continue;
      const f = Math.min(1, Math.max(0, (max.y - top) / h));
      if (!f) continue;
      Body.applyForce(b, b.position, { x: 0, y: -f * b.mass * 0.001 * w.gravity.y * BUOYANCY });
      // Water drag: slows everything, and damps the bobbing.
      const drag = 1 - 0.05 * f;
      Body.setVelocity(b, { x: b.velocity.x * drag, y: b.velocity.y * drag });
      Body.setAngularVelocity(b, b.angularVelocity * (1 - 0.06 * f));
      if (f > 0.15 && f < 0.95 && Math.abs(b.velocity.y) < 0.3) floating = true;
    }
    // "It floats!" once something has sat afloat for a second.
    this.floatTimer = floating ? this.floatTimer + 1 : 0;
    if (this.floatTimer === 60) w.emit('float');
  }
}

function rand(n) { return (Math.random() - 0.5) * 2 * n; }
