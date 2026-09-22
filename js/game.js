// The game layer: a basketball hoop for the letters of my name, a secret card,
// and achievements that pop up as you break things.

import { clamp } from './world.js';
import { openBrowser as showBrowser, DEPTH } from './browser.js';

const { Bodies, Composite, Events } = window.Matter;
const STORE_KEY = 'sp-achievements';
const BROWSER_AT = 10; // trophies needed to unlock the browser

const ACHIEVEMENTS = [
  ['broke', 'Broke the internet', 'Pressed the button you were told not to press.'],
  ['upside', 'Upside down', 'Flipped gravity.'],
  ['weightless', 'Weightless', 'Turned gravity off.'],
  ['demolition', 'Demolition', 'Set off 5 bombs.'],
  ['horizon', 'Event horizon', 'Fed 10 things to black holes.'],
  ['shattered', 'Shattered', 'Smashed something into pieces.'],
  ['sand', 'Grains of sand', 'Turned 5 things into sand.'],
  ['solar', 'Solar system', 'Turned on orbit mode.'],
  ['stable', 'Stable orbit', 'Threw something into a full lap around the sun.'],
  ['threebody', 'Three-body problem', 'Had 3 planets out at once.'],
  ['angry', 'Angry letters', 'Launched 3 things with the slingshot.'],
  ['net', 'Nothing but net', 'Swished a letter through the hoop.'],
  ['bunny', 'Bunny mode', 'Swished every letter of SHAWN and found the secret.'],
  ['undo', 'Undo button', 'Put the whole page back together.'],
  ['stardust', 'Stardust', 'Turned on sand planets.'],
  ['planetborn', 'A planet is born', 'Let enough dust clump together to form a planet.'],
  ['tap', 'Open the tap', 'Placed a water valve.'],
  ['flood', 'Flood warning', 'Let a lot of water out.'],
  ['floats', 'It floats!', 'Got a piece to float in water.'],
  ['fore', 'Fore!', 'Took your first putt.'],
  ['ace', 'Hole in one', 'Sank a putt in one stroke.'],
  ['underpar', 'Under par', 'Finished a hole under par.'],
  ['ascii', 'Plain text', 'Turned the page into ASCII.'],
  ['browser', 'Browserception', `Earned ${BROWSER_AT} trophies and got a web browser inside the web browser.`],
  ['nested', 'Site-ception', 'Loaded this site inside its own browser.'],
  ['stacked', 'Browser in a browser', 'Opened the browser from inside the browser.'],
  ['turtles', 'Turtles all the way down', 'Stacked browsers 5 levels deep.'],
  ['tttfound', 'Hidden game', 'Found the hidden game. (A certain dot is worth three clicks.)'],
  ['tttwin', 'Three in a row', 'Beat the bot at tic-tac-toe.'],
  ['tttdraw', "Cat's game", 'Tied the bot at tic-tac-toe.'],
].map(([id, title, desc]) => ({ id, title, desc }));

export class Game {
  constructor(world, particles) {
    this.world = world;
    this.particles = particles;
    this.unlocked = new Set(load());
    this.counts = {};
    this.swished = new Set();

    this.toasts = document.createElement('div');
    this.toasts.className = 'toasts';
    this.toasts.setAttribute('role', 'status');
    this.toasts.setAttribute('aria-live', 'polite');
    document.body.append(this.toasts);
    this.buildPanel();

    if (this.unlocked.has('bunny')) document.getElementById('secret').hidden = false;

    const count = (name, n, id) => world.on(name, () => {
      this.counts[name] = (this.counts[name] || 0) + 1;
      if (this.counts[name] >= n) this.unlock(id);
    });
    world.on('broken', () => { this.unlock('broke'); this.buildHoop(); });
    world.on('gravity', (m) => { if (m === 'up') this.unlock('upside'); if (m === 'zero') this.unlock('weightless'); });
    count('bomb', 5, 'demolition');
    count('swallow', 10, 'horizon');
    count('shatter', 1, 'shattered');
    count('sandify', 5, 'sand');
    count('sling', 3, 'angry');
    world.on('orbit-on', () => this.unlock('solar'));
    // The hoop gets in the way of every mode, so it steps out while one is on.
    world.on('mode', (id) => {
      this.removeHoop();
      if (id === 'accretion') this.unlock('stardust');
    });
    world.on('mode-off', () => { if (world.state === 'broken') this.buildHoop(); });
    world.on('stable-orbit', () => this.unlock('stable'));
    world.on('planet-formed', () => this.unlock('planetborn'));
    world.on('valve', () => this.unlock('tap'));
    world.on('flood', () => this.unlock('flood'));
    world.on('float', () => this.unlock('floats'));
    world.on('putt', () => this.unlock('fore'));
    world.on('hole-done', ({ strokes, par }) => {
      if (strokes === 1) this.unlock('ace');
      if (strokes < par) this.unlock('underpar');
    });
    world.on('ascii', () => this.unlock('ascii'));
    world.on('ttt-found', () => this.unlock('tttfound'));
    world.on('ttt-win', () => this.unlock('tttwin'));
    world.on('ttt-draw', () => this.unlock('tttdraw'));
    if (DEPTH >= 1) this.unlock('nested');
    if (DEPTH >= 5) this.unlock('turtles');

    // Copies of the site in the browser window share these achievements. When one
    // of them unlocks something, the real tab shows it too.
    addEventListener('storage', (e) => {
      if (e.key !== STORE_KEY) return;
      for (const id of load()) {
        if (this.unlocked.has(id)) continue;
        this.unlocked.add(id);
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a && DEPTH === 0) this.toast(`Achievement: ${a.title}`, `${a.desc} (Unlocked inside the browser.)`);
      }
      this.renderPanel();
    });

