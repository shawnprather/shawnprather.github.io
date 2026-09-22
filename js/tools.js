// The toolbox: pointer and keyboard input, every tool that acts on the world,
// and the switch between the modes (solar system, sand planets, putt-putt).

import { clamp } from './world.js';
import { fxEl } from './ui.js';

const { Body, Bodies, Composite, Constraint } = window.Matter;

const TOOLS = [
  { id: 'grab', key: '1', label: 'Grab', hint: 'Drag anything around. Flick to throw it.' },
  { id: 'sling', key: '2', label: 'Sling', hint: 'Pull something back and let go. The dots show where it will fly.' },
  { id: 'magnet', key: '3', label: 'Magnet', hint: 'Hold down to pull everything toward you. It lifts sand too.' },
  { id: 'bomb', key: '4', label: 'Bomb', hint: 'Click anywhere to blow things up.' },
  { id: 'hole', key: '5', label: 'Black hole', hint: 'Click to open a black hole. It eats what it catches for 8 seconds.' },
  { id: 'planet', key: '6', label: 'Planet', hint: 'Click empty space to drop a planet. Nearby things start orbiting it. Click a planet to remove it.' },
  { id: 'shatter', key: '7', label: 'Shatter', hint: 'Click something to smash it into pieces.' },
  { id: 'sand', key: '8', label: 'Sand', hint: 'Click something to crumble it into sand.' },
  { id: 'water', key: '9', label: 'Water', hint: 'Click to put a water valve there (up to 3). Click a valve to shut it off.' },
];
const MODES = [
  { id: 'solar', key: 'o', label: 'Solar system', title: 'Everything orbits a sun. The section names become planets you can click to visit.',
    hint: 'Solar system: click an orange planet to visit that section, or fling things into new orbits.' },
  { id: 'accretion', key: 'n', label: 'Sand planets', title: 'Sand pulls on sand, so dust clumps together into planets.',
    hint: 'Sand planets: dust pulls on dust. Sand or Shatter a few pieces to feed it.' },
  { id: 'golf', key: 'p', label: 'Putt-putt', title: 'The pile freezes into a mini-golf course. Drag back from the ball to putt.',
    hint: 'Putt-putt: drag back from the white ball and let go.' },
];
const GRAVITY = {
  down: [0, 1, 'Gravity ↓'], up: [0, -1, 'Gravity ↑'], zero: [0, 0, 'Gravity off'],
  left: [-1, 0, 'Gravity ←'], right: [1, 0, 'Gravity →'],
};
const MAX_PULL = 170;
const SLING_POWER = 0.2;
const MAX_SPEED = 42;

export class Tools {
  constructor({ world, particles, orbits, game, accretion, golf, water, ascii }) {
    this.world = world;
    this.particles = particles;
    this.orbits = orbits;
    this.game = game;
    this.water = water;
    this.ascii = ascii;
    this.golf = golf;
    this.modes = { solar: orbits, accretion, golf };
    this.mode = null;
    this.tool = 'grab';
    this.gravityMode = 'down';
    this.pointer = { x: 0, y: 0 };
    this.down = null;
    this.planets = [];
    this.hole = null;
    golf.say = (msg) => this.say(msg);

    this.buildToolbar();
    world.on('broken', () => this.show());
    world.on('rebuild-start', () => this.hide());
    world.onStep(() => this.step());
    particles.overlays.push((ctx) => this.draw(ctx));

    addEventListener('pointerdown', (e) => this.onDown(e), { passive: false });
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    addEventListener('pointercancel', (e) => this.onUp(e));
    addEventListener('click', (e) => this.onClick(e), true);
    addEventListener('keydown', (e) => this.onKey(e));
    addEventListener('dragstart', (e) => { if (world.state !== 'normal') e.preventDefault(); });
  }

  // ---------- toolbar ----------

  buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'toolbar';
    bar.hidden = true;
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Physics tools');

    const row = () => {
      const r = document.createElement('div');
      r.className = 'tb-row';
      bar.append(r);
      return r;
    };
    const button = (parent, html, onClick, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-btn';
      b.innerHTML = html;
      if (title) b.title = title;
      b.addEventListener('click', onClick);
      parent.append(b);
      return b;
    };

