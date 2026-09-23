import { STAGES, AI, RACE, CAR, CAR_TYPES, carRatings } from './config.js';
import { Race } from './Race.js';
import { drawCarProfile } from './CarModel.js';
import { ITEMS } from './Pickups.js';

/** The island count in words (masculine, for 'איים'). */
const ISLANDS = ['', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה', 'עשרה'][STAGES.length] || String(STAGES.length);

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};

const ICON = {
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 4 6 12l9 8z"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 4 9 8-9 8z"/></svg>',
  gas: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 20 15H4z"/><rect x="9" y="15" width="6" height="6" rx="1"/></svg>',
  brake: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>',
  nitro: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 4v10"/><circle cx="12" cy="18" r="3"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/></svg>',
  shots: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9.5h9l3 2.5-3 2.5H3z"/><circle cx="18.5" cy="12" r="2.5"/><path d="M3 5h5l2 1.5L8 8H3zM3 16h5l2 1.5L8 19H3z" opacity=".6"/></svg>',
  mine: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="13" r="6"/><path d="M12 3v4M12 19v3M3 13h3M18 13h3M5.6 6.6l2.2 2.2M16.2 17.2l2 2M5.6 19.4l2.2-2.2M16.2 8.8l2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="13" r="1.8" fill="#ff3b3b"/></svg>',
  turbo: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6l7 6-7 6zM12 6l7 6-7 6z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 20 5v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V5z"/></svg>',
  item: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" stroke-linecap="round"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/></svg>',
};
const icon = (name) => {
  const s = document.createElement('span');
  s.innerHTML = ICON[name];
  return s.firstChild;
};

