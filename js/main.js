// Entry point. The page is a normal website until someone presses the button.
// If Matter.js failed to load, nothing here runs and the plain site stays as is.

import { World } from './world.js';
import { Particles } from './particles.js';
import { Orbits } from './orbits.js';
import { Game } from './game.js';
import { Tools } from './tools.js';

if (window.Matter) start();

function start() {
  const world = new World();
  const particles = new Particles(world);
  const orbits = new Orbits(world);
  particles.overlays.push((ctx) => orbits.drawTrails(ctx));
  const game = new Game(world, particles);
  const tools = new Tools(world, particles, orbits, game);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'break-btn';
  btn.dataset.phys = '';
  btn.innerHTML = '<span>Don’t</span> <span>press</span>';

  const hint = document.createElement('p');
  hint.className = 'break-hint';
  hint.dataset.phys = '';
  hint.textContent = 'Seriously. It breaks the whole page.';

  document.getElementById('break-slot').append(btn, hint);

  btn.addEventListener('click', () => {
    if (world.state === 'normal') {
      if (world.reduceMotion &&
          !confirm('This turns the page into a physics toy with a lot of motion. Continue? (Esc puts it back.)')) return;
      world.breakPage();
    } else if (world.state === 'broken') {
      const r = btn.getBoundingClientRect();
      tools.explode({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 1.4);
      tools.say('I told you not to press it.');
    }
  });

  world.on('rebuilt', () => btn.focus({ preventScroll: true }));
}