    const tools = row();
    this.toolBtns = {};
    for (const t of TOOLS) {
      const b = button(tools, `${t.label} <kbd>${t.key}</kbd>`, () => this.setTool(t.id), `${t.hint} (key ${t.key})`);
      b.setAttribute('aria-pressed', 'false');
      this.toolBtns[t.id] = b;
    }

    const modes = row();
    this.gravBtn = button(modes, '', () => this.cycleGravity(), 'Cycle gravity: down, up, off (key G). Arrow keys point it any way.');
    this.modeBtns = {};
    for (const m of MODES) {
      const b = button(modes, `${m.label} <kbd>${m.key.toUpperCase()}</kbd>`, () => this.toggleMode(m.id), `${m.title} (key ${m.key.toUpperCase()})`);
      b.setAttribute('aria-pressed', 'false');
      this.modeBtns[m.id] = b;
    }
    this.asciiBtn = button(modes, 'ASCII <kbd>A</kbd>', () => this.toggleAscii(), 'Redraw everything as text characters (key A)');
    this.asciiBtn.setAttribute('aria-pressed', 'false');
    modes.append(this.game.trophyButton());
    this.menusBtn = button(modes, 'Hide menus <kbd>H</kbd>', () => this.toggleMenus(true), 'Hide the toolbar and instructions for a clean view (key H)');
    const rebuild = button(modes, 'Rebuild <kbd>Esc</kbd>', () => this.world.rebuild(), 'Put the page back together (key Esc)');
    rebuild.classList.add('tb-rebuild');

    // While the menus are hidden, this is the one thing left on screen.
    this.showBtn = document.createElement('button');
    this.showBtn.type = 'button';
    this.showBtn.className = 'show-menus';
    this.showBtn.textContent = 'Show menus';
    this.showBtn.title = 'Bring the toolbar back (key H)';
    this.showBtn.addEventListener('click', () => this.toggleMenus(false));
    document.body.append(this.showBtn);

