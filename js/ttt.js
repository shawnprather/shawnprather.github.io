// Hidden tic-tac-toe. Click the period at the end of "PRATHER." three times.
// The bot plays well but not perfectly, so it can be beaten.

import { makeDraggable } from './ui.js';

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const MISTAKES = 0.25; // how often the bot plays a random move instead of its best one

export class TicTacToe {
  constructor(world) {
    this.world = world;
    this.clicks = [];
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.name .dot')) return;
      const now = performance.now();
      this.clicks = this.clicks.filter((t) => now - t < 1500);
      this.clicks.push(now);
      if (this.clicks.length >= 3) {
        this.clicks = [];
        this.open();
      }
    });
  }

  open() {
    if (!this.el) this.build();
    this.el.hidden = false;
    this.reset();
    this.world.emit('ttt-found');
  }

  build() {
    const el = document.createElement('div');
    el.className = 'ttt';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Tic-tac-toe');
    el.innerHTML = `
      <div class="ttt-title"><strong>Tic-tac-toe</strong><button type="button" class="ttt-close" aria-label="Close">&times;</button></div>
      <p class="ttt-status" aria-live="polite"></p>
      <div class="ttt-board"></div>
      <button type="button" class="ttt-again">New game</button>`;
    this.cells = [];
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ttt-cell';
      b.setAttribute('aria-label', `Square ${i + 1}`);
      b.addEventListener('click', () => this.play(i));
      el.querySelector('.ttt-board').append(b);
      this.cells.push(b);
    }
    el.querySelector('.ttt-close').addEventListener('click', () => { el.hidden = true; });
    el.querySelector('.ttt-again').addEventListener('click', () => this.reset());
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') el.hidden = true;
    });
    // Clicks on the board must not reach the physics tools underneath.
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    makeDraggable(el, el.querySelector('.ttt-title'));
    document.body.append(el);
    this.el = el;
    this.status = el.querySelector('.ttt-status');
  }

  reset() {
    this.board = Array(9).fill('');
    this.over = false;
    this.render('You are X. Your move.');
    this.cells[4].focus({ preventScroll: true });
  }

  play(i) {
    if (this.over || this.board[i]) return;
    this.board[i] = 'X';
    if (this.finish()) return;
    this.board[this.botMove()] = 'O';
    if (this.finish()) return;
    this.render('Your move.');
  }

  finish() {
    const w = winner(this.board);
    const full = this.board.every(Boolean);
    if (!w && !full) return false;
    this.over = true;
    if (w === 'X') { this.render('You win! The bot is filing a complaint.'); this.world.emit('ttt-win'); }
    else if (w === 'O') this.render('The bot wins. Try again?');
    else { this.render("Cat's game. Nobody wins."); this.world.emit('ttt-draw'); }
    return true;
  }

  render(msg) {
    this.status.textContent = msg;
    const w = winLine(this.board);
    this.board.forEach((v, i) => {
      const c = this.cells[i];
      c.textContent = v;
      c.disabled = this.over || !!v;
      c.classList.toggle('win', !!w && w.includes(i));
      c.setAttribute('aria-label', `Square ${i + 1}${v ? `, ${v}` : ', empty'}`);
    });
  }

  botMove() {
    const open = this.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (Math.random() < MISTAKES) return open[(Math.random() * open.length) | 0];
    let best = open[0], bestScore = -Infinity;
    for (const i of open) {
      this.board[i] = 'O';
      const s = minimax(this.board, false);
      this.board[i] = '';
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }
}

function winLine(b) {
  return LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]) || null;
}

function winner(b) {
  const l = winLine(b);
  return l ? b[l[0]] : null;
}

function minimax(b, botTurn) {
  const w = winner(b);
  if (w === 'O') return 1;
  if (w === 'X') return -1;
  if (b.every(Boolean)) return 0;
  let best = botTurn ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = botTurn ? 'O' : 'X';
    const s = minimax(b, !botTurn);
    b[i] = '';
    best = botTurn ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}
