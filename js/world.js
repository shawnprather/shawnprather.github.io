// The physics world. Turns tagged DOM elements into Matter.js bodies,
// keeps each element glued to its body, and puts everything back on rebuild.

const { Engine, Bodies, Body, Composite, Events, Query } = window.Matter;

export const STEP = 1000 / 60;
// Velocity change per step that Matter's default gravity (scale 0.001) causes.
export const G_STEP = 0.001 * STEP * STEP;

export class World {
  constructor() {
    this.engine = Engine.create();
    this.state = 'normal'; // normal | broken | rebuilding
    this.items = [];
    this.byBody = new Map();
    this.walls = [];
    this.scale = 1;
    this.W = innerWidth;
    this.H = innerHeight;
    this.listeners = {};
    this.stepHooks = [];
    this.afterStepHooks = [];
    this.renderHooks = [];
    // Force fields shared by bodies and particles: planets, black holes, the sun, the magnet.
    this.fields = [];
    this.acc2 = [0, 0];
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.loop = this.loop.bind(this);

    Events.on(this.engine, 'beforeUpdate', () => {
      this.applyFields();
      this.stepHooks.forEach((f) => f());
    });
    Events.on(this.engine, 'afterUpdate', () => this.afterStepHooks.forEach((f) => f()));
    addEventListener('resize', () => this.onResize());
    this.watchPixelRatio();
  }