const WEATHER = { snow: 'שלג', dust: 'אבק מדבר', ash: 'אפר וולקני' };
const hourLabel = (t) => `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;
const ordinal = (n) => `${n}`;

/**
 * All DOM for the race: menus, loader, HUD (position, laps, timing,
 * leaderboard, speedometer, minimap, messages), pause, results and the
 * championship table, plus the touch pad. Pure view: the Game calls in.
 */
export class RaceUI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.hudEls = null;
    this._hudT = 0;
  }

  clear() {
    for (const el of [this.menuEl, this.hudEl, this.pauseEl, this.resultsEl, this.touchEl, this.stageEl, this.topEl]) el && el.remove();
    this.menuEl = this.hudEl = this.pauseEl = this.resultsEl = this.touchEl = this.stageEl = this.topEl = null;
  }

  // ------------------------------------------------------------------ menu

  showMenu(state) {
    this.clear();
    const g = this.game;
    const s = g.settings;
    const cards = STAGES.map((st, i) => {
      const cv = h('canvas', { width: 320, height: 200, 'aria-hidden': 'true' });
      const best = g.records[st.id];
      const btn = h(
        'button',
        { class: 'island', type: 'button', style: `--c:${st.color}`, 'aria-pressed': String(state.selected === i), onclick: () => g.selectStage(i) },
        cv,
        h('span', { class: 'idx' }, i + 1),
        h(
          'div',
          { class: 'meta' },
          h('h3', {}, st.name),
          h('p', {}, st.tagline),
          h(
            'div',
            { class: 'chips' },
            h('span', { class: 'chip', 'data-len': st.id }, g.plans[st.id] ? `${(g.plans[st.id].length / 1000).toFixed(2)} ק״מ` : '…'),
            h('span', { class: 'chip' }, hourLabel(st.sky.time)),
            st.weather ? h('span', { class: 'chip' }, WEATHER[st.weather]) : null,
          ),
          best ? h('span', { class: 'best' }, `שיא הקפה: `, h('span', { class: 'num' }, Race.fmt(best))) : null,
        ),
      );
      btn._canvas = cv;
      btn._stage = st;
      return btn;
    });
    this.cards = cards;
    const segBtn = (key, value, label) =>
      h('button', { type: 'button', 'aria-pressed': String(s[key] === value), onclick: () => g.setSetting(key, value) }, label);
    const menu = h(
      'div',
      { class: 'screen', role: 'dialog', 'aria-label': 'תפריט ראשי' },
      h(
        'div',
        { class: 'menu-grid' },
        h('div', { class: 'brand' }, h('div', { class: 'kicker' }, 'SHIMOTRON RALLY'), h('h1', {}, 'שימוטרון ראלי'), h('p', {}, `${ISLANDS} איים — מיערות ודיונות ועד עיר סואנת וקניון הרי געש — מסלולים של יותר משלושה קילומטרים, שישה סוגי רכבים, הפתעות על המסלול, אליפות וקריירה. כל אי נבנה בזמן אמת.`)),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn primary big', type: 'button', onclick: () => g.startChampionship() }, icon('trophy'), state.champ ? `המשך אליפות · שלב ${state.champ.stage + 1}/${STAGES.length}` : `אליפות (${STAGES.length} איים)`),
          h('button', { class: 'btn big', type: 'button', onclick: () => g.startSingle() }, icon('flag'), `מירוץ בודד · ${STAGES[state.selected].name}`),
          state.champ ? h('button', { class: 'btn', type: 'button', onclick: () => g.resetChampionship() }, 'אליפות חדשה') : null,
        ),
        h('div', { class: 'islands', role: 'group', 'aria-label': 'בחירת אי' }, cards),
        h('h2', { class: 'section-title' }, 'הרכב שלך'),
        this.carPicker({ selected: s.car || 'gt', color: s.color, onPick: (id) => g.setSetting('car', id) }),
        h(
          'div',
          { class: 'settings' },
          h('label', { class: 'field' }, h('span', {}, 'רמת יריבים'), h('div', { class: 'seg' }, Object.entries(AI.difficulty).map(([k, d]) => segBtn('difficulty', k, d.label)))),
          h('label', { class: 'field' }, h('span', {}, 'הפתעות על המסלול'), h('div', { class: 'seg' }, [[true, 'כן'], [false, 'לא']].map(([v, l]) => segBtn('items', v, l)))),
          h('label', { class: 'field' }, h('span', {}, 'הקפות'), h('div', { class: 'seg' }, [1, 2, 3, 5].map((n) => segBtn('laps', n, String(n))))),
          h('label', { class: 'field' }, h('span', {}, 'גרפיקה'), h('div', { class: 'seg' }, [['low', 'נמוכה'], ['medium', 'בינונית'], ['high', 'גבוהה'], ['ultra', 'אולטרה']].map(([k, l]) => segBtn('quality', k, l)))),
          h('label', { class: 'field' }, h('span', {}, 'צבע המכונית שלך'), h('div', { class: 'seg' }, ['#e0262b', '#ff7a1a', '#f2f2f2', '#141414', '#2f6bff'].map((c) => h('button', { type: 'button', 'aria-pressed': String(s.color === c), 'aria-label': c, onclick: () => g.setSetting('color', c), style: `width:40px` }, h('span', { style: `display:block;width:18px;height:18px;border-radius:50%;margin:auto;background:${c};border:1px solid rgba(255,255,255,.35)` }))))),
        ),
        h(
          'div',
          { class: 'help' },
          h('span', {}, h('kbd', {}, 'W'), '/', h('kbd', {}, '↑'), ' גז'),
          h('span', {}, h('kbd', {}, 'S'), '/', h('kbd', {}, '↓'), ' בלם ורוורס'),
          h('span', {}, h('kbd', {}, 'A D'), '/', h('kbd', {}, '← →'), ' היגוי'),
          h('span', {}, h('kbd', {}, 'רווח'), ' בלם יד (דריפט)'),
          h('span', {}, h('kbd', {}, 'Shift'), ' ניטרו'),
          h('span', {}, h('kbd', {}, 'C'), ' מצלמה'),
          h('span', {}, h('kbd', {}, 'R'), ' חזרה למסלול'),
          h('span', {}, h('kbd', {}, 'Esc'), ' עצירה'),
          h('span', {}, 'תומך גם בג׳ויסטיק ובמסך מגע'),
        ),
      ),
    );
    this.menuEl = menu;
    this.root.append(menu);
    this.refreshPreviews();
    const first = cards[state.selected];
    if (first) first.focus({ preventScroll: true });
  }

  /**
   * Row of car cards: side profile, name, one-line character and four rating bars.
   * opts: { selected, color, onPick(id), owned?: Set, money?, onBuy?(id) } — owned/money switch on career prices.
   */
  carPicker({ selected, color, onPick, owned = null, money = 0, onBuy = null }) {
    const labels = { speed: 'מהירות', accel: 'תאוצה', grip: 'אחיזה', offroad: 'שטח' };
    const cards = CAR_TYPES.map((t) => {
      const cv = h('canvas', { width: 320, height: 120, 'aria-hidden': 'true' });
      drawCarProfile(cv, t.id, color);
      const r = carRatings(t.id);
      const have = !owned || owned.has(t.id);
      const bars = h(
        'div',
        { class: 'bars' },
        Object.entries(labels).map(([k, l]) => h('div', { class: 'bar-row' }, h('span', {}, l), h('i', { style: `--v:${r[k] * 10}%` }))),
      );
      const buy = !have
        ? h('button', { class: 'btn small', type: 'button', disabled: money < t.price ? true : null, onclick: (e) => { e.stopPropagation(); onBuy && onBuy(t.id); } }, `קנייה · ₪${t.price.toLocaleString('he-IL')}`)
        : null;
      return h(
        'button',
        { class: `carcard${have ? '' : ' locked'}`, type: 'button', 'aria-pressed': String(selected === t.id), onclick: () => have && onPick(t.id) },
        cv,
        h('div', { class: 'meta' }, h('h3', {}, t.name), h('p', {}, t.desc), bars, buy),
      );
    });
    return h('div', { class: 'cars', role: 'group', 'aria-label': 'בחירת רכב' }, cards);
  }

  /** Draws each island card's map (terrain relief + circuit) once its plan exists. */
  refreshPreviews() {
    if (!this.cards) return;
    for (const card of this.cards) {
      const st = card._stage;
      const img = this.game.previews[st.id];
      const cv = card._canvas;
      const g2 = cv.getContext('2d');
      if (img) g2.drawImage(img, 0, 0, cv.width, cv.height);
      const lenChip = card.querySelector(`[data-len="${st.id}"]`);
      const plan = this.game.plans[st.id];
      if (lenChip && plan) lenChip.textContent = `${(plan.length / 1000).toFixed(2)} ק״מ`;
    }
  }

  // ------------------------------------------------------------ loading

  showLoader(text, p = 0) {
    let el = document.getElementById('loader');
    if (!el) return;
    el.classList.remove('done');
    el.hidden = false;
    el.querySelector('.bar i').style.width = `${Math.round(p * 100)}%`;
    el.querySelector('.step').textContent = text;
  }

  hideLoader() {
    const el = document.getElementById('loader');
    if (!el) return;
    el.classList.add('done');
  }

  // --------------------------------------------------------------- HUD

  showHUD(race, stage) {
    this.clear();
    const g = this.game;
    const speedo = h('canvas', { width: 460, height: 300 });
    const minimap = h('canvas', { class: 'minimap pill', width: 380, height: 380 });
    const board = h('ol');
    const els = {
      pos: h('span', { class: 'big' }, '–'),
      of: h('span', { class: 'of' }, `/${race.entries.length}`),
      lap: h('b', {}, '1'),
      lapOf: h('span', { class: 'lbl' }, `/${race.laps}`),
      cur: h('dd', { class: 'num cur' }, '0.000'),
      last: h('dd', { class: 'num' }, '—'),
      best: h('dd', { class: 'num' }, '—'),
      total: h('dd', { class: 'num' }, '0.000'),
      delta: h('dd', { class: 'num delta' }, ''),
      board,
      speedo,
      minimap,
    };
    this.hudEls = els;
    this._hudT = 0;
    const hud = h(
      'div',
      { class: 'hud', 'aria-hidden': 'true' },
      h(
        'div',
        { class: 'tr' },
        h('div', { class: 'pill posbox' }, h('span', { class: 'lbl' }, 'מקום'), els.pos, els.of),
        h('div', { class: 'pill lapbox' }, h('span', { class: 'lbl' }, 'הקפה'), els.lap, els.lapOf),
        h('div', { class: 'pill board' }, board),
      ),
      h(
        'div',
        { class: 'tl' },
        h('dl', { class: 'pill times' }, h('dt', {}, 'הקפה'), els.cur, h('dt', {}, 'אחרונה'), els.last, h('dt', {}, 'הטובה'), els.best, h('dt', {}, 'סה״כ'), els.total, h('dt', {}, 'פער'), els.delta),
      ),
      h('div', { class: 'bl' }, h('div', { class: 'speedo' }, speedo)),
      h('div', { class: 'br' }, minimap),
      (els.item = h('div', { class: 'pill itemslot', hidden: race.pickups ? null : true }, h('span', { class: 'ico' }), h('span', { class: 'name' }), h('span', { class: 'key' }, g.isTouch ? '' : 'E'))),
    );
    this.hudEl = hud;
    this.root.append(hud);
    const top = h(
      'div',
      { class: 'topbtns' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'עצירה', onclick: () => g.pause(true), html: ICON.pause }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'החלפת מצלמה', onclick: () => g.cycleCamera(), html: ICON.camera }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה למסלול', onclick: () => (g.touch.reset = true), html: ICON.reset }),
    );
    this.topEl = top;
    this.root.append(top);
    this.stageEl = h('div', { class: 'stagename' }, h('h2', { style: `color:${stage.color}` }, stage.name), h('p', {}, `${stage.tagline} · ${(race.track.length / 1000).toFixed(2)} ק״מ · ${race.laps} הקפות`));
    this.root.append(this.stageEl);
    this.msgEl = this.msgEl || h('div', { class: 'msg', role: 'status', 'aria-live': 'assertive' });
    this.root.append(this.msgEl);
    this.flashEl = this.flashEl || h('div', { class: 'flash' });
    this.root.append(this.flashEl);
    if (g.isTouch) this._touchPad();
    this._mapCache = null;
  }

  hideStageName() {
    if (this.stageEl) {
      this.stageEl.style.transition = 'opacity .6s';
      this.stageEl.style.opacity = '0';
    }
  }

  message(text, kind = '', sub = '', ms = 900) {
    const el = this.msgEl;
    if (!el) return;
    el.className = `msg ${kind}`;
    el.textContent = text;
    if (sub) el.append(h('small', {}, sub));
    void el.offsetWidth;
    el.classList.add('pop');
    el.style.animationDuration = `${ms}ms`;
  }

  /** Small transient notice under the top buttons. */
  toast(text, color = '') {
    if (!this.toastEl) {
      this.toastEl = h('div', { class: 'toast pill', role: 'status' });
      this.root.append(this.toastEl);
    }
    const el = this.toastEl;
    el.textContent = text;
    el.style.color = color || '';
    el.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => (el.style.opacity = '0'), 1600);
  }

  flash() {
    if (!this.flashEl) return;
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '0.5';
    requestAnimationFrame(() => {
      this.flashEl.style.transition = 'opacity .5s';
      this.flashEl.style.opacity = '0';
    });
  }

  _touchPad() {
    const T = this.game.touch;
    const pad = h('div', { class: 'touch' });
    const bind = (cls, key, svg, label) => {
      const b = h('button', { class: cls, type: 'button', 'aria-label': label, html: ICON[svg] });
      const on = (e) => {
        e.preventDefault();
        T[key] = true;
        b.classList.add('on');
      };
      const off = (e) => {
        e.preventDefault();
        T[key] = false;
        b.classList.remove('on');
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      pad.append(b);
    };
    bind('t-left', 'left', 'left', 'שמאלה');
    bind('t-right', 'right', 'right', 'ימינה');
    bind('t-gas', 'gas', 'gas', 'גז');
    bind('t-brake', 'brake', 'brake', 'בלם');
    bind('t-nitro', 'nitro', 'nitro', 'ניטרו');
    bind('t-hand', 'handbrake', 'hand', 'בלם יד');
    if (this.game.race && this.game.race.pickups) {
      const b = h('button', { class: 't-item', type: 'button', 'aria-label': 'שימוש בהפתעה', html: ICON.item });
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        T.item = true;
      });
      pad.append(b);
    }
    this.touchEl = pad;
    this.root.append(pad);
  }

  /** Per-frame HUD: speedometer every frame, text at ~12 Hz. */
  updateHUD(race, dt) {
    const els = this.hudEls;
    if (!els) return;
    const P = race.player;
    this._drawSpeedo(els.speedo, P.car);
    this._hudT -= dt;
    if (this._hudT > 0) return;
    this._hudT = 0.08;
    this._drawMap(els.minimap, race);
    els.pos.textContent = ordinal(P.position);
    const lap = Math.min(race.laps, Math.max(1, P.crossed + 1));
    els.lap.textContent = String(lap);
    const running = race.state === 'racing' || race.state === 'finished';
    const cur = running && !P.finished ? race.clock - P.lapStart : 0;
    els.cur.textContent = Race.fmt(cur);
    els.last.textContent = P.lapTimes.length ? Race.fmt(P.lapTimes[P.lapTimes.length - 1]) : '—';
    els.best.textContent = isFinite(P.bestLap) ? Race.fmt(P.bestLap) : '—';
    els.total.textContent = Race.fmt(P.finished ? P.finishTime : race.clock);
    // Gap to the car ahead (or behind when leading).
    const order = race.order || race.entries;
    const i = order.indexOf(P);
    let delta = '';
    let cls = 'num delta';
    if (running && order.length > 1) {
      if (i > 0) {
        delta = Race.fmt(P.gap - order[i - 1].gap, true);
        cls += ' bad';
      } else {
        const behind = order[1];
        delta = Race.fmt(-(behind.gap - P.gap));
        cls += ' good';
      }
    }
    els.delta.textContent = delta;
    els.delta.className = cls;
    // Leaderboard.
    const leader = order[0];
    const rows = order.map((e, k) => {
      const gap = k === 0 ? (race.state === 'racing' ? `הקפה ${Math.min(race.laps, Math.max(1, e.crossed + 1))}` : '') : e.finished && leader.finished ? Race.fmt(e.finishTime - leader.finishTime, true) : Race.fmt(Math.max(0, e.gap), true);
      return h('li', { class: e.isPlayer ? 'me' : '', style: `--car:${e.color}` }, h('span', { class: 'p' }, k + 1), h('span', { class: 'c' }), h('span', {}, e.name), h('span', { class: 'g num' }, running ? gap : ''));
    });
    els.board.replaceChildren(...rows);
    // Held surprise.
    if (els.item && race.pickups) {
      const it = P.item;
      const key = it ? `${it.kind}:${it.charges}` : '';
      if (key !== this._itemKey) {
        this._itemKey = key;
        els.item.classList.toggle('empty', !it);
        els.item.style.setProperty('--ic', it ? ITEMS[it.kind].color : '#667286');
        els.item.children[0].innerHTML = ICON[it ? it.kind : 'item'];
        els.item.children[1].textContent = it ? `${ITEMS[it.kind].name}${it.charges > 1 ? ` ×${it.charges}` : ''}` : 'אין הפתעה';
        if (it) {
          els.item.classList.remove('pulse');
          void els.item.offsetWidth;
          els.item.classList.add('pulse');
        }
      }
      els.item.classList.toggle('shielded', P.shield > 0);
    }
  }

  _drawSpeedo(cv, car) {
    const g = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    g.clearRect(0, 0, W, H);
    const veh = car.vehicle;
    const cx = W * 0.5;
    const cy = H * 0.78;
    const R = W * 0.4;
    const a0 = Math.PI * 0.85;
    const a1 = Math.PI * 2.15;
    // Backplate arc.
    g.lineCap = 'round';
    g.lineWidth = 18;
    g.strokeStyle = 'rgba(10,13,19,0.72)';
    g.beginPath();
    g.arc(cx, cy, R, a0, a1);
    g.stroke();
    // RPM arc with redline.
    const E = CAR.engine;
    const r = Math.min(1, veh.rpm / E.redline);
    const grad = g.createLinearGradient(cx - R, 0, cx + R, 0);
    grad.addColorStop(0, '#39d9ff');
    grad.addColorStop(0.7, '#ffb020');
    grad.addColorStop(1, '#ff4a2a');
    g.lineWidth = 10;
    g.strokeStyle = grad;
    g.beginPath();
    g.arc(cx, cy, R, a0, a0 + (a1 - a0) * r);
    g.stroke();
    // Ticks.
    g.lineWidth = 3;
    for (let k = 0; k <= 8; k++) {
      const a = a0 + ((a1 - a0) * k) / 8;
      g.strokeStyle = k >= 7 ? '#ff4a2a' : 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
      g.lineTo(cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32));
      g.stroke();
    }
    // Digital speed + gear.
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = '700 92px "JetBrains Mono", monospace';
    g.fillText(String(Math.round(car.kmh)), cx, cy - 16);
    g.font = '600 22px "IBM Plex Sans Hebrew", sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText('קמ״ש', cx, cy + 16);
    g.font = '700 40px "JetBrains Mono", monospace';
    g.fillStyle = veh.rpm > E.redline * 0.92 ? '#ff4a2a' : '#ffb020';
    g.fillText(veh.reversing ? 'R' : String(veh.gear), cx + R * 0.78, cy + 34);
    // Nitro bar.
    const bw = R * 1.2;
    const bx = cx - bw / 2 - 30;
    const by = cy + 34;
    g.fillStyle = 'rgba(10,13,19,0.72)';
    g.fillRect(bx, by, bw, 12);
    g.fillStyle = veh.nitroActive ? '#8fd0ff' : '#39d9ff';
    g.fillRect(bx, by, bw * veh.nitro, 12);
    g.font = '600 18px "IBM Plex Sans Hebrew", sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.textAlign = 'right';
    g.fillText('ניטרו', bx - 8, by + 12);
  }

  _drawMap(cv, race) {
    const g = cv.getContext('2d');
    const W = cv.width;
    const tr = race.track;
    if (!this._mapCache) {
      const o = tr.outline(3);
      const span = Math.max(o.maxX - o.minX, o.maxZ - o.minZ);
      const pad = 26;
      const k = (W - pad * 2) / span;
      const ox = pad + (W - pad * 2 - (o.maxX - o.minX) * k) / 2;
      const oz = pad + (W - pad * 2 - (o.maxZ - o.minZ) * k) / 2;
      const map = (x, z) => [ox + (x - o.minX) * k, oz + (z - o.minZ) * k];
      const bg = document.createElement('canvas');
      bg.width = W;
      bg.height = W;
      const b = bg.getContext('2d');
      b.lineJoin = 'round';
      b.beginPath();
      o.pts.forEach(([x, z], i) => {
        const [px, pz] = map(x, z);
        if (i === 0) b.moveTo(px, pz);
        else b.lineTo(px, pz);
      });
      b.closePath();
      b.strokeStyle = 'rgba(0,0,0,0.55)';
      b.lineWidth = 14;
      b.stroke();
      b.strokeStyle = 'rgba(230,236,245,0.9)';
      b.lineWidth = 6;
      b.stroke();
      // Start line.
      const [sx, sz] = map(tr.x[0], tr.z[0]);
      b.fillStyle = '#fff';
      b.fillRect(sx - 7, sz - 7, 14, 14);
      b.fillStyle = '#111';
      b.fillRect(sx - 7, sz - 7, 7, 7);
      b.fillRect(sx, sz, 7, 7);
      this._mapCache = { bg, map };
    }
    const { bg, map } = this._mapCache;
    g.clearRect(0, 0, W, W);
    g.drawImage(bg, 0, 0);
    const order = [...race.entries].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const e of order) {
      const [px, pz] = map(e.car.position.x, e.car.position.z);
      g.beginPath();
      g.arc(px, pz, e.isPlayer ? 11 : 8, 0, Math.PI * 2);
      g.fillStyle = e.color;
      g.fill();
      g.lineWidth = e.isPlayer ? 4 : 2.5;
      g.strokeStyle = e.isPlayer ? '#ffb020' : 'rgba(0,0,0,0.7)';
      g.stroke();
    }
  }

  // ------------------------------------------------------------ pause

  showPause(on) {
    if (this.pauseEl) {
      this.pauseEl.remove();
      this.pauseEl = null;
    }
    if (!on) return;
    const g = this.game;
    const el = h(
      'div',
      { class: 'screen', role: 'dialog', 'aria-label': 'עצירה', style: 'background:rgba(6,8,12,.78)' },
      h(
        'div',
        { class: 'results', style: 'max-width:420px;text-align:center' },
        h('h2', {}, 'עצירה'),
        h('p', { class: 'sub' }, `${g.stage.name} · ${g.settingsLabel()}`),
        h(
          'div',
          { style: 'display:flex;flex-direction:column;gap:10px' },
          h('button', { class: 'btn primary big', type: 'button', onclick: () => g.pause(false) }, 'המשך'),
          h('button', { class: 'btn', type: 'button', onclick: () => g.restart() }, 'התחלה מחדש'),
          h('button', { class: 'btn', type: 'button', onclick: () => g.cycleCamera() }, 'החלפת מצלמה (C)'),
          h('button', { class: 'btn', type: 'button', onclick: () => g.toggleSound() }, g.settings.sound ? 'השתקה' : 'הפעלת קול'),
          h('button', { class: 'btn', type: 'button', onclick: () => g.toMenu() }, 'לתפריט הראשי'),
        ),
      ),
    );
    this.pauseEl = el;
    this.root.append(el);
    el.querySelector('.btn.primary').focus();
  }

  // ---------------------------------------------------------- results

  showResults(race, { champ, points, onNext, onRetry, onMenu, newRecord }) {
    if (this.resultsEl) this.resultsEl.remove();
    const leader = race.order[0];
    const rows = race.order.map((e, k) =>
      h(
        'tr',
        { class: e.isPlayer ? 'me' : '', style: `--car:${e.color}` },
        h('td', { class: 'pos' }, k + 1),
        h('td', {}, h('span', { class: 'car' }), e.name, e.estimated ? h('span', { class: 'chip', style: 'margin-inline-start:8px' }, 'לא סיים') : null),
        h('td', { class: 'num' }, k === 0 ? Race.fmt(e.finishTime) : Race.fmt(e.finishTime - leader.finishTime, true)),
        h('td', { class: 'num' }, Race.fmt(e.bestLap)),
        h('td', { class: 'num' }, `${Math.round(e.topSpeed)}`),
        champ ? h('td', { class: 'pts' }, `+${RACE.points[k] || 0}`) : null,
      ),
    );
    const P = race.player;
    const title = P.position === 1 ? 'ניצחון!' : P.position <= 3 ? `מקום ${P.position} — על הפודיום` : `מקום ${P.position}`;
    const table = h(
      'table',
      { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'נהג'), h('th', {}, 'זמן'), h('th', {}, 'הקפה מהירה'), h('th', {}, 'מהירות שיא'), champ ? h('th', {}, 'נקודות') : null)),
      h('tbody', {}, rows),
    );
    const kids = [h('h2', { style: P.position === 1 ? 'color:var(--accent)' : '' }, title), h('p', { class: 'sub' }, `${this.game.stage.name} · ${race.laps} הקפות · ${(race.track.length / 1000).toFixed(2)} ק״מ להקפה`), table];
    if (newRecord) kids.push(h('p', { class: 'podium-note', style: 'color:var(--purple)' }, `שיא הקפה חדש לאי: ${Race.fmt(P.bestLap)}`));
    if (champ && points) kids.push(this._standings(points, champ));
    kids.push(
      h(
        'div',
        { class: 'row', style: 'margin-top:18px' },
        onNext ? h('button', { class: 'btn primary big', type: 'button', onclick: onNext }, champ && champ.stage >= STAGES.length - 1 ? 'לטבלת האליפות' : 'לאי הבא') : null,
        h('button', { class: 'btn', type: 'button', onclick: onRetry }, 'שוב באותו אי'),
        h('button', { class: 'btn', type: 'button', onclick: onMenu }, 'תפריט'),
      ),
    );
    const el = h('div', { class: 'screen', role: 'dialog', 'aria-label': 'תוצאות', style: 'background:rgba(6,8,12,.7)' }, h('div', { class: 'results' }, kids));
    this.resultsEl = el;
    this.root.append(el);
    const b = el.querySelector('.btn.primary') || el.querySelector('.btn');
    b && b.focus();
  }

  _standings(points, champ) {
    const list = Object.values(points).sort((a, b) => b.pts - a.pts);
    return h(
      'div',
      { style: 'margin-top:18px' },
      h('h3', { style: 'margin:0 0 6px;font:700 30px/1 var(--display)' }, `טבלת האליפות · אחרי ${champ.stage + 1} מתוך ${STAGES.length}`),
      h(
        'table',
        { class: 'tbl' },
        h('tbody', {}, list.map((d, k) => h('tr', { class: d.isPlayer ? 'me' : '', style: `--car:${d.color}` }, h('td', { class: 'pos' }, k + 1), h('td', {}, h('span', { class: 'car' }), d.name), h('td', { class: 'pts' }, `${d.pts} נק׳`), h('td', { class: 'num', style: 'color:var(--muted)' }, d.results.map((r) => r || '–').join(' · '))))),
      ),
    );
  }

  showChampionshipEnd(points, onMenu) {
    this.clear();
    const list = Object.values(points).sort((a, b) => b.pts - a.pts);
    const me = list.findIndex((d) => d.isPlayer) + 1;
    const title = me === 1 ? 'אלופ/ת שימוטרון ראלי!' : `סיימת את האליפות במקום ${me}`;
    const el = h(
      'div',
      { class: 'screen', role: 'dialog', 'aria-label': 'סיום אליפות', style: 'background:rgba(6,8,12,.7)' },
      h(
        'div',
        { class: 'results', style: 'text-align:center' },
        h('div', { html: ICON.trophy.replace('<svg', '<svg class="trophy"') }),
        h('h2', { style: me === 1 ? 'color:var(--accent)' : '' }, title),
        h('p', { class: 'sub' }, `${ISLANDS} איים, ${ISLANDS} מסלולים — הנה הטבלה הסופית`),
        h('table', { class: 'tbl', style: 'text-align:start' }, h('tbody', {}, list.map((d, k) => h('tr', { class: d.isPlayer ? 'me' : '', style: `--car:${d.color}` }, h('td', { class: 'pos' }, k + 1), h('td', {}, h('span', { class: 'car' }), d.name), h('td', { class: 'pts' }, `${d.pts} נק׳`))))),
        h('div', { class: 'row', style: 'justify-content:center;margin-top:18px' }, h('button', { class: 'btn primary big', type: 'button', onclick: onMenu }, 'לתפריט הראשי')),
      ),
    );
    this.resultsEl = el;
    this.root.append(el);
  }
}
