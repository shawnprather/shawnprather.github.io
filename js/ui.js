// Small DOM helpers shared by the modes and tools.

// A fixed, decorative element (bomb flash, black hole, planet, valve...).
export function fxEl(kind, parent = document.body) {
  const el = document.createElement('div');
  el.className = `${kind} fx-el`;
  el.setAttribute('aria-hidden', 'true');
  parent.append(el);
  return el;
}

// The instructions card a mode shows at the bottom of the screen while it's on.
export function showLegend(title, lines) {
  const el = document.createElement('div');
  el.className = 'orbit-legend';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const ul = document.createElement('ul');
  for (const line of lines) {
    const li = document.createElement('li');
    li.innerHTML = line;
    ul.append(li);
  }
  el.append(strong, ul);
  document.body.append(el);
  return el;
}

// Lets a window be dragged around by its title bar.
export function makeDraggable(win, handle) {
  let start = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, input')) return;
    const r = win.getBoundingClientRect();
    start = { x: e.clientX - r.left, y: e.clientY - r.top };
    // Pin it where it is in plain left/top, so CSS centering doesn't fight the drag.
    win.style.left = r.left + 'px';
    win.style.top = r.top + 'px';
    win.style.transform = 'none';
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!start) return;
    const x = Math.min(innerWidth - 60, Math.max(-win.offsetWidth + 80, e.clientX - start.x));
    const y = Math.min(innerHeight - 40, Math.max(0, e.clientY - start.y));
    win.style.left = x + 'px';
    win.style.top = y + 'px';
  });
  const end = () => { start = null; };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