    this.hint = document.createElement('p');
    this.hint.className = 'tb-hint';
    this.hint.setAttribute('aria-live', 'polite');
    bar.append(this.hint);
    document.body.append(bar);
    this.bar = bar;
  }

  show() {
    const css = getComputedStyle(document.documentElement);
    this.ink = css.getPropertyValue('--ink').trim();
    this.accent = css.getPropertyValue('--accent').trim();
    const areas = this.world.items.map((it) => it.w * it.h).sort((a, b) => a - b);
    this.refArea = areas[areas.length >> 1] || 1;
    this.bar.hidden = false;
    this.setGravity('down', true);
    this.setTool(this.tool);
    this.say('The page is broken. Press Esc to put it back.');
    this.toolBtns[this.tool].focus({ preventScroll: true });
  }

  hide() {
    this.exitMode(true);
    this.endGrab();
    this.cancelSling();
    this.endMagnet();
    if (this.hole) this.closeHole();
    this.planets.forEach((p) => p.el.remove());
    this.planets = [];
    this.down = null;
    this.bar.hidden = true;
    this.gravityMode = 'down';
    this.asciiBtn.setAttribute('aria-pressed', 'false');
    document.documentElement.classList.remove('dragging', 'menus-hidden');
    document.documentElement.removeAttribute('data-tool');
  }

  setTool(id) {
    // Putt-putt owns the pointer, so picking a tool ends the round.
    if (this.mode === 'golf') {
      this.exitMode();
      this.setGravity('down');
    }
    this.tool = id;
    document.documentElement.dataset.tool = id;
    for (const [tid, b] of Object.entries(this.toolBtns)) b.setAttribute('aria-pressed', String(tid === id));
    const hint = TOOLS.find((t) => t.id === id).hint;
    if (this.mode) this.say(hint);
    else this.hint.textContent = hint;
  }

  baseHint() {
    return this.mode ? MODES.find((m) => m.id === this.mode).hint : TOOLS.find((t) => t.id === this.tool).hint;
  }

  say(msg) {
    this.hint.textContent = msg;
    clearTimeout(this.sayTimer);
    this.sayTimer = setTimeout(() => {
      if (this.world.state === 'broken') this.hint.textContent = this.baseHint();
    }, 3000);
  }

  // ---------- gravity + modes ----------

  cycleGravity() {
    const next = { down: 'up', up: 'zero', zero: 'down' }[this.gravityMode] || 'down';
    this.setGravity(next);
  }

  setGravity(mode, quiet = false) {
    if (this.mode && mode !== 'zero') this.exitMode();
    const [x, y, label] = GRAVITY[mode];
    const g = this.world.gravity;
    g.x = x;
    g.y = y;
    this.gravityMode = mode;
    this.gravBtn.innerHTML = `${label} <kbd>G</kbd>`;
    if (quiet) return;
    if (mode === 'zero' && !this.mode) {
      // A gentle push so things drift instead of just stopping.
      for (const it of this.world.liveItems()) {
        if (it.pinned) continue;
        Body.setVelocity(it.body, { x: it.body.velocity.x + rand(1.5), y: it.body.velocity.y + rand(1.5) - 1 });
        Body.setAngularVelocity(it.body, rand(0.03));
      }
    }
    this.world.emit('gravity', mode);
  }

  // The modes all need gravity off and are mutually exclusive.
  toggleMode(id) {
    if (this.world.state !== 'broken') return;
    if (this.mode === id) {
      this.exitMode();
      this.setGravity('down');
      return;
    }
    this.exitMode();
    this.endGrab();
    this.cancelSling();
    this.setGravity('zero', true);
    this.toolBeforeMode = this.tool;
    // Clicking planets needs Grab; putt-putt takes over the pointer anyway.
    if (id !== 'accretion') this.setTool('grab');
    this.mode = id;
    this.modes[id].enter();
    this.modeBtns[id].setAttribute('aria-pressed', 'true');
    clearTimeout(this.sayTimer);
    this.hint.textContent = this.baseHint();
    this.world.emit('mode', id);
  }

  exitMode(fromRebuild = false) {
    const id = this.mode;
    if (!id) return;
    this.mode = null;
    this.modes[id].exit(fromRebuild);
    this.modeBtns[id].setAttribute('aria-pressed', 'false');
    if (this.toolBeforeMode && !fromRebuild) {
      this.tool = this.toolBeforeMode;
      document.documentElement.dataset.tool = this.tool;
      for (const [tid, b] of Object.entries(this.toolBtns)) b.setAttribute('aria-pressed', String(tid === this.tool));
      this.hint.textContent = this.baseHint();
    }
    this.toolBeforeMode = null;
    this.world.emit('mode-off', id);
  }

  toggleMenus(hide = !document.documentElement.classList.contains('menus-hidden')) {
    document.documentElement.classList.toggle('menus-hidden', hide);
    (hide ? this.showBtn : this.menusBtn).focus({ preventScroll: true });
  }

  toggleAscii() {
    const on = !this.ascii.on;
    this.ascii.set(on);
    this.asciiBtn.setAttribute('aria-pressed', String(on));
  }

  // ---------- input ----------

  onDown(e) {
    const w = this.world;
    if (w.state !== 'broken' || e.button !== 0) return;
    if (e.target.closest('.toolbar, .trophy-panel, .browser-win, .ttt, .show-menus')) return;
    if (this.down) {
      // A second finger is ignored; a mouse that was released outside the window is reset.
      if (e.pointerType !== 'mouse') return;
      this.onUp({ pointerId: this.down.id });
    }
    e.preventDefault();
    const p = { x: e.clientX, y: e.clientY };
    this.pointer = p;
    this.dragged = false;
    const item = w.itemAt(p);
    this.down = { id: e.pointerId, x: p.x, y: p.y, item };
    this.panelClose();

    if (this.mode === 'golf') { this.golf.down(p); return; }
    switch (this.tool) {
      case 'grab': this.startGrab(item, p); break;
      case 'sling': this.startSling(item, p); break;
      case 'magnet': this.startMagnet(p); break;
      case 'bomb': this.explode(p, 1); break;
      case 'hole': this.openHole(p); break;
      case 'planet': this.togglePlanet(p); break;
      case 'shatter': if (item) this.shatter(item, p); break;
      case 'sand': if (item) this.sandify(item); break;
      case 'water': this.water.toggleValve(p, (msg) => this.say(msg)); break;
    }
  }

  onMove(e) {
    const p = { x: e.clientX, y: e.clientY };
    this.pointer = p;
    if (!this.down || e.pointerId !== this.down.id) return;
    if (Math.hypot(p.x - this.down.x, p.y - this.down.y) > 6) this.dragged = true;
    if (this.mode === 'golf') this.golf.move(p);
    if (this.grab) this.grab.pointA = { x: p.x, y: p.y };
    if (this.magnet) { this.magnet.x = p.x; this.magnet.y = p.y; }
  }

  onUp(e) {
    if (!this.down || e.pointerId !== this.down.id) return;
    if (this.mode === 'golf') this.golf.up();
    this.endGrab();
    this.releaseSling();
    this.endMagnet();
    this.down = null;
    document.documentElement.classList.remove('dragging');
  }

  // Links and section headings still work in broken mode, but only for a
  // real click with Grab or Sling, never at the end of a drag or a bomb.
  onClick(e) {
    const w = this.world;
    if (w.state === 'normal') return;
    if (e.target.closest('.toolbar, .trophy-panel, .browser-win, .ttt, .show-menus')) return;
    if (w.state === 'rebuilding') { e.preventDefault(); e.stopPropagation(); return; }
    const keyboard = e.detail === 0;
    if (!keyboard && (this.dragged || this.mode === 'golf' || !['grab', 'sling'].includes(this.tool))) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const planet = e.target.closest('[data-section]');
    if (planet && this.mode === 'solar') {
      e.preventDefault();
      this.goTo('#' + planet.dataset.section);
      return;
    }
    const a = e.target.closest('a[href^="#"]');
    if (a) {
      e.preventDefault();
      this.goTo(a.getAttribute('href'));
    }
  }

  goTo(hash) {
    this.world.rebuild(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: this.world.reduceMotion ? 'auto' : 'smooth' });
    });
  }

  panelClose() {
    if (this.game.panel.hidden) return;
    this.game.panel.hidden = true;
    this.game.trophyBtn.setAttribute('aria-expanded', 'false');
  }

  onKey(e) {
    const w = this.world;
    if (w.state !== 'broken' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const tool = TOOLS.find((t) => t.key === k);
    const mode = MODES.find((m) => m.key === k);
    const arrows = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (tool) this.setTool(tool.id);
    else if (mode) this.toggleMode(mode.id);
    else if (k === 'Escape' || k === 'r') w.rebuild();
    else if (k === 'g') this.cycleGravity();
    else if (k === 'a') this.toggleAscii();
    else if (k === 'h') this.toggleMenus();
    else if (arrows[k]) this.setGravity(arrows[k]);
    else return;
    e.preventDefault();
  }

  // ---------- per-step behavior ----------

  step() {
    const w = this.world;
    if (this.grabItem && !this.grabItem.body) this.endGrab();

    const s = this.sling;
    if (s) {
      const b = s.item.body;
      if (!b) { this.sling = null; }
      else {
        const pull = this.slingPull();
        Body.setPosition(b, { x: s.ax + pull.x, y: s.ay + pull.y });
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setAngularVelocity(b, 0);
      }
    }

    if (this.magnet) {
      const m = this.magnet;
      for (const it of w.liveItems()) {
        const b = it.body;
        if (Math.hypot(b.position.x - m.x, b.position.y - m.y) < 70) {
          Body.setVelocity(b, { x: b.velocity.x * 0.88, y: b.velocity.y * 0.88 });
        }
      }
      this.particles.liftSand(m.x, m.y, 90, 40, () => [rand(1), rand(1)]);
    }

    const h = this.hole;
    if (h) {
      h.t++;
      for (const it of w.liveItems()) {
        const b = it.body;
        const d = Math.hypot(b.position.x - h.field.x, b.position.y - h.field.y);
        const size = Math.max(it.w, it.h) * w.visualScale(it);
        if (d < 28 + size * 0.2) this.swallow(it);
      }
      this.particles.liftSand(h.field.x, h.field.y, 150, 60, () => [rand(0.5), rand(0.5)]);
      if (h.t >= h.life) this.closeHole();
    }
  }

  // ---------- grab ----------

  startGrab(item, p) {
    if (!item) return;
    const b = item.body;
    this.grab = Constraint.create({
      pointA: { x: p.x, y: p.y },
      bodyB: b,
      pointB: { x: p.x - b.position.x, y: p.y - b.position.y },
      stiffness: 0.2,
      damping: 0.1,
      length: 0,
    });
    Composite.add(this.world.engine.world, this.grab);
    this.grabItem = item;
    document.documentElement.classList.add('dragging');
  }

  endGrab() {
    if (!this.grab) return;
    Composite.remove(this.world.engine.world, this.grab);
    const item = this.grabItem;
    this.grab = null;
    this.grabItem = null;
    if (item?.body) {
      capSpeed(item.body);
      if (this.dragged) this.world.emit('release', { item });
    }
  }

  // ---------- slingshot ----------

  startSling(item, p) {
    if (!item) return;
    const b = item.body;
    this.sling = { item, ax: b.position.x, ay: b.position.y, ox: p.x - b.position.x, oy: p.y - b.position.y };
    item.pinned = true;
    document.documentElement.classList.add('dragging');
  }

  slingPull() {
    const s = this.sling;
    let x = this.pointer.x - s.ox - s.ax;
    let y = this.pointer.y - s.oy - s.ay;
    const len = Math.hypot(x, y);
    if (len > MAX_PULL) { x *= MAX_PULL / len; y *= MAX_PULL / len; }
    return { x, y };
  }

  releaseSling() {
    const s = this.sling;
    if (!s) return;
    const pull = this.slingPull();
    this.sling = null;
    s.item.pinned = false;
    const b = s.item.body;
    if (!b) return;
    if (Math.hypot(pull.x, pull.y) < 12) return;
    Body.setVelocity(b, { x: -pull.x * SLING_POWER, y: -pull.y * SLING_POWER });
    Body.setAngularVelocity(b, rand(0.15));
    this.world.emit('sling');
    this.world.emit('release', { item: s.item });
  }

  cancelSling() {
    if (!this.sling) return;
    this.sling.item.pinned = false;
    this.sling = null;
  }

  // ---------- magnet ----------

  startMagnet(p) {
    this.magnet = { kind: 'magnet', x: p.x, y: p.y, range: 420, strength: 0.9 };
    this.world.fields.push(this.magnet);
  }

  endMagnet() {
    if (!this.magnet) return;
    this.world.fields = this.world.fields.filter((f) => f !== this.magnet);
    this.magnet = null;
  }

  // ---------- bomb ----------

  explode(p, power) {
    const w = this.world;
    const R = clamp(Math.min(w.W, w.H) * 0.38, 160, 320);
    for (const it of w.liveItems()) {
      const b = it.body;
      if (it.pinned) continue;
      const dx = b.position.x - p.x, dy = b.position.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const falloff = 1 - d / R;
      const f = 26 * power * falloff * clamp(Math.pow(this.refArea / (it.w * it.h), 0.3), 0.5, 1.6);
      Body.setVelocity(b, { x: b.velocity.x + (dx / d) * f, y: b.velocity.y + (dy / d) * f - 3 * falloff });
      Body.setAngularVelocity(b, b.angularVelocity + rand(0.25 * falloff));
      capSpeed(b);
    }
    this.particles.impulse(p, R, 12 * power);
    const el = fxEl('boom');
    const size = R * 1.2;
    el.style.width = el.style.height = size + 'px';
    el.style.setProperty('--x', `${p.x - size / 2}px`);
    el.style.setProperty('--y', `${p.y - size / 2}px`);
    setTimeout(() => el.remove(), 520);
    w.emit('bomb');
  }

  // ---------- black hole ----------

  openHole(p) {
    if (this.hole) this.closeHole();
    const el = fxEl('blackhole');
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    const field = { kind: 'grav', x: p.x, y: p.y, GM: 16000, rmin: 30, sinkR: 30 };
    this.world.fields.push(field);
    this.hole = { el, field, t: 0, life: 480 };
  }

  // The hole quietly shrinks away; whatever it ate stays gone until Rebuild.
  closeHole() {
    const h = this.hole;
    this.hole = null;
    this.world.fields = this.world.fields.filter((f) => f !== h.field);
    h.el.classList.add('pop');
    setTimeout(() => h.el.remove(), 600);
  }

  swallow(item) {
    const b = item.body;
    const h = this.hole.field;
    this.world.removeBody(item);
    const el = item.el;
    el.style.transition = 'transform 380ms cubic-bezier(.5,0,.9,.4), opacity 380ms';
    el.style.transform = `translate3d(${h.x - item.w / 2}px, ${h.y - item.h / 2}px, 0) rotate(${b.angle + 4}rad) scale(0)`;
    el.style.opacity = '0';
    setTimeout(() => {
      if (item.hidden && this.world.state === 'broken') el.classList.add('phys-hidden');
    }, 400);
    this.world.emit('swallow');
  }

  // ---------- planets ----------

  togglePlanet(p) {
    const w = this.world;
    const hit = this.planets.find((pl) => Math.hypot(pl.x - p.x, pl.y - p.y) < pl.r + 8);
    if (hit) {
      Composite.remove(w.engine.world, hit.body);
      w.fields = w.fields.filter((f) => f !== hit.field);
      hit.el.remove();
      this.planets = this.planets.filter((pl) => pl !== hit);
      return;
    }
    if (this.planets.length >= 4) {
      this.say('Four planets is the limit. Click one to remove it.');
      return;
    }
    const r = clamp(Math.min(w.W, w.H) * 0.045, 22, 44);
    const body = Bodies.circle(p.x, p.y, r, { isStatic: true, label: 'planet', friction: 0.8 });
    Composite.add(w.engine.world, body);
    const field = { kind: 'grav', x: p.x, y: p.y, GM: 2400 * (r / 30), rmin: r };
    w.fields.push(field);
    const el = fxEl('planet');
    el.style.width = el.style.height = 2 * r + 'px';
    el.style.transform = `translate(${p.x - r}px, ${p.y - r}px)`;
    this.planets.push({ x: p.x, y: p.y, r, body, field, el });

    if (this.gravityMode !== 'zero') {
      this.setGravity('zero', true);
      this.world.emit('gravity', 'zero');
      this.say('Gravity off. The planets are in charge now.');
    }
    // Swirl nearby pieces so they start orbiting instead of falling straight in.
    for (const it of w.liveItems()) {
      const b = it.body;
      const dx = b.position.x - p.x, dy = b.position.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 360 || d < r) continue;
      const v = Math.sqrt(field.GM / d) * 0.8;
      Body.setVelocity(b, { x: b.velocity.x - (dy / d) * v, y: b.velocity.y + (dx / d) * v });
    }
    w.emit('planet', this.planets.length);
  }

  // ---------- shatter + sand ----------

  shatter(item, p) {
    if (this.grabItem === item) this.endGrab();
    this.particles.emitFromItem(item, 'shatter', p);
    this.world.removeBody(item);
    item.el.classList.add('phys-hidden');
    this.world.emit('shatter');
  }

  sandify(item) {
    if (this.grabItem === item) this.endGrab();
    this.particles.emitFromItem(item, 'sand');
    this.world.removeBody(item);
    this.particles.crumble(item);
    this.world.emit('sandify');
  }

  // ---------- overlay drawing ----------

  draw(ctx) {
    const s = this.sling;
    if (s && s.item.body) {
      const b = s.item.body;
      const pull = this.slingPull();
      ctx.save();
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.ax - 14, s.ay);
      ctx.lineTo(b.position.x, b.position.y);
      ctx.lineTo(s.ax + 14, s.ay);
      ctx.stroke();
      ctx.fillStyle = this.ink;
      for (const x of [s.ax - 14, s.ax + 14]) {
        ctx.beginPath();
        ctx.arc(x, s.ay, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      const pts = this.orbits.predict(b.position.x, b.position.y,
        -pull.x * SLING_POWER, -pull.y * SLING_POWER, 150, b.frictionAir);
      ctx.fillStyle = this.accent;
      for (let i = 0; i < pts.length; i += 2) {
        ctx.globalAlpha = 1 - i / pts.length;
        ctx.beginPath();
        ctx.arc(pts[i], pts[i + 1], 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (this.magnet) {
      const m = this.magnet;
      const pulse = (performance.now() / 600) % 1;
      ctx.save();
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.globalAlpha = 1 - pulse;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 20 + pulse * 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function capSpeed(b) {
  const v = Math.hypot(b.velocity.x, b.velocity.y);
  if (v > MAX_SPEED) Body.setVelocity(b, { x: (b.velocity.x / v) * MAX_SPEED, y: (b.velocity.y / v) * MAX_SPEED });
}

function rand(n) { return (Math.random() - 0.5) * 2 * n; }
