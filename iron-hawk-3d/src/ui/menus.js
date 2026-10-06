// Menu screens (Hebrew, right to left): loading, title, region select, briefing, monster
// atlas, settings, help, pause and results. The screens only display things and report
// clicks; main.js decides what each action does.
import { LEVELS } from '../world/levels.js';
import { SPECIES, SPECIES_ORDER } from '../actors/species.js';
import { QUALITY } from '../core/render.js';
import { assetURL } from '../core/textures.js';
import { formatInt } from '../core/util.js';

const TIPS = [
  'החזיקו מטרה בתוך המסגרת עד שהיהלום נהיה אדום, ואז שגרו טיל.',
  'כדורי אש אפשר להפיל בתותח לפני שהם מגיעים אליכם.',
  'מטאורים נופלים בתוך עמודי האור האדומים. צאו מהם מהר.',
  'שריונים חזקים מלפנים. תקפו אותם מהצד או מאחור.',
  'רצים בורחים מצל המטוס. כוונו קצת לפניהם.',
  'טורבו מתמלא לבד כשלא משתמשים בו.',
  'תיבה ירוקה מתקנת את המטוס, כתומה ממלאת טילים, כחולה ממלאת טורבו.',
  'רצף פגיעות מהיר מכפיל את הניקוד עד פי 5.',
];

const STAT_LABELS = { hp: 'עמידות', speed: 'מהירות', size: 'גודל', danger: 'סכנה' };

