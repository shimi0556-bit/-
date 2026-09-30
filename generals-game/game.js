'use strict';
/*
 * Generals - single-player, browser-only strategy game inspired by generals.io.
 * Grid capture, fog of war, army growth on generals/cities, capture-the-general win condition.
 * No build step, no dependencies.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TILE = { EMPTY: 'empty', MOUNTAIN: 'mountain', CITY: 'city', GENERAL: 'general' };

const MAP_SIZES = {
  small: { cols: 16, rows: 12 },
  medium: { cols: 22, rows: 16 },
  large: { cols: 28, rows: 20 },
};

const PLAYER_COLORS = [
  { name: 'אתם', fill: '#00d9ff', glow: 'rgba(0,217,255,.55)' },     // human, id 0
  { name: 'בוט אדום', fill: '#ff5c7a', glow: 'rgba(255,92,122,.55)' },
  { name: 'בוט סגול', fill: '#b388ff', glow: 'rgba(179,136,255,.55)' },
  { name: 'בוט ירוק', fill: '#5cff9a', glow: 'rgba(92,255,154,.55)' },
];

const NEUTRAL_TILE_COLOR = '#2b3252';
const MOUNTAIN_COLOR = '#1a1e30';
const CITY_NEUTRAL_COLOR = '#a3853a';
const FOG_COLOR = '#07091a';
const FOG_DISCOVERED_COLOR = '#0d1226';
const GRID_LINE = 'rgba(255,255,255,0.04)';

const HUMAN_ID = 0;
const DIRS = [ [-1, 0], [1, 0], [0, -1], [0, 1] ]; // up, down, left, right

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let cols, rows, cellSize;
let tiles = [];           // flat array: {type, owner, army, discovered, visible}
let players = [];         // {id, name, color, alive}
let turn = 0;
let tickMs = 500;
let tickTimer = null;
let selected = null;      // {r, c}
let halfMode = false;
let gameOver = false;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const toastEl = document.getElementById('toast');

// ---------------------------------------------------------------------------
// Map generation
// ---------------------------------------------------------------------------
function idx(r, c) { return r * cols + c; }
function inBounds(r, c) { return r >= 0 && r < rows && c >= 0 && c < cols; }

function generateMap(numPlayers) {
  tiles = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles[idx(r, c)] = { type: TILE.EMPTY, owner: null, army: 0, discovered: false, visible: false };
    }
  }

  // Mountains ~16%
  const mountainCount = Math.floor(cols * rows * 0.16);
  for (let i = 0; i < mountainCount; i++) {
    const r = randInt(0, rows - 1), c = randInt(0, cols - 1);
    tiles[idx(r, c)].type = TILE.MOUNTAIN;
  }

  // Generals: spread out using rejection sampling on min distance
  const generalPositions = [];
  const minDist = Math.max(4, Math.floor((cols + rows) / (numPlayers + 2)));
  let attempts = 0;
  while (generalPositions.length < numPlayers && attempts < 5000) {
    attempts++;
    const r = randInt(1, rows - 2), c = randInt(1, cols - 2);
    const t = tiles[idx(r, c)];
    if (t.type !== TILE.EMPTY) continue;
    const farEnough = generalPositions.every(p => manhattan(p.r, p.c, r, c) >= minDist);
    if (farEnough || attempts > 4000) generalPositions.push({ r, c });
  }
  // fallback: if we somehow didn't get enough, just place anywhere free
  while (generalPositions.length < numPlayers) {
    const r = randInt(0, rows - 1), c = randInt(0, cols - 1);
    if (tiles[idx(r, c)].type === TILE.EMPTY && !generalPositions.some(p => p.r === r && p.c === c)) {
      generalPositions.push({ r, c });
    }
  }

  generalPositions.forEach((pos, pid) => {
    const t = tiles[idx(pos.r, pos.c)];
    t.type = TILE.GENERAL;
    t.owner = pid;
    t.army = 1;
    t.discovered = true;
  });

  // Cities ~4.5%, neutral, army 40-50, never on top of generals/mountains
  const cityCount = Math.floor(cols * rows * 0.045);
  for (let i = 0; i < cityCount; i++) {
    let r, c, tries = 0;
    do { r = randInt(0, rows - 1); c = randInt(0, cols - 1); tries++; }
    while (tiles[idx(r, c)].type !== TILE.EMPTY && tries < 200);
    if (tiles[idx(r, c)].type === TILE.EMPTY) {
      tiles[idx(r, c)] = { type: TILE.CITY, owner: null, army: randInt(40, 50), discovered: false, visible: false };
    }
  }

  return generalPositions;
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function manhattan(r1, c1, r2, c2) { return Math.abs(r1 - r2) + Math.abs(c1 - c2); }

// ---------------------------------------------------------------------------
// Setup / lifecycle
// ---------------------------------------------------------------------------
function setupGame(sizeKey, numBots) {
  const size = MAP_SIZES[sizeKey];
  cols = size.cols; rows = size.rows;
  const numPlayers = numBots + 1;

  generateMap(numPlayers);

  players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({ id: i, name: PLAYER_COLORS[i].name, color: PLAYER_COLORS[i], alive: true });
  }

  turn = 0;
  selected = null;
  halfMode = false;
  gameOver = false;
  updateHalfUI();

  resizeCanvas();
  computeVisibility();
  render();
  updateLeaderboard();
  updateTurnCounter();

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, tickMs);
}

function resizeCanvas() {
  const wrap = document.getElementById('board-wrap');
  const maxW = wrap.clientWidth - 20;
  const maxH = wrap.clientHeight - 20;
  cellSize = Math.floor(Math.min(maxW / cols, maxH / rows));
  cellSize = Math.max(14, Math.min(48, cellSize));
  canvas.width = cellSize * cols;
  canvas.height = cellSize * rows;
}
window.addEventListener('resize', () => { if (!gameOver && tiles.length) { resizeCanvas(); render(); } });

// ---------------------------------------------------------------------------
// Game tick: army growth + AI + win check
// ---------------------------------------------------------------------------
function tick() {
  if (gameOver) return;
  turn++;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = tiles[idx(r, c)];
      if (t.owner === null) continue;
      if (t.type === TILE.GENERAL || t.type === TILE.CITY) {
        t.army++;
      } else if (turn % 25 === 0) {
        t.army++;
      }
    }
  }

  runAllBots();
  computeVisibility();
  checkGameOver();
  updateLeaderboard();
  updateTurnCounter();
  render();
}

function updateTurnCounter() {
  document.getElementById('turn-counter').innerHTML = '<span>תור</span>' + turn;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------
function tryMove(fromR, fromC, toR, toC, byPlayer, useHalf) {
  if (!inBounds(fromR, fromC) || !inBounds(toR, toC)) return false;
  const from = tiles[idx(fromR, fromC)];
  const to = tiles[idx(toR, toC)];
  if (from.owner !== byPlayer) return false;
  if (to.type === TILE.MOUNTAIN) return false;
  if (from.army <= 1) return false;

  const movable = from.army - 1;
  const amount = useHalf ? Math.max(1, Math.floor(movable / 2)) : movable;
  if (amount <= 0) return false;

  if (to.owner === byPlayer) {
    to.army += amount;
    from.army -= amount;
  } else {
    if (amount > to.army) {
      const remaining = amount - to.army;
      const wasGeneral = to.type === TILE.GENERAL;
      const defeatedId = to.owner;
      to.army = remaining;
      to.owner = byPlayer;
      from.army -= amount;
      if (wasGeneral && defeatedId !== null) {
        capturePlayer(defeatedId, byPlayer, toR, toC);
      }
    } else {
      to.army -= amount;
      from.army -= amount;
    }
  }
  return true;
}

function capturePlayer(defeatedId, capturerId, generalR, generalC) {
  // The captured general becomes a permanent city owned by the capturer.
  tiles[idx(generalR, generalC)].type = TILE.CITY;

  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].owner === defeatedId) {
      tiles[i].owner = capturerId;
    }
  }
  const defeated = players.find(p => p.id === defeatedId);
  if (defeated) defeated.alive = false;

  const defeatedName = defeated ? defeated.name : '?';
  const capturerName = capturerId === HUMAN_ID ? 'אתם' : players.find(p => p.id === capturerId).name;
  showToast(`${capturerName} כבש/ה את ${defeatedName}!`);
}

// ---------------------------------------------------------------------------
// Fog of war
// ---------------------------------------------------------------------------
function computeVisibility() {
  for (let i = 0; i < tiles.length; i++) tiles[i].visible = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = tiles[idx(r, c)];
      if (t.owner !== HUMAN_ID) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const nt = tiles[idx(nr, nc)];
          nt.visible = true;
          nt.discovered = true;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------
function runAllBots() {
  for (const p of players) {
    if (p.id === HUMAN_ID || !p.alive) continue;
    runBotTurn(p.id);
  }
}

function runBotTurn(botId) {
  let best = null; // {fromR, fromC, toR, toC, score}

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = tiles[idx(r, c)];
      if (t.owner !== botId || t.army <= 1) continue;

      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const nt = tiles[idx(nr, nc)];
        if (nt.type === TILE.MOUNTAIN) continue;

        const movable = t.army - 1;
        let score = -Infinity;

        if (nt.owner === botId) {
          // Reinforcement: low priority, prefer moving big stacks toward smaller allied stacks near border
          score = -1000 + (t.army - nt.army) * 0.01;
        } else if (nt.type === TILE.GENERAL && nt.owner !== null) {
          // Capturing an enemy general: highest priority if lethal
          if (movable > nt.army) score = 100000 + movable;
        } else if (nt.owner === null) {
          // Neutral tile / city
          if (movable > nt.army) score = 500 + (nt.type === TILE.CITY ? 300 : 0) - nt.army;
        } else {
          // Enemy owned plain tile
          if (movable > nt.army) score = 1000 + movable - nt.army;
        }

        if (score > -Infinity && (!best || score > best.score)) {
          best = { fromR: r, fromC: c, toR: nr, toC: nc, score };
        }
      }
    }
  }

  if (best) tryMove(best.fromR, best.fromC, best.toR, best.toC, botId, false);
}

// ---------------------------------------------------------------------------
// Win / lose
// ---------------------------------------------------------------------------
function checkGameOver() {
  const human = players.find(p => p.id === HUMAN_ID);
  if (!human.alive) {
    endGame(false);
    return;
  }
  const aliveOthers = players.filter(p => p.id !== HUMAN_ID && p.alive);
  if (aliveOthers.length === 0) {
    endGame(true);
  }
}

function endGame(won) {
  gameOver = true;
  clearInterval(tickTimer);
  const title = document.getElementById('gameover-title');
  const sub = document.getElementById('gameover-sub');
  title.className = won ? 'win' : 'lose';
  title.textContent = won ? 'ניצחון!' : 'הובסתם';
  sub.textContent = won
    ? `כבשתם את כל היריבים תוך ${turn} תורות`
    : `הגנרל שלכם נכבש בתור ${turn}`;
  document.getElementById('gameover-screen').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      drawTile(r, c);
    }
  }

  if (selected) {
    const t = tiles[idx(selected.r, selected.c)];
    if (t.owner === HUMAN_ID) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(selected.c * cellSize + 1.5, selected.r * cellSize + 1.5, cellSize - 3, cellSize - 3);
    } else {
      selected = null;
    }
  }
}

function drawTile(r, c) {
  const t = tiles[idx(r, c)];
  const x = c * cellSize, y = r * cellSize;

  let fill;
  if (!t.visible) {
    if (t.discovered && (t.type === TILE.MOUNTAIN || t.type === TILE.CITY)) {
      fill = t.type === TILE.MOUNTAIN ? MOUNTAIN_COLOR : FOG_DISCOVERED_COLOR;
    } else {
      fill = FOG_COLOR;
    }
  } else if (t.type === TILE.MOUNTAIN) {
    fill = MOUNTAIN_COLOR;
  } else if (t.owner !== null) {
    fill = PLAYER_COLORS[t.owner].fill;
  } else if (t.type === TILE.CITY) {
    fill = CITY_NEUTRAL_COLOR;
  } else {
    fill = NEUTRAL_TILE_COLOR;
  }

  ctx.fillStyle = fill;
  ctx.fillRect(x, y, cellSize, cellSize);

  // glow ring for owned tiles
  if (t.visible && t.owner !== null) {
    ctx.strokeStyle = PLAYER_COLORS[t.owner].glow;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
  } else {
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
  }

  if (!t.visible) return; // no icons/numbers under fog

  // icons
  const cx = x + cellSize / 2, cy = y + cellSize / 2;
  if (t.type === TILE.GENERAL) {
    drawStar(cx, cy, cellSize * 0.22, cellSize * 0.1, '#fff');
  } else if (t.type === TILE.CITY) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy - cellSize * 0.14, cellSize * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  // army number
  if (t.owner !== null || t.type === TILE.CITY) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(9, Math.floor(cellSize * 0.32))}px Segoe UI, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.9)';
    ctx.shadowBlur = 3;
    ctx.fillText(t.army, cx, cy + cellSize * 0.16);
    ctx.shadowBlur = 0;
  }
}

function drawStar(cx, cy, outerR, innerR, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
function updateLeaderboard() {
  const stats = players.map(p => {
    let land = 0, army = 0;
    for (const t of tiles) {
      if (t.owner === p.id) { land++; army += t.army; }
    }
    return { p, land, army };
  });
  stats.sort((a, b) => (b.land + b.army) - (a.land + a.army));

  const body = document.getElementById('leaderboard-body');
  body.innerHTML = '';
  for (const s of stats) {
    const tr = document.createElement('tr');
    if (!s.p.alive) tr.classList.add('dead');
    if (s.p.id === HUMAN_ID) tr.classList.add('me');
    tr.innerHTML = `
      <td><span class="swatch" style="background:${s.p.color.fill}"></span>${s.p.name}</td>
      <td>${s.land}</td>
      <td>${s.army}</td>`;
    body.appendChild(tr);
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
canvas.addEventListener('click', (e) => {
  if (gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const c = Math.floor(x / cellSize), r = Math.floor(y / cellSize);
  if (!inBounds(r, c)) return;
  handleTileClick(r, c);
});

function handleTileClick(r, c) {
  const t = tiles[idx(r, c)];

  if (!selected) {
    if (t.owner === HUMAN_ID && t.army > 1) selected = { r, c };
    render();
    return;
  }

  if (selected.r === r && selected.c === c) {
    selected = null;
    render();
    return;
  }

  const isAdjacent = manhattan(selected.r, selected.c, r, c) === 1;
  if (isAdjacent) {
    const moved = tryMove(selected.r, selected.c, r, c, HUMAN_ID, halfMode);
    if (moved) {
      const destOwner = tiles[idx(r, c)].owner;
      selected = destOwner === HUMAN_ID ? { r, c } : null;
      computeVisibility();
      updateLeaderboard();
      checkGameOver();
    }
  } else if (t.owner === HUMAN_ID && t.army > 1) {
    selected = { r, c };
  }
  render();
}

document.addEventListener('keydown', (e) => {
  if (gameOver) return;

  if (e.key === 'q' || e.key === 'Q') {
    halfMode = !halfMode;
    updateHalfUI();
    return;
  }
  if (e.key === 'Escape') {
    selected = null;
    render();
    return;
  }
  if (!selected) return;

  let dr = 0, dc = 0;
  if (e.key === 'ArrowUp') dr = -1;
  else if (e.key === 'ArrowDown') dr = 1;
  else if (e.key === 'ArrowLeft') dc = -1;
  else if (e.key === 'ArrowRight') dc = 1;
  else return;

  e.preventDefault();
  const nr = selected.r + dr, nc = selected.c + dc;
  if (!inBounds(nr, nc)) return;
  const moved = tryMove(selected.r, selected.c, nr, nc, HUMAN_ID, halfMode);
  if (moved) {
    const destOwner = tiles[idx(nr, nc)].owner;
    selected = destOwner === HUMAN_ID ? { r: nr, c: nc } : null;
    computeVisibility();
    updateLeaderboard();
    checkGameOver();
  }
  render();
});

function updateHalfUI() {
  document.getElementById('half-state').textContent = halfMode ? 'פעיל' : 'כבוי';
  document.getElementById('half-toggle').classList.toggle('active', halfMode);
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
let chosenSize = 'medium';
let chosenBots = 2;

document.querySelectorAll('[data-group="size"] .choice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-group="size"] .choice-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chosenSize = btn.dataset.value;
  });
});
document.querySelectorAll('[data-group="bots"] .choice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-group="bots"] .choice-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chosenBots = parseInt(btn.dataset.value, 10);
  });
});

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('game-screen').style.display = 'flex';
  setupGame(chosenSize, chosenBots);
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  document.getElementById('gameover-screen').classList.add('hidden');
  setupGame(chosenSize, chosenBots);
});

document.getElementById('restart-btn').addEventListener('click', () => {
  if (confirm('להתחיל משחק חדש?')) setupGame(chosenSize, chosenBots);
});

document.querySelectorAll('#speed-row .choice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#speed-row .choice-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tickMs = parseInt(btn.dataset.speed, 10);
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = setInterval(tick, tickMs);
    }
  });
});

document.getElementById('half-toggle').addEventListener('click', () => {
  halfMode = !halfMode;
  updateHalfUI();
});