  // Dragging the window between a Retina screen and a normal one changes the
  // pixel ratio, which doesn't always fire a resize. Treat it as one.
  watchPixelRatio() {
    const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => {
      this.onResize();
      this.watchPixelRatio();
    }, { once: true });
  }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, data) { (this.listeners[name] || []).forEach((fn) => fn(data)); }
  onStep(fn) { this.stepHooks.push(fn); }
  afterStep(fn) { this.afterStepHooks.push(fn); }
  onRender(fn) { this.renderHooks.push(fn); }

  get gravity() { return this.engine.gravity; }

  // ---------- break ----------

  breakPage() {
    if (this.state !== 'normal') return;
    document.querySelectorAll('[data-phys="letters"]').forEach(splitLetters);

    const els = [...document.querySelectorAll('[data-phys]')]
      .filter((el) => el.dataset.phys !== 'letters' && !el.closest('[hidden]'));
    const rects = els.map((el) => el.getBoundingClientRect());

    this.W = innerWidth;
    this.H = innerHeight;
    // Shrink everything so the whole site fits on one screen as rubble.
    const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
    this.scale = clamp(Math.sqrt((0.34 * this.W * this.H) / area), 0.26, 1);
    this.scaleStart = performance.now();
    this.scaleEase = this.reduceMotion ? 1 : 1 / this.scale;
    this.savedScroll = scrollY;

    document.documentElement.classList.add('broken');
    this.state = 'broken';
    this.makeWalls();

    const later = [];
    els.forEach((el, i) => {
      const r = rects[i];
      if (!r.width || !r.height) return;
      const item = this.adopt(el, r.width, r.height);
      if (r.bottom > 0 && r.top < this.H) {
        this.spawn(item, r.left + r.width / 2, r.top + r.height / 2);
      } else {
        el.classList.add('phys-hidden');
        later.push(item);
      }
    });

    // Everything below the fold rains in from the top, one piece at a time.
    later.forEach((item, i) => {
      setTimeout(() => {
        if (this.state !== 'broken' || item.body) return;
        item.el.classList.remove('phys-hidden');
        this.spawnAtTop(item);
      }, 250 + i * 70);
    });

    this.last = undefined;
    this.acc = 0;
    this.raf = requestAnimationFrame(this.loop);
    this.emit('broken');
  }

  adopt(el, w, h) {
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.classList.add('phys-body');
    const item = {
      el, w, h, body: null, hidden: false, vs: null,
      isLetter: el.classList.contains('letter'),
      section: el.matches('.section > h2') ? el.closest('section').id : null,
    };
    if (item.section) el.dataset.section = item.section;
    this.items.push(item);
    return item;
  }

  // Adds an element after the break (the secret card), dropping it from the top.
  addElement(el) {
    if (this.state !== 'broken') return null;
    const r = el.getBoundingClientRect();
    const item = this.adopt(el, r.width, r.height);
    this.spawnAtTop(item, this.W / 2);
    return item;
  }

  spawn(item, x, y) {
    const s = this.scale;
    const body = Bodies.rectangle(x, y, Math.max(6, item.w * s), Math.max(6, item.h * s), {
      restitution: 0.2,
      friction: 0.5,
      frictionAir: 0.01,
      label: 'item',
    });
    item.body = body;
    this.byBody.set(body, item);
    Composite.add(this.engine.world, body);
    this.emit('spawn', item);
  }

  spawnAtTop(item, x) {
    const hw = (item.w * this.scale) / 2;
    const px = x ?? hw + Math.random() * Math.max(1, this.W - 2 * hw);
    this.spawn(item, clamp(px, hw, this.W - hw), (item.h * this.scale) / 2 + 70);
    Body.setAngle(item.body, (Math.random() - 0.5) * 0.6);
  }

  makeWalls() {
    Composite.remove(this.engine.world, this.walls);
    const { W, H } = this;
    const T = 400;
    const opts = { isStatic: true, label: 'wall', friction: 0.6 };
    this.walls = [
      Bodies.rectangle(W / 2, H + T / 2, W + 2 * T, T, opts),
      Bodies.rectangle(W / 2, -T / 2, W + 2 * T, T, opts),
      Bodies.rectangle(-T / 2, H / 2, T, H + 2 * T, opts),
      Bodies.rectangle(W + T / 2, H / 2, T, H + 2 * T, opts),
    ];
    Composite.add(this.engine.world, this.walls);
  }

  onResize() {
    if (this.state !== 'broken') return;
    this.W = innerWidth;
    this.H = innerHeight;
    this.makeWalls();
    for (const it of this.items) {
      if (!it.body) continue;
      const { x, y } = it.body.position;
      Body.setPosition(it.body, { x: clamp(x, 10, this.W - 10), y: clamp(y, 10, this.H - 10) });
    }
    this.emit('resize');
  }

  // ---------- queries and removal ----------

  liveItems() { return this.items.filter((it) => it.body && !it.hidden); }

  itemAt(p) {
    const hits = Query.point(this.liveItems().map((it) => it.body), p);
    return hits.length ? this.byBody.get(hits[hits.length - 1]) : null;
  }

  // Takes an item out of the simulation (shattered, sanded, swallowed).
  // The element stays where it was drawn until the caller hides it.
  removeBody(item) {
    if (!item.body) return;
    Composite.remove(this.engine.world, item.body);
    this.byBody.delete(item.body);
    item.lastBody = { x: item.body.position.x, y: item.body.position.y, angle: item.body.angle };
    item.body = null;
    item.hidden = true;
  }

  visualScale(item) {
    return item.vs ?? this.scale * this.scaleEase;
  }

  // ---------- force fields ----------

  // Sums the acceleration (px per step, per step) at a point into out.
  // Returns true if the point is inside something that swallows (a black hole).
  accelAt(x, y, out) {
    let ax = 0, ay = 0, sink = false;
    for (const f of this.fields) {
      const dx = f.x - x, dy = f.y - y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) || 1;
      let a;
      if (f.kind === 'magnet') {
        if (d > f.range) continue;
        a = f.strength * (1 - d / f.range);
      } else {
        a = f.GM / Math.max(d2, f.rmin * f.rmin);
        if (f.sinkR && d < f.sinkR) sink = true;
      }
      ax += (dx / d) * a;
      ay += (dy / d) * a;
    }
    out[0] = ax;
    out[1] = ay;
    return sink;
  }

  applyFields() {
    if (!this.fields.length) return;
    const out = this.acc2;
    for (const it of this.items) {
      const b = it.body;
      if (!b || it.pinned) continue;
      this.accelAt(b.position.x, b.position.y, out);
      Body.setVelocity(b, { x: b.velocity.x + out[0], y: b.velocity.y + out[1] });
    }
  }

  // ---------- loop ----------

  loop(t) {
    if (this.state !== 'broken') { this.raf = 0; return; }
    const dt = Math.min(100, t - (this.last ?? t));
    this.last = t;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 4) {
      Engine.update(this.engine, STEP);
      this.acc -= STEP;
      n++;
    }
    if (n === 4) this.acc = 0;

    // Visible pieces shrink from full size to rubble size over the first 400ms.
    const k = this.reduceMotion ? 1 : Math.min(1, (t - this.scaleStart) / 400);
    this.scaleEase = 1 + (1 / this.scale - 1) * (1 - easeOut(k));

    for (const it of this.items) {
      if (!it.body) continue;
      const { x, y } = it.body.position;
      const s = this.visualScale(it);
      it.el.style.transform =
        `translate3d(${(x - it.w / 2).toFixed(2)}px, ${(y - it.h / 2).toFixed(2)}px, 0) ` +
        `rotate(${it.body.angle.toFixed(4)}rad) scale(${s.toFixed(4)})`;
    }
    this.renderHooks.forEach((f) => f(t));
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- rebuild ----------

  rebuild(then) {
    if (this.state !== 'broken') return;
    this.state = 'rebuilding';
    cancelAnimationFrame(this.raf);
    this.emit('rebuild-start');

    const snaps = this.items.map((it) => {
      const b = it.body || it.lastBody;
      return {
        it,
        shown: !!it.body && !it.hidden,
        x: b ? b.position?.x ?? b.x : 0,
        y: b ? b.position?.y ?? b.y : 0,
        a: b ? normAngle(b.angle) : 0,
        s: this.visualScale(it),
      };
    });

    Composite.clear(this.engine.world, false);
    this.walls = [];
    this.fields = [];
    this.byBody.clear();
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 1;

    for (const { it } of snaps) {
      const st = it.el.style;
      st.width = st.height = st.transform = st.clipPath = st.opacity = st.transition = '';
      it.el.classList.remove('phys-body', 'phys-hidden');
      delete it.el.dataset.section;
    }
    document.documentElement.classList.remove('broken', 'orbiting');
    scrollTo({ top: this.savedScroll, behavior: 'instant' });

    // FLIP: measure each element's home, start it where its body was, then let go.
    const moving = [];
    if (!this.reduceMotion) {
      for (const sn of snaps) {
        const el = sn.it.el;
        const r = el.getBoundingClientRect();
        if (r.bottom < -40 || r.top > innerHeight + 40) continue;
        if (sn.shown) {
          const dx = sn.x - (r.left + r.width / 2);
          const dy = sn.y - (r.top + r.height / 2);
          el.style.transform = `translate(${dx}px, ${dy}px) rotate(${sn.a}rad) scale(${sn.s})`;
        } else {
          el.style.transform = 'scale(0.4)';
          el.style.opacity = '0';
        }
        moving.push(el);
      }
      document.body.getBoundingClientRect();
      moving.forEach((el, i) => {
        el.style.transition = `transform 700ms cubic-bezier(.2,.9,.25,1.05) ${i * 12}ms, opacity 400ms ${i * 12}ms`;
        el.style.transform = '';
        el.style.opacity = '';
      });
    }

    const done = () => {
      moving.forEach((el) => { el.style.transition = ''; });
      this.items = [];
      this.state = 'normal';
      this.emit('rebuilt');
      if (then) then();
    };
    if (moving.length) setTimeout(done, 700 + moving.length * 12 + 60);
    else done();
  }
}

function splitLetters(el) {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const ch of node.textContent) {
      if (/\s/.test(ch)) { frag.append(ch); continue; }
      const span = document.createElement('span');
      span.className = 'letter';
      span.dataset.phys = '';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = ch;
      frag.append(span);
    }
    node.replaceWith(frag);
  }
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
function normAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
