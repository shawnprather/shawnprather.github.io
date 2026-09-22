// Putt-putt: the pile of pieces freezes into a mini-golf course. Drag back from
// the ball and let go to putt; sink it in the cup, then a new hole appears.

import { clamp } from './world.js';
import { fxEl, showLegend } from './ui.js';

const { Bodies, Body, Composite, Query } = window.Matter;
const BALL_R = 9;
const CUP_R = 14;
const MAX_PULL = 190;
const POWER = 0.13;
const BALL_AIR = 0.024;
const NAMES = { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par.', 1: 'Bogey.', 2: 'Double bogey.' };

export class Golf {
  constructor(world, orbits, particles) {
    this.world = world;
    this.orbits = orbits;
    this.active = false;
    this.say = () => {};
    world.onStep(() => this.step());
    world.onRender(() => this.render());
    particles.overlays.push((ctx) => this.draw(ctx));
  }

  enter() {
    const w = this.world;
    if (w.state !== 'broken' || this.active) return;
    this.active = true;
    this.hole = 0;
    this.total = 0;
    this.parPlayed = 0;
    this.aim = null;

    // Freeze the pile where it lies. That's the course.
    this.frozen = w.liveItems();
    for (const it of this.frozen) {
      Body.setStatic(it.body, true);
      it.pinned = true;
    }

    this.legend = showLegend('Putt-putt', [
      'Drag back from the white ball and let go to putt. Farther back hits harder.',
      'Sink it in the cup with the flag. The whole page is frozen into the course.',
      'Press <kbd>P</kbd> again (or pick any tool) to unfreeze everything.',
    ]);
    const start = this.freeSpot(null, 0);
    this.ball = Bodies.circle(start.x, start.y, BALL_R, {
      restitution: 0.7, friction: 0.02, frictionAir: BALL_AIR, density: 0.004, label: 'ball',
    });
    Composite.add(w.engine.world, this.ball);
    this.ballEl = fxEl('golf-ball');
    this.cupEl = fxEl('golf-cup');
    this.cupEl.innerHTML = '<span class="golf-flag"></span>';
    this.card = document.createElement('div');
    this.card.className = 'golf-card';
    this.card.setAttribute('aria-live', 'polite');
    document.body.append(this.card);
    this.nextHole();
  }

  exit(fromRebuild = false) {
    if (!this.active) return;
    this.active = false;
    this.aim = null;
    if (!fromRebuild) {
      Composite.remove(this.world.engine.world, this.ball);
      for (const it of this.frozen) {
        it.pinned = false;
        if (it.body) Body.setStatic(it.body, false);
      }
    }
    this.frozen = [];
    [this.ballEl, this.cupEl, this.card, this.legend].forEach((el) => el?.remove());
  }

  // A random open spot on screen, away from every piece (and from `from`).
  freeSpot(from, minDist) {
    const w = this.world;
    const top = (document.querySelector('.toolbar')?.getBoundingClientRect().bottom || 0) + 40;
    const bottom = (document.querySelector('.orbit-legend')?.getBoundingClientRect().top || w.H) - 30;
    const bodies = w.liveItems().map((it) => it.body);
    let best = null;
    for (let t = 0; t < 400; t++) {
      const p = { x: 40 + Math.random() * (w.W - 80), y: top + Math.random() * Math.max(10, bottom - top) };
      if (from && Math.hypot(p.x - from.x, p.y - from.y) < minDist * (1 - t / 500)) continue;
      let clear = true;
      for (let a = 0; a < 8 && clear; a++) {
        const q = { x: p.x + Math.cos(a * 0.785) * 30, y: p.y + Math.sin(a * 0.785) * 30 };
        if (Query.point(bodies, q).length || Query.point(bodies, p).length) clear = false;
      }
      if (clear) return p;
      best ||= p;
    }
    return best || { x: w.W / 2, y: w.H / 2 };
  }

  nextHole() {
    this.hole++;
    this.strokes = 0;
    this.sinking = false;
    const b = this.ball.position;
    this.cup = this.freeSpot(b, Math.min(this.world.W, this.world.H) * 0.5);
    this.par = clamp(Math.round(Math.hypot(this.cup.x - b.x, this.cup.y - b.y) / 300) + 2, 2, 5);
    this.cupEl.style.transform = `translate(${this.cup.x - CUP_R}px, ${this.cup.y - CUP_R}px)`;
    this.cupEl.querySelector('.golf-flag').textContent = this.hole;
    this.updateCard();
  }

  updateCard() {
    const over = this.total - this.parPlayed;
    const score = this.parPlayed ? ` · Total ${this.total} (${over > 0 ? '+' : ''}${over || 'E'})` : '';
    this.card.textContent = `Hole ${this.hole} · Par ${this.par} · Strokes ${this.strokes}${score}`;
  }

  // Pointer input, routed here by the toolbox while putt-putt is on.
  down(p) {
    if (!this.active || this.sinking) return;
    const b = this.ball;
    if (Math.hypot(b.velocity.x, b.velocity.y) > 0.4) { this.say('Wait for the ball to stop.'); return; }
    if (Math.hypot(p.x - b.position.x, p.y - b.position.y) > 90) { this.say('Start your drag on the white ball.'); return; }
    this.aim = true;
    this.pointer = p;
  }

  move(p) { this.pointer = p; }

  up() {
    if (!this.aim) return;
    this.aim = null;
    const v = this.shotVelocity();
    if (!v) return;
    Body.setVelocity(this.ball, v);
    this.strokes++;
    this.updateCard();
    this.world.emit('putt');
  }

  shotVelocity() {
    const b = this.ball.position;
    let x = this.pointer.x - b.x, y = this.pointer.y - b.y;
    const len = Math.hypot(x, y);
    if (len < 10) return null;
    if (len > MAX_PULL) { x *= MAX_PULL / len; y *= MAX_PULL / len; }
    return { x: -x * POWER, y: -y * POWER };
  }

  step() {
    if (!this.active) return;
    const b = this.ball;
    const v = Math.hypot(b.velocity.x, b.velocity.y);
    if (this.sinking) { Body.setVelocity(b, { x: 0, y: 0 }); return; }
    if (v < 0.06) Body.setVelocity(b, { x: 0, y: 0 });
    const d = Math.hypot(b.position.x - this.cup.x, b.position.y - this.cup.y);
    if (d < CUP_R - 3 && v < 5) this.sink();
    else if (d < CUP_R && !this.lipped) {
      // Too fast: it rattles over the lip.
      this.lipped = true;
      Body.setVelocity(b, { x: b.velocity.x * 0.8 + rand(1), y: b.velocity.y * 0.8 + rand(1) });
    } else if (d > CUP_R + 8) this.lipped = false;
  }

  sink() {
    this.sinking = true;
    Body.setPosition(this.ball, { x: this.cup.x, y: this.cup.y });
    this.ballEl.classList.add('sunk');
    const s = this.strokes, par = this.par;
    this.total += s;
    this.parPlayed += par;
    this.updateCard();
    const diff = s - par;
    this.say(s === 1 ? 'Hole in one!' : `${NAMES[diff] ?? `${diff} over par.`} ${s} strokes on a par ${par}.`);
    this.world.emit('hole-done', { strokes: s, par });
    setTimeout(() => {
      if (!this.active) return;
      this.ballEl.classList.remove('sunk');
      this.nextHole();
    }, 1400);
  }

  render() {
    if (!this.active) return;
    const { x, y } = this.ball.position;
    this.ballEl.style.transform = `translate(${x - BALL_R}px, ${y - BALL_R}px)`;
  }

  draw(ctx) {
    if (!this.active || !this.aim) return;
    const v = this.shotVelocity();
    if (!v) return;
    const b = this.ball.position;
    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(this.pointer.x, this.pointer.y);
    ctx.stroke();
    const pts = this.orbits.predict(b.x, b.y, v.x, v.y, 120, BALL_AIR);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i += 2) {
      ctx.globalAlpha = 1 - i / pts.length;
      ctx.beginPath();
      ctx.arc(pts[i], pts[i + 1], 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function rand(n) { return (Math.random() - 0.5) * 2 * n; }
