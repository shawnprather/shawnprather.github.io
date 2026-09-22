// A small working web browser inside the page: the reward for 10 trophies.
// It opens on this very site, whose own browser opens the site again, and so on:
// browsers stack as deep as you care to click.

import { makeDraggable } from './ui.js';

// How many browsers deep this copy of the page is (0 = the real tab).
export const DEPTH = (() => {
  let d = 0, w = window;
  try { while (w !== w.parent && d < 100) { w = w.parent; d++; } } catch { /* cross-origin parent */ }
  return d;
})();

const BASE = location.origin + location.pathname;
// Every level needs its own address: browsers refuse to load a page inside a
// copy of itself with the exact same URL (Chrome stops at the second level).
const self = () => `${BASE}?level=${DEPTH + 1}&t=${Date.now().toString(36)}`;
const SELF = 'self';
const LINKS = [
  ['This site', SELF],
  ['shawnprather.dev', 'https://shawnprather.dev/'],
  ['Wikipedia', 'https://en.wikipedia.org/wiki/Colorado_School_of_Mines'],
  ['Map of Golden', 'https://www.openstreetmap.org/export/embed.html?bbox=-105.25%2C39.73%2C-105.19%2C39.77&layer=mapnik'],
  ['example.com', 'https://example.com/'],
];

let win = null;

export function openBrowser() {
  if (win) {
    win.hidden = false;
    win.querySelector('input').focus();
    return;
  }
  win = document.createElement('div');
  // Inside another browser, fill the little page so the stack stays usable.
  win.className = DEPTH ? 'browser-win nested' : 'browser-win';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Web browser');
  win.innerHTML = `
    <div class="bw-title">
      <button type="button" class="bw-close" aria-label="Close browser"></button>
      <span class="bw-dot"></span><button type="button" class="bw-dot bw-deeper" aria-label="Go one level deeper"></button>
      <span class="bw-name">${DEPTH ? `Browser, ${DEPTH + 1} levels deep` : 'Browser (inside your browser)'}</span>
    </div>
    <form class="bw-bar">
      <button type="button" data-go="back" aria-label="Back">&larr;</button>
      <button type="button" data-go="fwd" aria-label="Forward">&rarr;</button>
      <button type="button" data-go="reload" aria-label="Reload">&#x21bb;</button>
      <input type="text" aria-label="Address" spellcheck="false" autocomplete="off">
      <button type="submit">Go</button>
    </form>
    <div class="bw-links"></div>
    <iframe title="Page in the browser window" referrerpolicy="no-referrer"></iframe>
    <p class="bw-note">Big sites like Google, GitHub and YouTube refuse to load inside other pages. Type words to search Wikipedia.</p>`;
  document.body.append(win);

  const input = win.querySelector('input');
  const frame = win.querySelector('iframe');
  const history = [];
  let at = -1;

  const show = (url) => {
    input.value = url.startsWith(BASE) ? `this site (level ${DEPTH + 1})` : url;
    frame.src = url;
  };
  const go = (url) => {
    if (url === SELF) url = self();
    history.splice(at + 1);
    history.push(url);
    at = history.length - 1;
    show(url);
  };

  for (const [label, url] of LINKS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => go(url));
    win.querySelector('.bw-links').append(b);
  }
  win.querySelector('.bw-bar').addEventListener('submit', (e) => {
    e.preventDefault();
    go(toURL(input.value));
  });
  win.querySelector('[data-go=back]').addEventListener('click', () => { if (at > 0) show(history[--at]); });
  win.querySelector('[data-go=fwd]').addEventListener('click', () => { if (at < history.length - 1) show(history[++at]); });
  win.querySelector('[data-go=reload]').addEventListener('click', () => { frame.src = frame.src; });
  win.querySelector('.bw-close').addEventListener('click', () => { win.hidden = true; });
  // The secret way down: the green light asks the copy of the site inside this
  // window to open its own browser. Other sites can't be asked, so it just shakes.
  win.querySelector('.bw-deeper').addEventListener('click', () => {
    if (frame.src.startsWith(BASE)) {
      frame.contentWindow.postMessage({ sp: 'go-deeper' }, location.origin);
    } else {
      win.classList.remove('shake');
      void win.offsetWidth;
      win.classList.add('shake');
    }
  });
  win.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing an address must not trigger the toolbar's shortcuts
    if (e.key === 'Escape') win.hidden = true;
  });
  win.addEventListener('pointerdown', (e) => e.stopPropagation()); // not a physics click
  makeDraggable(win, win.querySelector('.bw-title'));
  go(SELF);
}

function toURL(text) {
  const t = text.trim();
  if (!t || /^(this site|shawnprather\.github\.io\/?$)/i.test(t)) return SELF;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t;
  return 'https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(t);
}
