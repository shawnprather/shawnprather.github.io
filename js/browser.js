// A small working web browser inside the page: the reward for 10 trophies.
// It opens on this very site, so you can break a page inside the page.

import { makeDraggable } from './ui.js';

const SELF = location.origin + location.pathname;
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
  win.className = 'browser-win';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Web browser');
  win.innerHTML = `
    <div class="bw-title">
      <button type="button" class="bw-close" aria-label="Close browser"></button>
      <span class="bw-dot"></span><span class="bw-dot"></span>
      <span class="bw-name">Browser (inside a browser)</span>
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
    input.value = url === SELF ? 'shawnprather.github.io (this site!)' : url;
    frame.src = url;
  };
  const go = (url) => {
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
  if (!t || t.startsWith('shawnprather.github.io')) return SELF;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t;
  return 'https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(t);
}