    // Once the browser is unlocked, a button opens it from the normal page. Inside
    // a browser, the same button opens the next one down.
    this.launcher = document.createElement('button');
    this.launcher.type = 'button';
    this.launcher.className = 'browser-launch';
    this.launcher.textContent = DEPTH ? `Open a browser, level ${DEPTH + 1}` : 'Open the browser';
    this.launcher.addEventListener('click', () => this.openBrowser());
    document.body.append(this.launcher);
    this.renderPanel();
    world.on('planet', (n) => { if (n >= 3) this.unlock('threebody'); });
    world.on('rebuild-start', () => { this.removeHoop(); this.panel.hidden = true; });
    world.on('rebuilt', () => this.unlock('undo'));
    world.on('resize', () => { if (this.hoop) this.buildHoop(); });

    Events.on(world.engine, 'collisionStart', (ev) => this.onCollide(ev));
  }

  // ---------- achievements ----------

  unlock(id) {
    // Another copy of the site (in the browser window) may have unlocked things too.
    for (const got of load()) this.unlocked.add(got);
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    save([...this.unlocked]);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    this.toast(`Achievement: ${a.title}`, a.desc);
    this.renderPanel();
    if (id === 'browser') {
      this.toast('You unlocked a web browser', 'Reopen it from the Trophies panel. The site inside has its own browser too.');
      this.openBrowser();
    }
    const earned = [...this.unlocked].filter((x) => x !== 'browser').length;
    if (earned >= BROWSER_AT) this.unlock('browser');
  }

  openBrowser() {
    showBrowser();
    if (DEPTH >= 1) this.unlock('stacked');
  }

  toast(title, desc) {
    const t = document.createElement('div');
    t.className = 'toast';
    const strong = document.createElement('strong');
    strong.textContent = title;
    t.append(strong, desc);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
    }, 3400);
  }

  trophyButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-btn';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'trophy-panel');
    b.addEventListener('click', () => {
      this.panel.hidden = !this.panel.hidden;
      b.setAttribute('aria-expanded', String(!this.panel.hidden));
    });
    this.trophyBtn = b;
    this.renderPanel();
    return b;
  }

  buildPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'trophy-panel';
    this.panel.id = 'trophy-panel';
    this.panel.hidden = true;
    const h = document.createElement('h2');
    h.textContent = 'Achievements';
    this.browserBtn = document.createElement('button');
    this.browserBtn.type = 'button';
    this.browserBtn.className = 'panel-browser';
    this.browserBtn.textContent = 'Open the browser';
    this.browserBtn.addEventListener('click', () => this.openBrowser());
    this.list = document.createElement('ul');
    this.panel.append(h, this.browserBtn, this.list);
    document.body.append(this.panel);
    this.renderPanel();
  }

  renderPanel() {
    if (this.trophyBtn) this.trophyBtn.textContent = `Trophies ${this.unlocked.size}/${ACHIEVEMENTS.length}`;
    if (this.launcher) this.launcher.hidden = !this.unlocked.has('browser');
    if (!this.list) return;
    this.browserBtn.hidden = !this.unlocked.has('browser');
    this.list.replaceChildren(...ACHIEVEMENTS.map((a) => {
      const li = document.createElement('li');
      const got = this.unlocked.has(a.id);
      li.className = got ? '' : 'locked';
      const span = document.createElement('span');
      span.textContent = a.desc;
      li.append(`${got ? '★' : '☆'} ${a.title}`, span);
      return li;
    }));
  }

  // ---------- hoop ----------

  buildHoop() {
    this.removeHoop();
    const w = this.world;
    this.targets = w.items.filter((it) => it.isLetter && it.el.closest('.first-name'));
    if (!this.targets.length) return;

    const biggest = Math.max(...this.targets.map((it) => Math.max(it.w, it.h) * w.scale));
    const rim = clamp(biggest * 1.5, 70, 220);
    const cx = w.W - rim / 2 - clamp(w.W * 0.05, 24, 80);
    const cy = clamp(w.H * 0.42, 190, w.H - 160);
    const boardH = rim * 0.9;
    const bx = cx + rim / 2 + 10;

    const opts = { isStatic: true, label: 'hoop', restitution: 0.4 };
    const front = Bodies.circle(cx - rim / 2, cy, 6, opts);
    const back = Bodies.circle(cx + rim / 2, cy, 6, opts);
    const board = Bodies.rectangle(bx, cy - boardH * 0.35, 12, boardH, opts);
    const sensor = Bodies.rectangle(cx, cy + 16, rim - 20, 10, { isStatic: true, isSensor: true, label: 'hoop-sensor' });
    Composite.add(w.engine.world, [front, back, board, sensor]);

    const el = document.createElement('div');
    el.className = 'hoop fx-el';
    el.setAttribute('aria-hidden', 'true');
    const netH = rim * 0.7;
    const inset = rim * 0.18;
    const scoreW = this.targets.length * 26;
    const scoreX = clamp(cx - scoreW / 2, 8, w.W - scoreW - 8);
    const lines = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      lines.push(`M${t * rim} 0 L${inset + t * (rim - 2 * inset)} ${netH}`);
    }
    for (let j = 1; j <= 3; j++) {
      const t = j / 3, dx = inset * t;
      lines.push(`M${dx} ${netH * t} L${rim - dx} ${netH * t}`);
    }
    el.innerHTML = `
      <div class="hoop-board" style="left:${bx - 8}px;top:${cy - boardH * 0.85}px;width:16px;height:${boardH}px"></div>
      <svg class="hoop-net" style="left:${cx - rim / 2}px;top:${cy}px" width="${rim}" height="${netH}"><path d="${lines.join(' ')}"/></svg>
      <div class="hoop-rim" style="left:${cx - rim / 2 - 6}px;top:${cy - 4}px;width:${rim + 12}px"></div>
      <div class="hoop-score" style="left:${scoreX}px;top:${cy + netH + 12}px"></div>`;
    document.body.append(el);
    this.hoop = { el, bodies: [front, back, board, sensor], sensor, cx, cy };
    this.renderScore();
  }

  removeHoop() {
    if (!this.hoop) return;
    Composite.remove(this.world.engine.world, this.hoop.bodies);
    this.hoop.el.remove();
    this.hoop = null;
  }

  renderScore() {
    const box = this.hoop?.el.querySelector('.hoop-score');
    if (!box) return;
    box.replaceChildren(...this.targets.map((it, i) => {
      const s = document.createElement('span');
      s.textContent = it.el.textContent.toUpperCase();
      if (this.swished.has(i)) s.className = 'lit';
      return s;
    }));
  }

  onCollide(ev) {
    if (!this.hoop) return;
    const sensor = this.hoop.sensor;
    for (const pair of ev.pairs) {
      const other = pair.bodyA === sensor ? pair.bodyB : pair.bodyB === sensor ? pair.bodyA : null;
      if (!other) continue;
      const item = this.world.byBody.get(other);
      const idx = this.targets.indexOf(item);
      // Only counts coming down through the rim, not sneaking up from below.
      if (idx < 0 || other.velocity.y <= 0.3 || other.position.y > sensor.position.y) continue;
      this.swish(idx);
    }
  }

  swish(idx) {
    const h = this.hoop;
    h.el.classList.remove('swish');
    void h.el.offsetWidth;
    h.el.classList.add('swish');
    this.particles.burst(h.cx, h.cy + 20, 50, ['#FF3D00', '#111111', '#FFB36B'], 3);
    if (this.swished.has(idx)) return;
    this.swished.add(idx);
    this.unlock('net');
    this.renderScore();
    if (this.swished.size === this.targets.length) this.unlockSecret();
  }

  unlockSecret() {
    this.unlock('bunny');
    const w = this.world;
    this.particles.burst(w.W / 2, 140, 900, ['#FF3D00', '#FFB36B', '#111111', '#F2EDE4', '#3D7BFF'], 9);
    const el = document.getElementById('secret');
    if (el.hidden) {
      el.hidden = false;
      w.addElement(el);
    }
    this.toast('Secret unlocked', 'A new card just fell from the sky. It will stay on the page.');
  }
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}

function save(ids) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(ids)); } catch { /* storage blocked: fine */ }
}