export class Menus {
  constructor(root, { onAction, audio }) {
    this.root = root;
    this.onAction = onAction;
    this.audio = audio;
    this.stack = [];
    this.$ = (id) => root.querySelector('#' + id);
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      this.audio.unlock();
      this.audio.ui('click');
      this.onAction(el.dataset.action, el);
    });
    root.addEventListener('pointerover', (e) => {
      const el = e.target.closest('.btn, .region, .best-item');
      if (el && el !== this.hovered && e.pointerType === 'mouse') { this.hovered = el; this.audio.ui('hover'); }
    });
    this.tipIndex = Math.floor(Math.random() * TIPS.length);
  }

  get current() { return this.stack[this.stack.length - 1] || null; }

  // replace the whole stack (e.g. 'title' after loading)
  reset(id) { this.stack = id ? [id] : []; this.apply(); }
  push(id) { if (this.current !== id) this.stack.push(id); this.apply(); }
  pop() { if (this.stack.length > 1) this.stack.pop(); this.apply(); return this.current; }
  hideAll() { this.stack = []; this.apply(); }

  apply() {
    const cur = this.current;
    for (const s of this.root.querySelectorAll('.screen')) s.classList.toggle('active', s.id === 'screen-' + cur);
    // focus the first useful button for keyboard and gamepad users
    const scr = cur && this.$('screen-' + cur);
    if (scr) {
      const f = scr.querySelector('.btn.primary, .region, .best-item, .btn:not(.back)');
      if (f && window.matchMedia('(hover: hover)').matches) setTimeout(() => f.focus({ preventScroll: true }), 30);
    }
  }

  // ---------------------------------------------------------------- loading
  setLoading(p, title) {
    this.$('load-bar').style.width = `${Math.round(p * 100)}%`;
    if (title) this.$('load-title').textContent = title;
  }

  nextTip() {
    this.tipIndex = (this.tipIndex + 1) % TIPS.length;
    this.$('load-tip').textContent = 'טיפ: ' + TIPS[this.tipIndex];
  }

  // ---------------------------------------------------------------- regions
  artStyle(level) {
    const url = assetURL(level.image);
    return url ? `background-image:url(${url})` : '';
  }

  renderRegions(progress) {
    const html = LEVELS.map((L, i) => {
      const p = progress.levels[L.id] || {};
      const stars = [0, 1, 2].map((k) => `<i class="${k < (p.stars || 0) ? 'on' : ''}"></i>`).join('');
      const best = p.best ? `שיא: ${formatInt(p.best)}` : 'עוד לא שוחק';
      return `<button class="region" data-action="region" data-id="${L.id}">
        <div class="art art-${L.id}" style="${this.artStyle(L)}"></div>
        <div class="info">
          <div class="num">אזור ${i + 1}</div>
          <h3>${L.name}</h3>
          <p>${L.tagline}</p>
          <div class="meta"><div class="stars-sm" aria-label="${p.stars || 0} כוכבים">${stars}</div><span>${best}</span></div>
        </div>
      </button>`;
    }).join('');
    this.$('regions').innerHTML = html;
  }

  // ---------------------------------------------------------------- briefing
  renderBriefing(level, touch) {
    const art = this.$('brief-art');
    art.className = `brief-art art-${level.id}`;
    art.setAttribute('style', this.artStyle(level));
    this.$('brief-name').textContent = level.name;
    this.$('brief-text').textContent = level.brief;
    this.$('brief-goal').textContent = level.goal
      ? `המשימה: לחסל ${level.goal} מפלצות`
      : 'המשימה: להביס את מלך הלבה';
    const ids = SPECIES_ORDER.filter((id) => level.monsters[id] || level.waves.some((w) => w.add[id]));
    this.$('brief-monsters').innerHTML = ids.map((id) => `<span class="chip">${SPECIES[id].plural}</span>`).join('');
    this.$('brief-keys').innerHTML = touch
      ? 'אגודל שמאל מטיס, כפתורים מימין: ירי, טיל, טורבו והאטה.'
      : 'חצים או WASD לטיסה · רווח לתותח · F לטיל · Shift לטורבו · C למצלמה · Esc להשהיה';
  }

  // ---------------------------------------------------------------- bestiary
  renderBestiary(seen, selected) {
    this.$('best-list').innerHTML = SPECIES_ORDER.map((id) => {
      const S = SPECIES[id];
      const known = seen[id];
      return `<button class="best-item ${id === selected ? 'active' : ''} ${known ? '' : 'locked'}" data-action="beast" data-id="${id}">
        <span>${S.name}</span><small>${known ? `${formatInt(known)} חוסלו` : 'עוד לא חוסל'}</small></button>`;
    }).join('');
    const S = SPECIES[selected];
    this.$('best-name').textContent = S.name;
    this.$('best-desc').textContent = S.desc;
    const portrait = this.$('best-portrait');
    const url = assetURL('portrait_' + selected);
    portrait.classList.toggle('has', !!url);
    portrait.style.backgroundImage = url ? `url(${url})` : '';
    const danger = { raptor: 0.25, horned: 0.45, longneck: 0.4, rex: 0.8, flyer: 0.65, boss: 1 }[selected] || 0.5;
    const stats = {
      hp: Math.min(1, Math.log10(S.hp) / Math.log10(9000)),
      speed: Math.min(1, S.speed / 75 + (S.flies ? 0 : 0.1)),
      size: Math.min(1, (S.height * S.scale) / 60 + 0.08),
      danger,
    };
    this.$('best-stats').innerHTML = Object.entries(stats).map(([k, v]) =>
      `<span>${STAT_LABELS[k]}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`).join('')
      + `<span>ניקוד</span><b>${formatInt(S.score)}</b>`;
  }

  // ---------------------------------------------------------------- settings
  renderSettings(settings, onChange) {
    const seg = (key, options) => `<div class="seg" data-key="${key}">${options.map(([v, label]) =>
      `<button type="button" data-v="${v}" class="${String(settings[key]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
    const range = (key) => `<input type="range" min="0" max="100" step="1" data-key="${key}" value="${Math.round(settings[key] * 100)}" aria-label="${key}">`;
    const rows = [
      ['איכות גרפיקה', 'נמוכה מתאימה לטלפונים ישנים', seg('quality', Object.entries(QUALITY).map(([k, q]) => [k, q.name]))],
      ['עוצמה כללית', '', range('master')],
      ['מוזיקה', '', range('music')],
      ['אפקטים', '', range('sfx')],
      ['היפוך למעלה ולמטה', 'כמו בסימולטור: למטה מרים את האף', seg('invert', [[false, 'רגיל'], [true, 'הפוך']])],
      ['עזרה בטיסה', 'מיישר את המטוס כשעוזבים את ההגה', seg('assist', [[1, 'פועלת'], [0, 'כבויה']])],
      ['רעידות מסך', '', seg('shake', [[true, 'כן'], [false, 'לא']])],
      ['כפתורי מגע', '', seg('touch', [['auto', 'אוטומטי'], ['on', 'תמיד'], ['off', 'לעולם לא']])],
      ['מונה פריימים', '', seg('fps', [[false, 'מוסתר'], [true, 'מוצג']])],
    ];
    const box = this.$('settings');
    box.innerHTML = rows.map(([label, hint, ctl]) => `<div class="set-row"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label>${ctl}</div>`).join('');
    const parse = (v) => (v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
    for (const s of box.querySelectorAll('.seg')) {
      s.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        for (const x of s.querySelectorAll('button')) x.classList.toggle('on', x === b);
        this.audio.ui('click');
        onChange(s.dataset.key, parse(b.dataset.v));
      });
    }
    for (const r of box.querySelectorAll('input[type=range]')) {
      r.addEventListener('input', () => onChange(r.dataset.key, Number(r.value) / 100));
    }
  }

  // ---------------------------------------------------------------- results
  renderResults(r) {
    this.$('res-kicker').textContent = r.level.name;
    this.$('res-title').textContent = r.win ? 'המשימה הושלמה!' : 'המטוסים אזלו';
    const stars = this.$('res-stars');
    stars.innerHTML = [0, 1, 2].map(() => '<i></i>').join('');
    stars.style.display = r.win ? '' : 'none';
    [...stars.children].forEach((el, i) => {
      if (i < r.stars) { el.classList.add('on'); setTimeout(() => { el.classList.add('show'); this.audio.ui('reload'); }, 450 + i * 320); } else setTimeout(() => el.classList.add('show'), 450 + i * 320);
    });
    this.$('res-score').textContent = formatInt(r.score);
    this.$('res-best').textContent = r.newBest ? 'שיא חדש!' : r.best ? `השיא: ${formatInt(r.best)}` : '';
    const m = Math.floor(r.time / 60), s = Math.floor(r.time % 60);
    const rows = [
      ['מפלצות שחוסלו', formatInt(r.kills)],
      ['זמן', `${m}:${String(s).padStart(2, '0')}`],
      ['דיוק בתותח', `${Math.round(r.accuracy * 100)}%`],
      ['טילים ששוגרו', formatInt(r.missiles)],
      ['רצף הכי ארוך', `x${r.bestCombo}`],
      ['מטוסים שאבדו', formatInt(r.deaths)],
    ];
    this.$('res-grid').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    const next = this.$('res-next');
    next.style.display = r.win && r.hasNext ? '' : 'none';
  }

  toast(text) {
    const t = this.$('toast-global');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
}
