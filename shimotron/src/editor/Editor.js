import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { icon } from './icons.js';
import { PREFAB_CATALOG } from '../engine/world/Prefabs.js';
import { PRESETS, PRESET_ORDER } from '../engine/core/Quality.js';
import { VERSION } from '../engine/Engine.js';

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (v, d = 2) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(d);
const STORAGE_KEY = 'shimotron.scene.v1';
const MODES = [
  { id: 'orbit', label: 'עורך', icon: 'orbit', key: '1' },
  { id: 'fly', label: 'טיסה', icon: 'fly', key: '2' },
  { id: 'walk', label: 'הליכה', icon: 'walk', key: '3' },
  { id: 'cinematic', label: 'קולנועי', icon: 'film', key: '4' },
];
const HINTS = {
  orbit: 'לחיצה בוחרת אובייקט · גרירה מסובבת · גלגלת מקרבת · <kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> כלי הזזה/סיבוב/קנה מידה · <kbd>F</kbd> מיקוד · <kbd>?</kbd> קיצורים',
  fly: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> תנועה · <kbd>Q</kbd><kbd>E</kbd> מטה/מעלה · <kbd>Shift</kbd> מהיר · לחיצה נועלת עכבר · לחיצה נוספת יורה כדור · <kbd>Esc</kbd> שחרור',
  walk: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> הליכה · <kbd>Space</kbd> קפיצה · <kbd>Shift</kbd> ריצה · לחיצה יורה כדור · <kbd>X</kbd> פיצוץ · <kbd>Esc</kbd> שחרור',
  cinematic: 'סיור אוטומטי סביב האי · <kbd>1</kbd> חזרה לעורך',
};

/**
 * The in-browser editor: toolbar, scene hierarchy with prefab palette,
 * inspector (object / environment / graphics / file), selection outline,
 * transform gizmos, stats, save/load, photo mode and touch controls.
 */
export class Editor {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.rig = app.rig;
    this.selected = null;
    this.tab = 'object';
    this.uiHidden = false;
    this.photo = false;
    this._treeDirty = true;
    this._fpsHistory = [];
    this._lastInspectorSync = 0;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.isNarrow = matchMedia('(max-width: 780px)').matches;
  }

  build() {
    const root = document.getElementById('ui');
    root.innerHTML = '';
    this.root = root;
    root.append(this._topbar(), this._hierarchyPanel(), this._inspectorPanel(), this._statusbar(), this._overlays(), this._mobileNav());
    this._gizmo();
    this._bindCanvas();
    this._bindKeys();
    const eng = this.engine;
    eng.events.on('entity:add', () => (this._treeDirty = true));
    eng.events.on('entity:remove', (e) => {
      this._treeDirty = true;
      if (e === this.selected) this.select(null);
    });
    eng.events.on('frame', (s) => this._onFrame(s));
    eng.events.on('camera:mode', (m) => this._onMode(m));
    eng.events.on('quality', () => {
      if (this.tab === 'graphics') this.renderInspector();
    });
    if (this.isNarrow) {
      this.hierarchy.hidden = true;
      this.inspector.hidden = true;
    }
    this._onMode(this.rig.mode);
    this.renderInspector();
  }

  // ------------------------------------------------------------- toolbar

  _topbar() {
    const bar = el(`<header class="topbar" role="toolbar" aria-label="סרגל כלים">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M16 2.5 27.5 9v14L16 29.5 4.5 23V9z"/><path d="M16 9.5 21.8 13v6.6L16 23l-5.8-3.4V13z" fill="currentColor" fill-opacity=".25"/><path d="M16 2.5v7M27.5 9l-5.7 4M27.5 23l-5.7-3.4M16 29.5V23M4.5 23l5.7-3.4M4.5 9l5.7 4"/></svg>
        <span class="brand-name">שימוטרון</span>
        <span class="brand-ver">v${VERSION}</span>
      </div>
      <span class="top-sep"></span>
      <div class="seg" id="modeSeg" role="group" aria-label="מצב מצלמה">
        ${MODES.map((m) => `<button type="button" data-mode="${m.id}" title="${m.label} (${m.key})">${icon(m.icon)}<span class="label">${m.label}</span></button>`).join('')}
      </div>
      <div class="seg small hide-sm" id="gizmoSeg" role="group" aria-label="כלי שינוי">
        <button type="button" data-g="translate" title="הזזה (W)">${icon('move')}</button>
        <button type="button" data-g="rotate" title="סיבוב (E)">${icon('rotate')}</button>
        <button type="button" data-g="scale" title="קנה מידה (R)">${icon('scale')}</button>
      </div>
      <span class="spacer"></span>
      <button class="tbtn" id="btnSim" type="button" title="עצירה/הפעלה של הסימולציה (P)" aria-pressed="false">${icon('pause')}<span class="label">סימולציה</span></button>
      <button class="tbtn" id="btnDayNight" type="button" title="מעבר יום/לילה (T)">${icon('moon')}</button>
      <button class="tbtn hide-sm" id="btnBoom" type="button" title="פיצוץ במרכז המסך (X)">${icon('bomb')}</button>
      <button class="tbtn hide-sm" id="btnPhoto" type="button" title="מצב צילום">${icon('camera')}</button>
      <button class="tbtn" id="btnSound" type="button" title="קול" aria-pressed="true">${icon('sound')}</button>
      <span class="top-sep"></span>
      <button class="tbtn hide-sm" id="btnTree" type="button" title="היררכיה" aria-pressed="true">${icon('layers')}</button>
      <button class="tbtn hide-sm" id="btnInspector" type="button" title="מאפיינים" aria-pressed="true">${icon('sliders')}</button>
      <button class="tbtn hide-sm" id="btnFull" type="button" title="מסך מלא">${icon('expand')}</button>
      <button class="tbtn" id="btnHelp" type="button" title="קיצורי מקלדת (?)">${icon('help')}</button>
    </header>`);
    bar.querySelector('#modeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.setMode(b.dataset.mode);
    });
    bar.querySelector('#gizmoSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.setGizmoMode(b.dataset.g);
    });
    bar.querySelector('#btnSim').addEventListener('click', () => this.toggleSim());
    bar.querySelector('#btnDayNight').addEventListener('click', () => this.toggleDayNight());
    bar.querySelector('#btnBoom').addEventListener('click', () => this.app.showcase.explode());
    bar.querySelector('#btnPhoto').addEventListener('click', () => this.setPhoto(!this.photo));
    bar.querySelector('#btnSound').addEventListener('click', (e) => {
      const a = this.engine.audio;
      const on = !(a.enabled && a.ctx);
      a.setEnabled(on);
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.innerHTML = icon(on ? 'sound' : 'mute');
      this.toast(on ? 'הקול הופעל' : 'הקול הושתק', on ? 'sound' : 'mute');
    });
    bar.querySelector('#btnTree').addEventListener('click', () => this.togglePanel('tree'));
    bar.querySelector('#btnInspector').addEventListener('click', () => this.togglePanel('inspector'));
    bar.querySelector('#btnFull').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => this.toast('מסך מלא אינו זמין כאן', 'expand'));
    });
    bar.querySelector('#btnHelp').addEventListener('click', () => this.showHelp());
    this.topbar = bar;
    return bar;
  }

  setMode(mode) {
    this.rig.setMode(mode);
  }

  _onMode(mode) {
    for (const b of this.topbar.querySelectorAll('#modeSeg button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    this.topbar.querySelector('#gizmoSeg').style.visibility = mode === 'orbit' ? 'visible' : 'hidden';
    if (mode !== 'orbit') this.gizmo?.detach();
    else if (this.selected && this.gizmo) this._attachGizmo();
    const play = mode === 'walk' || mode === 'fly';
    this.crosshair.hidden = !play || this.photo;
    this.lockHint.hidden = !play || this.engine.input.locked || this.isTouch;
    this.sticks.hidden = !(play && this.isTouch);
    if (this.mobileNav) this.mobileNav.classList.toggle('in-play', play);
    this.statusHint.innerHTML = HINTS[mode] || '';
    if (mode === 'cinematic' && !this.photo) this.toast('סיור קולנועי — לחצו 1 לחזרה לעורך', 'film');
  }

  setGizmoMode(m) {
    this.gizmoMode = m;
    this.gizmo.setMode(m);
    for (const b of this.topbar.querySelectorAll('#gizmoSeg button')) b.setAttribute('aria-pressed', String(b.dataset.g === m));
  }

  toggleSim(force) {
    const eng = this.engine;
    eng.paused = force !== undefined ? !force : !eng.paused;
    const b = this.topbar.querySelector('#btnSim');
    b.setAttribute('aria-pressed', String(eng.paused));
    b.innerHTML = `${icon(eng.paused ? 'play' : 'pause')}<span class="label">${eng.paused ? 'הפעל' : 'סימולציה'}</span>`;
    this.toast(eng.paused ? 'הסימולציה הוקפאה' : 'הסימולציה רצה', eng.paused ? 'pause' : 'play');
  }

  toggleDayNight() {
    const atm = this.engine.atmosphere;
    const night = atm.nightFactor > 0.5;
    this.animateTime(night ? 16.6 : 21.4);
  }

  animateTime(target) {
    const atm = this.engine.atmosphere;
    const from = atm.timeOfDay;
    let to = target;
    if (to < from) to += 24;
    const start = performance.now();
    const dur = 2600;
    cancelAnimationFrame(this._timeAnim);
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      atm.setTime(from + (to - from) * e, false);
      atm.forceAdapt = true;
      if (k < 1) this._timeAnim = requestAnimationFrame(step);
      if (this.tab === 'environment') this._syncEnvironment();
    };
    step();
    this.topbar.querySelector('#btnDayNight').innerHTML = icon(target > 19 || target < 5 ? 'sun' : 'moon');
  }

  togglePanel(which, force) {
    const p = which === 'tree' ? this.hierarchy : this.inspector;
    const show = force !== undefined ? force : p.hidden;
    if (this.isNarrow && show) {
      this.hierarchy.hidden = true;
      this.inspector.hidden = true;
    }
    p.hidden = !show;
    this.topbar.querySelector(which === 'tree' ? '#btnTree' : '#btnInspector').setAttribute('aria-pressed', String(show));
    for (const b of this.root.querySelectorAll('.mobile-nav button')) b.setAttribute('aria-pressed', String(!document.getElementById(b.dataset.panel === 'tree' ? 'panelTree' : 'panelInspector').hidden));
  }

  // ---------------------------------------------------------- hierarchy

  _hierarchyPanel() {
    const byGroup = {};
    for (const p of PREFAB_CATALOG) (byGroup[p.group] ||= []).push(p);
    const panel = el(`<aside class="panel start" id="panelTree" aria-label="היררכיית סצנה">
      <div class="panel-head">${icon('layers')}<span class="panel-title">סצנה</span><span class="spacer"></span><span class="panel-sub" id="entityCount"></span></div>
      <div class="palette" role="group" aria-label="הוספת אובייקטים">
        ${PREFAB_CATALOG.map((p) => `<button type="button" data-kind="${p.kind}" title="הוספת ${p.label}">${icon(p.icon)}<span>${p.label}</span></button>`).join('')}
      </div>
      <label class="search">${icon('search')}<input id="treeSearch" type="search" placeholder="חיפוש בסצנה…" autocomplete="off"></label>
      <div class="panel-body" id="tree"></div>
    </aside>`);
    panel.querySelector('.palette').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.spawnInFront(b.dataset.kind);
    });
    panel.querySelector('#treeSearch').addEventListener('input', () => this.renderTree());
    const tree = panel.querySelector('#tree');
    tree.addEventListener('click', (e) => {
      const vis = e.target.closest('.vis');
      const row = e.target.closest('.row');
      if (!row) return;
      const ent = this.engine.entities.find((x) => x.id === Number(row.dataset.id));
      if (!ent) return;
      if (vis) {
        ent.object3D.visible = !ent.object3D.visible;
        this._treeDirty = true;
        return;
      }
      this.select(ent);
    });
    tree.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.row');
      if (row) this.focusSelected();
    });
    this.hierarchy = panel;
    this.treeEl = tree;
    return panel;
  }

  renderTree() {
    this._treeDirty = false;
    const q = (this.hierarchy.querySelector('#treeSearch').value || '').trim();
    const groups = new Map();
    for (const e of this.engine.entities) {
      if (!e.selectable) continue;
      if (q && !e.name.includes(q)) continue;
      const g = e.group || 'אובייקטים';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(e);
    }
    const open = this._openGroups || (this._openGroups = new Set(['ליבת שימוטרון', 'אובייקטים', 'גלריית חומרים', 'מדורה']));
    const html = [...groups.entries()]
      .map(([g, list]) => {
        const isOpen = q || open.has(g);
        return `<details class="tree-group" data-group="${esc(g)}" ${isOpen ? 'open' : ''}><summary>${esc(g)}<span class="count">${list.length}</span></summary>
        ${list
          .map((e) => {
            const dyn = e.body && e.body.mass > 0;
            return `<div class="row ${e === this.selected ? 'selected' : ''}" data-id="${e.id}" role="button" tabindex="0">${icon(e.icon)}<span class="name">${esc(e.name)}</span>${dyn ? '<span class="chip dyn">RB</span>' : ''}<button class="vis ${e.object3D.visible ? '' : 'off'}" type="button" title="הצג/הסתר">${icon(e.object3D.visible ? 'eye' : 'eyeOff')}</button></div>`;
          })
          .join('')}</details>`;
      })
      .join('');
    this.treeEl.innerHTML = html || `<div class="empty">${icon('search')}לא נמצאו אובייקטים</div>`;
    for (const d of this.treeEl.querySelectorAll('details')) {
      d.addEventListener('toggle', () => {
        if (q) return;
        if (d.open) open.add(d.dataset.group);
        else open.delete(d.dataset.group);
      });
    }
    this.hierarchy.querySelector('#entityCount').textContent = `${this.engine.entities.length}`;
  }

  spawnInFront(kind) {
    const eng = this.engine;
    const cam = eng.camera;
    const hit = eng.pick({ x: 0, y: 0 }, { any: true, far: 60 });
    let pos;
    if (hit && hit.distance < 60) pos = hit.point.clone().add(new THREE.Vector3(0, kind === 'lamp' || kind === 'fire' || kind === 'rock' || kind === 'pillar' ? 0 : 1.5, 0));
    else {
      const d = new THREE.Vector3();
      cam.getWorldDirection(d);
      pos = cam.position.clone().addScaledVector(d, 10);
      pos.y = Math.max(pos.y, this.app.world.terrain.heightAt(pos.x, pos.z) + 1.5);
    }
    const params = { position: pos.toArray() };
    if (kind === 'lamp' || kind === 'fire' || kind === 'rock' || kind === 'pillar') params.position[1] = Math.max(this.app.world.terrain.heightAt(pos.x, pos.z), hit ? hit.point.y : 0);
    if (kind === 'cube') params.color = new THREE.Color().setHSL(Math.random(), 0.6, 0.52).getStyle();
    if (kind === 'ball') params.color = new THREE.Color().setHSL(Math.random(), 0.7, 0.55).getStyle();
    const e = eng.spawn(kind, params);
    e.group = 'אובייקטים';
    if (kind === 'fire' && eng.audio.ctx && !e.sound) e.sound = eng.audio.addFire(e.object3D.position);
    eng.audio.ui('spawn');
    this.select(e);
    this.toast(`נוסף: ${e.name}`, 'plus');
    return e;
  }

  // ------------------------------------------------------------ selection

  select(entity) {
    if (this.selected === entity) return;
    this.selected = entity;
    this.engine.pipeline.selection = entity ? [entity.object3D] : [];
    if (entity && this.rig.mode === 'orbit') this._attachGizmo();
    else this.gizmo.detach();
    this._treeDirty = true;
    if (entity && this._openGroups) this._openGroups.add(entity.group || 'אובייקטים');
    if (entity) this.tab = 'object';
    this.renderInspector();
    if (entity) {
      if (!this.hierarchy.hidden) this.renderTree();
      const row = this.treeEl.querySelector(`.row[data-id="${entity.id}"]`);
      row?.scrollIntoView({ block: 'nearest' });
    }
  }

  _attachGizmo() {
    const e = this.selected;
    if (!e) return;
    this.gizmo.attach(e.object3D);
    // Locked scenery and static bodies can still move; only the plaza stays put.
    this.gizmo.enabled = !e.locked || e.name !== 'רחבת האבן';
    this.gizmo.getHelper().visible = this.gizmo.enabled;
  }

  _gizmo() {
    const eng = this.engine;
    const g = new TransformControls(eng.camera, eng.canvas);
    g.setSize(0.85);
    this.gizmo = g;
    eng.pipeline.overlay.add(g.getHelper());
    this.setGizmoMode('translate');
    let startScale = new THREE.Vector3();
    g.addEventListener('dragging-changed', (ev) => {
      this.rig.orbit.enabled = !ev.value && this.rig.mode === 'orbit';
      const e = this.selected;
      if (!e) return;
      e.dragging = ev.value;
      if (ev.value) startScale.copy(e.object3D.scale);
      else {
        if (e.body) {
          if (!startScale.equals(e.object3D.scale)) eng.physics.rebuildBody(e);
          else e.syncBodyFromObject();
        }
        this.renderInspector();
      }
    });
    g.addEventListener('objectChange', () => {
      const e = this.selected;
      if (e && e.body) e.syncBodyFromObject();
      this._syncTransformFields();
    });
  }

  focusSelected() {
    const e = this.selected;
    if (!e) return;
    const box = new THREE.Box3().setFromObject(e.object3D);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.rig.frame(c, Math.max(3, Math.min(60, size * 1.6)));
  }

  deleteSelected() {
    const e = this.selected;
    if (!e) return;
    if (e.locked) {
      this.toast('אובייקט זה נעול ואינו ניתן למחיקה', 'eyeOff');
      return;
    }
    this.select(null);
    this.engine.remove(e);
    this.engine.audio.ui('delete');
    this.toast(`נמחק: ${e.name}`, 'trash');
  }

  duplicateSelected() {
    const e = this.selected;
    if (!e || !e.kind) {
      this.toast('ניתן לשכפל רק אובייקטים מהפלטה', 'copy');
      return;
    }
    const data = this._serializeEntity(e);
    data.position[0] += 1.5;
    data.position[1] += 0.5;
    const c = this._spawnFromData(data);
    c.group = 'אובייקטים';
    this.select(c);
    this.engine.audio.ui('spawn');
  }

  // ------------------------------------------------------------ canvas

  _bindCanvas() {
    const eng = this.engine;
    const cv = eng.canvas;
    let down = null;
    cv.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button };
      eng.audio.unlock();
    });
    cv.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      const button = down.b;
      down = null;
      if (moved > 5 || !quick || button !== 0) return;
      const mode = this.rig.mode;
      if (this.photo) {
        const r = cv.getBoundingClientRect();
        const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
        const hit = eng.pick(ndc, { any: true });
        if (hit) {
          eng.pipeline.params.dofFocus = hit.distance;
          this.toast(`מיקוד: ${hit.distance.toFixed(1)} מ׳`, 'aperture');
        }
        return;
      }
      if (mode === 'orbit') {
        if (this.gizmo.dragging || this.gizmo.axis) return;
        const r = cv.getBoundingClientRect();
        const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
        const hit = eng.pick(ndc);
        this.select(hit && hit.entity && hit.entity.selectable ? hit.entity : null);
      } else if (mode === 'walk' || mode === 'fly') {
        if (this.isTouch) this.app.showcase.shoot();
        else if (!eng.input.locked) eng.input.requestLock();
        else this.app.showcase.shoot();
      }
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const play = this.rig.mode === 'walk' || this.rig.mode === 'fly';
      this.lockHint.hidden = !play || eng.input.locked || this.isTouch;
    });
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const mode = this.rig.mode;
      const k = e.code;
      if (e.key === '?' || (k === 'Slash' && e.shiftKey)) return this.showHelp();
      if (k === 'Escape') {
        if (this.modal) return this.closeModal();
        if (this.photo) return this.setPhoto(false);
        if (mode === 'orbit') this.select(null);
        return;
      }
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(k)) return this.setMode(MODES[Number(k.slice(-1)) - 1].id);
      if (k === 'KeyP') return this.toggleSim();
      if (k === 'KeyT') return this.toggleDayNight();
      if (k === 'KeyH') return this.setUIHidden(!this.uiHidden);
      if (k === 'KeyX') return this.app.showcase.explode();
      if (k === 'F2') {
        e.preventDefault();
        return this.screenshot();
      }
      if (mode === 'orbit') {
        if (k === 'KeyW') return this.setGizmoMode('translate');
        if (k === 'KeyE') return this.setGizmoMode('rotate');
        if (k === 'KeyR') return this.setGizmoMode('scale');
        if (k === 'KeyF') return this.focusSelected();
        if (k === 'Delete' || k === 'Backspace') return this.deleteSelected();
        if (k === 'KeyD' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          return this.duplicateSelected();
        }
        if (k === 'KeyB') return this.spawnInFront('ball');
      } else if ((mode === 'walk' || mode === 'fly') && k === 'KeyF') this.app.showcase.shoot();
    });
  }

  setUIHidden(h) {
    this.uiHidden = h;
    for (const n of [this.topbar, this.hierarchy, this.inspector, this.statusbar, this.mobileNav]) {
      if (!n) continue;
      if (h) {
        n.dataset.wasHidden = n.hidden ? '1' : '';
        n.hidden = true;
      } else n.hidden = n.dataset.wasHidden === '1';
    }
    if (h) this.toast('הממשק הוסתר — H להצגה', 'eyeOff');
  }

  setPhoto(on) {
    this.photo = on;
    const p = this.engine.pipeline.params;
    if (on) {
      this._photoPrev = { dof: p.dofEnabled };
      p.dofEnabled = true;
      const hit = this.engine.pick({ x: 0, y: 0 }, { any: true });
      if (hit) p.dofFocus = hit.distance;
      this.setUIHidden(true);
      this.photoBar.hidden = false;
      this.select(null);
    } else {
      p.dofEnabled = this._photoPrev ? this._photoPrev.dof : false;
      this.photoBar.hidden = true;
      this.setUIHidden(false);
    }
    this._onMode(this.rig.mode);
  }

  // ---------------------------------------------------------- inspector

  _inspectorPanel() {
    const panel = el(`<aside class="panel end" id="panelInspector" aria-label="מאפיינים">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-tab="object">${icon('cube')}אובייקט</button>
        <button type="button" role="tab" data-tab="environment">${icon('sun')}סביבה</button>
        <button type="button" role="tab" data-tab="graphics">${icon('gauge')}גרפיקה</button>
        <button type="button" role="tab" data-tab="file">${icon('save')}קובץ</button>
      </div>
      <div class="panel-body" id="inspectorBody"></div>
    </aside>`);
    panel.querySelector('.tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.renderInspector();
    });
    this.inspector = panel;
    this.body = panel.querySelector('#inspectorBody');
    return panel;
  }

  renderInspector() {
    for (const b of this.inspector.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === this.tab));
    const body = this.body;
    body.innerHTML = '';
    if (this.tab === 'object') this._objectTab(body);
    else if (this.tab === 'environment') this._environmentTab(body);
    else if (this.tab === 'graphics') this._graphicsTab(body);
    else this._fileTab(body);
  }

  // Control builders -----------------------------------------------------

  _section(parent, title, ic) {
    const s = el(`<div class="section"><h4>${ic ? icon(ic) : ''}${title}</h4></div>`);
    parent.append(s);
    return s;
  }

  _slider(parent, label, { min, max, step, get, set, format = (v) => fmt(v, 2), id }) {
    const uid = id || `r${Math.random().toString(36).slice(2, 8)}`;
    const f = el(`<div class="field"><label for="${uid}">${label}</label><div class="range"><input id="${uid}" type="range" min="${min}" max="${max}" step="${step}"><output></output></div></div>`);
    const input = f.querySelector('input');
    const out = f.querySelector('output');
    const paint = () => {
      const v = Number(input.value);
      input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
      out.textContent = format(v);
    };
    input.value = get();
    paint();
    input.addEventListener('input', () => {
      set(Number(input.value));
      paint();
    });
    f.sync = () => {
      if (document.activeElement === input) return;
      input.value = get();
      paint();
    };
    parent.append(f);
    return f;
  }

  _toggle(parent, label, { get, set, id }) {
    const uid = id || `t${Math.random().toString(36).slice(2, 8)}`;
    const f = el(`<div class="toggle-row"><label for="${uid}">${label}</label><span class="switch"><input id="${uid}" type="checkbox" role="switch"><i></i></span></div>`);
    const input = f.querySelector('input');
    input.checked = !!get();
    input.addEventListener('change', () => set(input.checked));
    parent.append(f);
    return f;
  }

  _select(parent, label, { options, get, set, id }) {
    const uid = id || `s${Math.random().toString(36).slice(2, 8)}`;
    const f = el(`<div class="field"><label for="${uid}">${label}</label><select class="sel" id="${uid}">${options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>`);
    const s = f.querySelector('select');
    s.value = get();
    s.addEventListener('change', () => set(s.value));
    parent.append(f);
    return f;
  }

  _color(parent, label, { get, set, id }) {
    const uid = id || `c${Math.random().toString(36).slice(2, 8)}`;
    const f = el(`<div class="field"><label for="${uid}">${label}</label><div class="color-in"><input id="${uid}" type="color"><code></code></div></div>`);
    const input = f.querySelector('input');
    const code = f.querySelector('code');
    input.value = get();
    code.textContent = input.value;
    input.addEventListener('input', () => {
      set(input.value);
      code.textContent = input.value;
    });
    parent.append(f);
    return f;
  }

  _seg(parent, label, { options, get, set }) {
    const f = el(`<div class="field ${label ? '' : 'wide'}">${label ? `<label>${label}</label>` : ''}<div class="seg small" role="group">${options
      .map(([v, t]) => `<button type="button" data-v="${esc(v)}">${t}</button>`)
      .join('')}</div></div>`);
    const paint = () => {
      for (const b of f.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === String(get())));
    };
    f.querySelector('.seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      set(b.dataset.v);
      paint();
    });
    paint();
    f.sync = paint;
    parent.append(f);
    return f;
  }

  _vec(parent, label, { get, set, step = 0.1, digits = 2 }) {
    const f = el(`<div class="field"><label>${label}</label><div class="vec">${['x', 'y', 'z']
      .map((a) => `<div class="num"><span class="${a}">${a.toUpperCase()}</span><input type="text" inputmode="decimal" data-a="${a}" aria-label="${label} ${a}"></div>`)
      .join('')}</div></div>`);
    const inputs = [...f.querySelectorAll('input')];
    const write = () => {
      const v = get();
      inputs.forEach((inp, i) => {
        if (document.activeElement !== inp) inp.value = fmt(v[i], digits);
      });
    };
    const commit = () => {
      const vals = inputs.map((i) => Number(i.value));
      if (vals.some((v) => !Number.isFinite(v))) return write();
      set(vals);
    };
    inputs.forEach((inp) => {
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') inp.blur();
      });
    });
    // Drag the axis letter to scrub the value.
    f.querySelectorAll('.num span').forEach((span, i) => {
      span.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        span.setPointerCapture(e.pointerId);
        const start = e.clientX;
        const base = get();
        const move = (ev) => {
          const v = [...base];
          v[i] = base[i] + (ev.clientX - start) * step * (ev.shiftKey ? 10 : 1) * (document.dir === 'rtl' ? 1 : 1);
          set(v);
          write();
        };
        const up = () => {
          span.removeEventListener('pointermove', move);
          span.removeEventListener('pointerup', up);
          if (this.selected?.body) this.selected.syncBodyFromObject();
        };
        span.addEventListener('pointermove', move);
        span.addEventListener('pointerup', up);
      });
    });
    write();
    f.sync = write;
    parent.append(f);
    return f;
  }

  _buttons(parent, list) {
    const row = el('<div class="btn-row"></div>');
    for (const [label, ic, fn, cls = '', disabled = false] of list) {
      const b = el(`<button type="button" class="btn ${cls}" ${disabled ? 'disabled' : ''}>${ic ? icon(ic) : ''}${label}</button>`);
      b.addEventListener('click', fn);
      row.append(b);
    }
    parent.append(row);
    return row;
  }

  // Object tab ---------------------------------------------------------

  _objectTab(body) {
    const e = this.selected;
    this._liveFields = [];
    if (!e) {
      body.append(
        el(`<div class="empty">${icon('target')}<div>לא נבחר אובייקט.<br>לחצו על אובייקט בסצנה או ברשימה,<br>או הוסיפו אחד מהפלטה.</div></div>`),
      );
      const s = this._section(body, 'טיפ', 'bolt');
      s.append(el(`<p class="hint">עברו למצב <b>הליכה</b> (<kbd>3</kbd>), לחצו על המסך — ואז כל לחיצה יורה כדור פיזיקלי. <kbd>X</kbd> מפעיל פיצוץ בנקודה שבמרכז המסך.</p>`));
      return;
    }
    const o = e.object3D;
    const head = el(`<div class="section"><div class="field wide"><input class="text-in" id="entName" value="${esc(e.name)}" aria-label="שם האובייקט"></div>
      <div class="btn-row" style="margin-top:2px">${e.body ? (e.body.mass > 0 ? '<span class="badge dyn">גוף דינמי</span>' : '<span class="badge">גוף סטטי</span>') : '<span class="badge">ללא פיזיקה</span>'}${
        e.locked ? '<span class="badge lock">נעול</span>' : ''
      }${e.kind ? `<span class="badge">${esc(PREFAB_CATALOG.find((p) => p.kind === e.kind)?.label || e.kind)}</span>` : ''}</div></div>`);
    head.querySelector('#entName').addEventListener('change', (ev) => {
      e.name = ev.target.value.trim() || e.name;
      this._treeDirty = true;
    });
    body.append(head);

    const tr = this._section(body, 'מיקום וסיבוב', 'move');
    const applyTransform = () => {
      o.updateMatrixWorld();
      if (e.body) e.syncBodyFromObject();
    };
    this._liveFields.push(
      this._vec(tr, 'מיקום', {
        get: () => o.position.toArray(),
        set: (v) => {
          o.position.fromArray(v);
          applyTransform();
        },
      }),
      this._vec(tr, 'סיבוב °', {
        step: 1,
        digits: 1,
        get: () => [o.rotation.x, o.rotation.y, o.rotation.z].map((r) => THREE.MathUtils.radToDeg(r)),
        set: (v) => {
          o.rotation.set(...v.map((d) => THREE.MathUtils.degToRad(d)));
          applyTransform();
        },
      }),
      this._vec(tr, 'קנה מידה', {
        step: 0.01,
        get: () => o.scale.toArray(),
        set: (v) => {
          o.scale.fromArray(v.map((x) => Math.max(0.01, x)));
          o.updateMatrixWorld();
          if (e.body) this.engine.physics.rebuildBody(e);
        },
      }),
    );

    // Material editing for single-material meshes.
    const mesh = o.isMesh ? o : null;
    const gm = e.galleryMaterial ? this.engine.materials.lib[e.galleryMaterial] : null;
    const mat = gm || (mesh && !Array.isArray(mesh.material) ? mesh.material : null);
    if (mat && mat.isMeshStandardMaterial) {
      const ms = this._section(body, gm ? 'חומר (ספרייה משותפת)' : 'חומר', 'sphere');
      if (!gm && mat.userData.libKey) {
        const keys = ['plastic', 'ceramic', 'gold', 'chrome', 'copper', 'carPaint', 'glass', 'velvet', 'pearl', 'rubber', 'panels', 'marble'];
        this._select(ms, 'הגדרה', {
          options: keys.map((k) => [k, this.engine.materials.lib[k].name]),
          get: () => mat.userData.libKey,
          set: (k) => {
            const next = this.engine.materials.lib[k].clone();
            next.userData.libKey = k;
            if (k === 'plastic' || k === 'ceramic' || k === 'carPaint') next.color.copy(mat.color);
            mesh.material = next;
            this.renderInspector();
          },
        });
      }
      if (!mat.map || mat.userData.libKey) this._color(ms, 'צבע', { get: () => '#' + mat.color.getHexString(), set: (v) => mat.color.set(v) });
      this._slider(ms, 'חספוס', { min: 0, max: 1, step: 0.01, get: () => mat.roughness, set: (v) => (mat.roughness = v) });
      this._slider(ms, 'מתכתיות', { min: 0, max: 1, step: 0.01, get: () => mat.metalness, set: (v) => (mat.metalness = v) });
      if (mat.isMeshPhysicalMaterial) {
        this._slider(ms, 'ציפוי שקוף', { min: 0, max: 1, step: 0.01, get: () => mat.clearcoat, set: (v) => (mat.clearcoat = v) });
        if (mat.transmission > 0) this._slider(ms, 'שקיפות', { min: 0, max: 1, step: 0.01, get: () => mat.transmission, set: (v) => (mat.transmission = v) });
        if (mat.iridescence > 0 || gm) this._slider(ms, 'קשתיות', { min: 0, max: 1, step: 0.01, get: () => mat.iridescence, set: (v) => (mat.iridescence = v) });
      }
      this._color(ms, 'פליטת אור', { get: () => '#' + mat.emissive.getHexString(), set: (v) => mat.emissive.set(v) });
      const tracked = this.engine.materials.emissive.find((x) => x.material === mat);
      this._slider(ms, 'עוצמת פליטה', {
        min: 0,
        max: 10,
        step: 0.05,
        get: () => (tracked ? tracked.base : mat.emissiveIntensity),
        set: (v) => {
          if (tracked) tracked.base = v;
          else this.engine.materials.trackEmissive(mat, v);
        },
      });
    }

    if (e.light) {
      const ls = this._section(body, 'אור', 'orb');
      const comp = e.components.find((c) => 'base' in c && c.light === e.light);
      this._color(ls, 'צבע', { get: () => '#' + e.light.color.getHexString(), set: (v) => e.light.color.set(v) });
      if (comp) this._slider(ls, 'עוצמה', { min: 0, max: 30, step: 0.1, get: () => comp.base, set: (v) => (comp.base = v) });
      this._slider(ls, 'טווח (מ׳)', { min: 2, max: 60, step: 0.5, get: () => e.light.distance, set: (v) => (e.light.distance = v) });
    }

    if (e.body) {
      const ps = this._section(body, 'פיזיקה', 'bolt');
      const dyn = e.body.mass > 0;
      if (e.kind) {
        this._toggle(ps, 'גוף דינמי (נופל ומתנגש)', {
          get: () => e.body.mass > 0,
          set: (v) => {
            e.params.dynamic = v;
            const desc = { ...e.bodyDesc, mass: v ? e.params.mass || 2 : 0 };
            e.bodyDesc = desc;
            this.engine.physics.rebuildBody(e);
            this._treeDirty = true;
            this.renderInspector();
          },
        });
      }
      if (dyn) {
        this._slider(ps, 'מסה (ק״ג)', {
          min: 0.1,
          max: 50,
          step: 0.1,
          get: () => e.body.mass,
          set: (v) => {
            e.body.mass = v;
            e.body.updateMassProperties();
            if (e.params) e.params.mass = v;
          },
        });
        this._buttons(ps, [
          [
            'הקפצה',
            'bolt',
            () => {
              e.body.wakeUp();
              e.body.velocity.y += 7;
              e.body.angularVelocity.set(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2);
            },
          ],
          [
            'עצירה',
            'pause',
            () => {
              e.body.velocity.set(0, 0, 0);
              e.body.angularVelocity.set(0, 0, 0);
            },
          ],
        ]);
      }
    }

    const comps = e.components.map((c) => c.constructor && c.constructor.name).filter((n) => n && n !== 'Object');
    if (comps.length) {
      const cs = this._section(body, 'רכיבים', 'grid');
      cs.append(el(`<div class="btn-row">${comps.map((n) => `<span class="badge">${esc(n)}</span>`).join('')}</div>`));
    }

    const act = this._section(body, 'פעולות', 'target');
    this._buttons(act, [
      ['מיקוד', 'focus', () => this.focusSelected()],
      ['שכפול', 'copy', () => this.duplicateSelected(), '', !e.kind],
      ['מחיקה', 'trash', () => this.deleteSelected(), 'danger', e.locked],
    ]);
  }

  _syncTransformFields() {
    if (this.tab !== 'object' || !this._liveFields) return;
    for (const f of this._liveFields) f.sync && f.sync();
  }

  // Environment tab ----------------------------------------------------

  _environmentTab(body) {
    const eng = this.engine;
    const atm = eng.atmosphere;
    const w = this.app.world;
    this._envFields = [];
    const clock = this._section(body, 'שעה ביום', 'sun');
    const time = el(`<div class="field wide"><div style="display:flex;align-items:baseline;gap:10px"><span class="clock" id="clock"></span><span class="hint" id="clockPhase"></span></div><div class="sky-strip" aria-hidden="true"></div></div>`);
    clock.append(time);
    this._envFields.push(
      this._slider(clock, 'שעה', { min: 0, max: 24, step: 0.05, get: () => atm.timeOfDay, set: (v) => atm.setTime(v), format: (v) => this._hhmm(v) }),
    );
    this._seg(clock, 'מהירות יום', {
      options: [
        ['0', 'עצור'],
        ['0.05', 'איטי'],
        ['0.3', 'רגיל'],
        ['1.5', 'מהיר'],
      ],
      get: () => String(atm.daySpeed),
      set: (v) => (atm.daySpeed = Number(v)),
    });
    this._buttons(clock, [
      ['זריחה', 'sun', () => this.animateTime(6.4)],
      ['צהריים', 'sun', () => this.animateTime(12.5)],
      ['שקיעה', 'sun', () => this.animateTime(18.05)],
      ['לילה', 'moon', () => this.animateTime(22.5)],
    ]);
    this._slider(clock, 'כיוון השמש', { min: -3.14, max: 3.14, step: 0.01, get: () => atm.sunAzimuth, set: (v) => ((atm.sunAzimuth = v), (atm.forceAdapt = true)), format: (v) => `${Math.round(THREE.MathUtils.radToDeg(v))}°` });

    const sky = this._section(body, 'שמיים ואוויר', 'cloud');
    this._slider(sky, 'עננות', { min: 0, max: 1, step: 0.01, get: () => atm.cloudCoverage, set: (v) => (atm.cloudCoverage = v) });
    this._slider(sky, 'צפיפות עננים', { min: 0, max: 1, step: 0.01, get: () => atm.cloudDensity, set: (v) => (atm.cloudDensity = v) });
    this._slider(sky, 'ערפל', { min: 0, max: 0.008, step: 0.0001, get: () => atm.fogDensity, set: (v) => (atm.fogDensity = v), format: (v) => (v * 1000).toFixed(1) });
    this._slider(sky, 'אובך', { min: 1, max: 12, step: 0.1, get: () => atm.model.turbidity, set: (v) => ((atm.model.turbidity = v), (atm._envDirty = true)) });
    this._slider(sky, 'פיזור ריילי', { min: 0.2, max: 4, step: 0.05, get: () => atm.model.rayleigh, set: (v) => ((atm.model.rayleigh = v), (atm._envDirty = true)) });
    this._slider(sky, 'חשיפה (EV)', { min: -2.5, max: 2.5, step: 0.1, get: () => atm.exposureBias, set: (v) => (atm.exposureBias = v), format: (v) => (v > 0 ? '+' : '') + v.toFixed(1) });

    const nat = this._section(body, 'רוח וים', 'wind');
    this._slider(nat, 'רוח', { min: 0, max: 2.5, step: 0.05, get: () => atm.wind.strength, set: (v) => (atm.wind.strength = v) });
    this._slider(nat, 'כיוון רוח', {
      min: -3.14,
      max: 3.14,
      step: 0.01,
      get: () => Math.atan2(atm.wind.dir.y, atm.wind.dir.x),
      set: (v) => atm.wind.dir.set(Math.cos(v), Math.sin(v)),
      format: (v) => `${Math.round(THREE.MathUtils.radToDeg(v))}°`,
    });
    this._slider(nat, 'גלים', { min: 0, max: 2.5, step: 0.05, get: () => w.water.waveAmp, set: (v) => (w.water.waveAmp = v) });
    this._slider(nat, 'כבידה', { min: 0, max: 20, step: 0.1, get: () => -eng.physics.world.gravity.y, set: (v) => eng.physics.world.gravity.set(0, -v, 0), format: (v) => `${v.toFixed(1)}` });
    this._slider(nat, 'מהירות זמן', { min: 0.05, max: 2, step: 0.05, get: () => eng.physics.timeScale, set: (v) => (eng.physics.timeScale = v), format: (v) => `×${v.toFixed(2)}` });
    this._syncEnvironment();
  }

  _hhmm(v) {
    const h = Math.floor(v) % 24;
    const m = Math.floor((v - Math.floor(v)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  _syncEnvironment() {
    if (this.tab !== 'environment') return;
    const atm = this.engine.atmosphere;
    const c = this.body.querySelector('#clock');
    if (c) c.textContent = this._hhmm(atm.timeOfDay);
    const ph = this.body.querySelector('#clockPhase');
    if (ph) {
      const t = atm.timeOfDay;
      ph.textContent = atm.nightFactor > 0.6 ? 'לילה' : t < 8 ? 'בוקר' : t < 16 ? 'יום' : t < 19.5 ? 'שעת זהב' : 'בין ערביים';
    }
    for (const f of this._envFields || []) f.sync && f.sync();
  }

  // Graphics tab -------------------------------------------------------

  _graphicsTab(body) {
    const eng = this.engine;
    const q = eng.quality;
    const p = eng.pipeline.params;
    const pre = this._section(body, 'רמת איכות', 'gauge');
    this._seg(pre, '', {
      options: PRESET_ORDER.map((k) => [k, PRESETS[k].label]),
      get: () => q.presetName,
      set: (v) => {
        q.setPreset(v);
        this.toast(`איכות: ${PRESETS[v].label}`, 'gauge');
      },
    });
    this._toggle(pre, 'רזולוציה דינמית (שומר על 60fps)', { get: () => q.dynamicResolution, set: (v) => (q.dynamicResolution = v) });
    pre.append(el(`<p class="hint" id="gpuInfo"></p>`));

    const fx = this._section(body, 'אפקטים', 'sliders');
    const s = q.settings;
    this._toggle(fx, 'הצללה סביבתית (GTAO)', { get: () => s.ao, set: (v) => q.set('ao', v) });
    this._toggle(fx, 'קרני אור (God rays)', { get: () => s.godRays, set: (v) => q.set('godRays', v) });
    this._toggle(fx, 'זוהר (Bloom)', { get: () => s.bloom, set: (v) => q.set('bloom', v) });
    this._toggle(fx, 'צללים', { get: () => s.shadows, set: (v) => q.set('shadows', v) });
    this._toggle(fx, 'החלקת קצוות FXAA', { get: () => s.fxaa, set: (v) => q.set('fxaa', v) });
    this._toggle(fx, 'עומק שדה (DOF)', { get: () => p.dofEnabled, set: (v) => (p.dofEnabled = v) });
    if (p.dofEnabled) {
      this._slider(fx, 'מרחק מיקוד', { min: 0.5, max: 120, step: 0.1, get: () => p.dofFocus, set: (v) => (p.dofFocus = v), format: (v) => `${v.toFixed(1)}מ׳` });
      this._slider(fx, 'צמצם', { min: 0.2, max: 8, step: 0.1, get: () => p.dofAperture, set: (v) => (p.dofAperture = v) });
    }
    this._slider(fx, 'עוצמת AO', { min: 0, max: 1.5, step: 0.01, get: () => p.aoIntensity, set: (v) => (p.aoIntensity = v) });
    this._slider(fx, 'עוצמת זוהר', { min: 0, max: 2, step: 0.01, get: () => p.bloomStrength, set: (v) => (p.bloomStrength = v) });
    this._slider(fx, 'עוצמת קרניים', { min: 0, max: 2, step: 0.01, get: () => p.raysIntensity, set: (v) => (p.raysIntensity = v) });

    const gr = this._section(body, 'צבע ומצלמה', 'aperture');
    this._select(gr, 'מיפוי טונים', {
      options: [
        ['agx', 'AgX (קולנועי)'],
        ['aces', 'ACES Filmic'],
        ['neutral', 'Khronos Neutral'],
      ],
      get: () => p.toneMapper,
      set: (v) => (p.toneMapper = v),
    });
    this._slider(gr, 'רוויה', { min: 0, max: 2, step: 0.01, get: () => p.saturation, set: (v) => (p.saturation = v) });
    this._slider(gr, 'ניגודיות', { min: 0.5, max: 1.6, step: 0.01, get: () => p.contrast, set: (v) => (p.contrast = v) });
    this._slider(gr, 'טמפרטורה', { min: -1, max: 1, step: 0.01, get: () => p.temperature, set: (v) => (p.temperature = v) });
    this._slider(gr, 'גוון', { min: -1, max: 1, step: 0.01, get: () => p.tint, set: (v) => (p.tint = v) });
    this._slider(gr, 'וינייטה', { min: 0, max: 1, step: 0.01, get: () => p.vignette, set: (v) => (p.vignette = v) });
    this._slider(gr, 'גרעיניות', { min: 0, max: 0.15, step: 0.001, get: () => p.grain, set: (v) => (p.grain = v), format: (v) => v.toFixed(3) });
    this._slider(gr, 'סטייה כרומטית', { min: 0, max: 0.01, step: 0.0001, get: () => p.chromatic, set: (v) => (p.chromatic = v), format: (v) => (v * 1000).toFixed(1) });
    this._slider(gr, 'שדה ראייה', {
      min: 30,
      max: 100,
      step: 1,
      get: () => this.rig.fovBase,
      set: (v) => {
        this.rig.fovBase = v;
        eng.camera.fov = v;
        eng.camera.updateProjectionMatrix();
      },
      format: (v) => `${v}°`,
    });
    const info = body.querySelector('#gpuInfo');
    if (info) info.textContent = `${this.app.gpuName || 'GPU'} · DPR ${eng.renderer.getPixelRatio().toFixed(2)}`;
  }

  // File tab -----------------------------------------------------------

  _fileTab(body) {
    const sc = this._section(body, 'שמירה וטעינה', 'save');
    sc.append(el(`<p class="hint">נשמרים האובייקטים שהוספתם, הסביבה והגדרות הגרפיקה. השמירה נשארת בדפדפן הזה בלבד.</p>`));
    this._buttons(sc, [
      ['שמירה', 'save', () => this.saveLocal(), 'accent'],
      ['טעינה', 'upload', () => this.loadLocal()],
      ['ייצוא JSON', 'download', () => this.exportModal()],
      ['ייבוא JSON', 'upload', () => this.importModal()],
    ]);
    this._buttons(sc, [['ניקוי אובייקטים שנוספו', 'trash', () => this.clearAdded(), 'danger']]);

    const cap = this._section(body, 'צילום', 'camera');
    this._buttons(cap, [
      ['צילום מסך', 'camera', () => this.screenshot(), 'accent'],
      ['מצב צילום', 'aperture', () => this.setPhoto(true)],
    ]);

    const code = this._section(body, 'מסוף סקריפטים', 'text');
    code.append(
      el(`<p class="hint">הריצו JavaScript מול המנוע. זמינים: <code>engine</code>, <code>THREE</code>, <code>app</code>, <code>spawn(kind, params)</code>.</p>`),
    );
    const ta = el(`<textarea class="code" id="scriptBox" spellcheck="false" aria-label="קוד להרצה">// גשם של כדורים מעל הרחבה
for (let i = 0; i < 25; i++) {
  spawn('ball', {
    position: [Math.random() * 16 - 8, 12 + i * 0.6, Math.random() * 16 - 8],
    radius: 0.25 + Math.random() * 0.3,
    color: \`hsl(\${Math.random() * 360}, 75%, 55%)\`,
  });
}</textarea>`);
    code.append(ta);
    this._buttons(code, [['הרצה', 'play', () => this.runScript(ta.value), 'accent']]);

    const about = this._section(body, 'על המנוע', 'help');
    about.append(
      el(`<p class="hint">שימוטרון ${VERSION} — מנוע תלת־ממד לדפדפן: תאורת PBR מבוססת פיזיקה, שמיים אטמוספריים עם עננים ומחזור יום/לילה, IBL חי, ערפל גובה, צללים, GTAO, קרני אור, Bloom, AgX, ים גרסטנר, צמחייה מונפשת ברוח, חלקיקים, פיזיקה (cannon-es), קול תלת־ממדי מסונתז, ועורך מלא.</p>`),
    );
  }

  // --------------------------------------------------------- persistence

  _serializeEntity(e) {
    const o = e.object3D;
    const out = {
      kind: e.kind,
      name: e.name,
      params: { ...e.params },
      position: o.position.toArray().map((v) => +v.toFixed(4)),
      quaternion: o.quaternion.toArray().map((v) => +v.toFixed(5)),
      scale: o.scale.toArray().map((v) => +v.toFixed(4)),
      dynamic: e.body ? e.body.mass > 0 : false,
    };
    const m = o.isMesh && !Array.isArray(o.material) ? o.material : null;
    if (m && m.userData.libKey) {
      out.material = { key: m.userData.libKey, color: '#' + m.color.getHexString(), roughness: m.roughness, metalness: m.metalness, emissive: '#' + m.emissive.getHexString() };
    }
    return out;
  }

  _spawnFromData(d) {
    const eng = this.engine;
    const params = { ...d.params, position: d.position };
    delete params.rotation;
    delete params.scale;
    if (d.dynamic !== undefined) params.dynamic = d.dynamic;
    const e = eng.spawn(d.kind, params);
    if (d.name) e.name = d.name;
    const o = e.object3D;
    if (d.quaternion) o.quaternion.fromArray(d.quaternion);
    if (d.scale) o.scale.fromArray(d.scale);
    if (d.material && o.isMesh) {
      const lib = eng.materials.lib[d.material.key];
      if (lib && o.material.userData.libKey !== d.material.key) {
        o.material = lib.clone();
        o.material.userData.libKey = d.material.key;
      }
      o.material.color.set(d.material.color);
      o.material.roughness = d.material.roughness;
      o.material.metalness = d.material.metalness;
      o.material.emissive.set(d.material.emissive);
    }
    o.updateMatrixWorld();
    if (e.body) eng.physics.rebuildBody(e);
    if (d.kind === 'fire' && eng.audio.ctx && !e.sound) e.sound = eng.audio.addFire(o.position);
    return e;
  }

  serialize() {
    const eng = this.engine;
    const atm = eng.atmosphere;
    return {
      format: 'shimotron-scene',
      version: 1,
      saved: new Date().toISOString(),
      environment: {
        timeOfDay: atm.timeOfDay,
        daySpeed: atm.daySpeed,
        sunAzimuth: atm.sunAzimuth,
        cloudCoverage: atm.cloudCoverage,
        cloudDensity: atm.cloudDensity,
        fogDensity: atm.fogDensity,
        exposureBias: atm.exposureBias,
        turbidity: atm.model.turbidity,
        rayleigh: atm.model.rayleigh,
        wind: atm.wind.strength,
        windDir: atm.wind.dir.toArray(),
        waves: this.app.world.water.waveAmp,
      },
      graphics: { preset: eng.quality.presetName, ...Object.fromEntries(Object.entries(eng.pipeline.params).filter(([, v]) => typeof v !== 'object')) },
      camera: { position: eng.camera.position.toArray(), target: this.rig.orbit.target.toArray() },
      entities: eng.entities.filter((e) => e.serializable && e.kind).map((e) => this._serializeEntity(e)),
    };
  }

  deserialize(data) {
    if (!data || data.format !== 'shimotron-scene') throw new Error('זה אינו קובץ סצנה של שימוטרון');
    const eng = this.engine;
    const atm = eng.atmosphere;
    this.clearAdded(true);
    const env = data.environment || {};
    if (env.timeOfDay !== undefined) atm.setTime(env.timeOfDay);
    for (const k of ['daySpeed', 'sunAzimuth', 'cloudCoverage', 'cloudDensity', 'fogDensity', 'exposureBias']) if (env[k] !== undefined) atm[k] = env[k];
    if (env.turbidity) atm.model.turbidity = env.turbidity;
    if (env.rayleigh) atm.model.rayleigh = env.rayleigh;
    if (env.wind !== undefined) atm.wind.strength = env.wind;
    if (env.windDir) atm.wind.dir.fromArray(env.windDir);
    if (env.waves !== undefined) this.app.world.water.waveAmp = env.waves;
    atm._envDirty = true;
    atm.forceAdapt = true;
    const g = data.graphics || {};
    if (g.preset && g.preset !== eng.quality.presetName) eng.quality.setPreset(g.preset);
    for (const [k, v] of Object.entries(g)) if (k in eng.pipeline.params && typeof v !== 'object') eng.pipeline.params[k] = v;
    for (const d of data.entities || []) {
      if (!eng.prefabs.has(d.kind)) continue;
      const e = this._spawnFromData(d);
      e.group = 'אובייקטים';
    }
    if (data.camera && this.rig.mode === 'orbit') {
      eng.camera.position.fromArray(data.camera.position);
      this.rig.orbit.target.fromArray(data.camera.target);
    }
    this.renderInspector();
  }

  saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialize()));
      this.toast('הסצנה נשמרה בדפדפן', 'save');
    } catch {
      this.toast('השמירה בדפדפן חסומה כאן — השתמשו בייצוא JSON', 'download');
    }
  }

  loadLocal() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    if (!raw) return this.toast('לא נמצאה סצנה שמורה בדפדפן הזה', 'upload');
    try {
      this.deserialize(JSON.parse(raw));
      this.toast('הסצנה נטענה', 'upload');
    } catch (err) {
      this.toast(`טעינה נכשלה: ${err.message}`, 'close');
    }
  }

  clearAdded(silent) {
    const eng = this.engine;
    for (const e of [...eng.entities]) if (e.serializable && e.group === 'אובייקטים') eng.remove(e);
    for (const e of [...eng.entities]) if (e.group === 'קליעים') eng.remove(e);
    this.select(null);
    if (!silent) this.toast('האובייקטים שנוספו נוקו', 'trash');
  }

  exportModal() {
    const json = JSON.stringify(this.serialize(), null, 2);
    const body = el(`<div><p class="hint">העתיקו את הטקסט ושמרו אותו כקובץ ‎.json. אפשר לטעון אותו בחזרה דרך “ייבוא JSON”.</p><textarea class="code" readonly aria-label="JSON של הסצנה">${esc(json)}</textarea><div class="btn-row"></div></div>`);
    const row = body.querySelector('.btn-row');
    const copy = el(`<button type="button" class="btn accent">${icon('copy')}העתקה</button>`);
    copy.addEventListener('click', () => {
      const ta = body.querySelector('textarea');
      navigator.clipboard
        ?.writeText(json)
        .then(() => this.toast('הועתק ללוח', 'copy'))
        .catch(() => {
          ta.focus();
          ta.select();
          this.toast('סמנו והעתיקו ידנית (Ctrl+C)', 'copy');
        });
    });
    row.append(copy);
    const dl = el(`<button type="button" class="btn">${icon('download')}הורדת קובץ</button>`);
    dl.addEventListener('click', () => this.saveFile('shimotron-scene.json', json));
    row.append(dl);
    this.openModal('ייצוא סצנה', body);
  }

  importModal() {
    const body = el(`<div><p class="hint">הדביקו כאן JSON של סצנה, או בחרו קובץ.</p><textarea class="code" id="importBox" placeholder='{ "format": "shimotron-scene", ... }' aria-label="JSON לייבוא"></textarea><div class="btn-row"></div></div>`);
    const row = body.querySelector('.btn-row');
    const load = el(`<button type="button" class="btn accent">${icon('upload')}טעינה</button>`);
    load.addEventListener('click', () => {
      try {
        this.deserialize(JSON.parse(body.querySelector('textarea').value));
        this.closeModal();
        this.toast('הסצנה יובאה', 'upload');
      } catch (err) {
        this.toast(`ייבוא נכשל: ${err.message}`, 'close');
      }
    });
    const file = el(`<label class="btn">${icon('download')}בחירת קובץ<input type="file" accept=".json,application/json" hidden></label>`);
    file.querySelector('input').addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (f) body.querySelector('textarea').value = await f.text();
    });
    row.append(load, file);
    this.openModal('ייבוא סצנה', body);
  }

  /**
   * Offers a file to the viewer: through the host's download capability
   * when embedded (the viewer confirms), or a plain browser download.
   */
  async saveFile(filename, data) {
    let downloads = null;
    try {
      downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    } catch {
      downloads = null;
    }
    if (downloads) {
      try {
        await downloads.save({ filename, data });
        this.toast('הקובץ נשמר', 'download');
      } catch (err) {
        if (err && err.code === 'declined') return;
        if (err && err.code === 'rate_limited') this.toast('חלון שמירה כבר פתוח — נסו שוב בעוד רגע', 'download');
        else this.toast('השמירה אינה זמינה כאן', 'download');
      }
      return;
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  runScript(src) {
    const eng = this.engine;
    const spawn = (kind, params) => {
      const e = eng.spawn(kind, params);
      e.group = 'אובייקטים';
      return e;
    };
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('engine', 'THREE', 'app', 'spawn', src);
      const r = fn(eng, THREE, this.app, spawn);
      this.toast(r !== undefined ? `הקוד רץ: ${String(r).slice(0, 60)}` : 'הקוד רץ בהצלחה', 'play');
    } catch (err) {
      const blocked = /unsafe-eval|Content Security Policy|EvalError/i.test(String(err));
      this.toast(blocked ? 'הרצת קוד חסומה בסביבה הזו — פתחו את הקובץ המקומי' : `שגיאה: ${err.message}`, 'close');
    }
  }

  screenshot() {
    const url = this.engine.pipeline.capture();
    const body = el(`<div><img alt="צילום מסך של הסצנה" src="${url}"><p class="hint">לחיצה ימנית על התמונה ← “שמירת תמונה בשם”, או הורדה:</p><div class="btn-row"></div></div>`);
    const dl = el(`<button type="button" class="btn accent">${icon('download')}הורדת PNG</button>`);
    dl.addEventListener('click', () => {
      const bin = atob(url.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      this.saveFile(`shimotron-${Date.now()}.png`, new Blob([bytes], { type: 'image/png' }));
    });
    body.querySelector('.btn-row').append(dl);
    this.openModal('צילום מסך', body);
  }

  // ---------------------------------------------------------- overlays

  _statusbar() {
    const bar = el(`<footer class="statusbar" aria-label="סטטיסטיקות">
      <span class="stat fps"><canvas class="spark" width="64" height="16" aria-hidden="true"></canvas><b id="stFps">--</b> fps</span>
      <span class="stat hide-sm-stat"><b id="stMs">--</b> ms</span>
      <span class="stat"><b id="stCalls">--</b> draws</span>
      <span class="stat hide-sm-stat"><b id="stTris">--</b> tris</span>
      <span class="stat hide-sm-stat"><b id="stBodies">--</b> bodies</span>
      <span class="stat hide-sm-stat"><b id="stScale">--</b> res</span>
      <span class="status-hint" id="statusHint"></span>
    </footer>`);
    this.statusbar = bar;
    this.spark = bar.querySelector('canvas').getContext('2d');
    this.statusHint = bar.querySelector('#statusHint');
    return bar;
  }

  _overlays() {
    const wrap = el(`<div>
      <div class="crosshair" hidden></div>
      <div class="lock-hint" hidden>לחצו על המסך כדי לשלוט במצלמה</div>
      <div class="toasts" aria-live="polite"></div>
      <div class="sticks" hidden>
        <div class="stick left" data-stick="move"><i></i></div>
        <div class="stick right" data-stick="look"><i></i></div>
        <div class="touch-btns"><button type="button" data-act="jump" aria-label="קפיצה">${icon('bolt')}</button><button type="button" data-act="shoot" aria-label="ירי">${icon('target')}</button></div>
      </div>
      <div class="photo-bar topbar" hidden style="top:auto;bottom:calc(14px + env(safe-area-inset-bottom,0px));inset-inline:auto;left:50%;transform:translateX(-50%);border-radius:999px;border:1px solid var(--line-strong);height:48px;padding:0 10px">
        <button class="tbtn primary" type="button" data-p="shot">${icon('camera')}<span class="label">צילום</span></button>
        <span class="hint" style="margin:0 8px">לחיצה על הסצנה קובעת מיקוד</span>
        <button class="tbtn" type="button" data-p="exit">${icon('close')}<span class="label">יציאה</span></button>
      </div>
    </div>`);
    this.crosshair = wrap.querySelector('.crosshair');
    this.lockHint = wrap.querySelector('.lock-hint');
    this.toasts = wrap.querySelector('.toasts');
    this.sticks = wrap.querySelector('.sticks');
    this.photoBar = wrap.querySelector('.photo-bar');
    this.photoBar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.p === 'shot') this.screenshot();
      else this.setPhoto(false);
    });
    this._bindSticks();
    return wrap;
  }

  _bindSticks() {
    const input = this.engine.input;
    for (const stick of this.sticks.querySelectorAll('.stick')) {
      const knob = stick.querySelector('i');
      const which = stick.dataset.stick;
      let id = null;
      const set = (x, y) => {
        knob.style.transform = `translate(${x * 36}px, ${y * 36}px)`;
        if (which === 'move') input.touch.move = { x, y: -y };
        else input.touch.look = { x, y };
      };
      const onMove = (e) => {
        if (e.pointerId !== id) return;
        const r = stick.getBoundingClientRect();
        let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const l = Math.hypot(x, y);
        if (l > 1) {
          x /= l;
          y /= l;
        }
        set(x, y);
      };
      stick.addEventListener('pointerdown', (e) => {
        id = e.pointerId;
        stick.setPointerCapture(id);
        input.touch.active = true;
        onMove(e);
      });
      stick.addEventListener('pointermove', onMove);
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        set(0, 0);
        input.touch.active = false;
      };
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
    }
    this.sticks.querySelector('.touch-btns').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'jump') input.touch.jump = true;
      else this.app.showcase.shoot();
    });
  }

  _mobileNav() {
    const nav = el(`<nav class="mobile-nav" aria-label="פאנלים">
      <button type="button" data-panel="tree" aria-pressed="false">${icon('layers')}סצנה</button>
      <button type="button" data-panel="inspector" aria-pressed="false">${icon('sliders')}מאפיינים</button>
    </nav>`);
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.togglePanel(b.dataset.panel);
    });
    this.mobileNav = nav;
    return nav;
  }

  toast(text, ic = 'bolt') {
    const t = el(`<div class="toast">${icon(ic)}<span>${esc(text)}</span></div>`);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild.remove();
    setTimeout(() => t.remove(), 2600);
  }

  openModal(title, content) {
    this.closeModal();
    const wrap = el(`<div class="modal-wrap" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal"><div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="tbtn" aria-label="סגירה">${icon('close')}</button></div><div class="modal-body"></div></div></div>`);
    wrap.querySelector('.modal-body').append(content);
    wrap.querySelector('.modal-head button').addEventListener('click', () => this.closeModal());
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) this.closeModal();
    });
    document.body.append(wrap);
    this.modal = wrap;
    this.engine.input.exitLock();
  }

  closeModal() {
    this.modal?.remove();
    this.modal = null;
  }

  showHelp() {
    const k = (keys, text) => `<div><span>${text}</span><span>${keys.map((x) => `<kbd>${x}</kbd>`).join(' ')}</span></div>`;
    const body = el(`<div class="keys">
      <h5>כללי</h5>
      ${k(['1'], 'מצב עורך')}${k(['2'], 'מצב טיסה')}${k(['3'], 'מצב הליכה')}${k(['4'], 'סיור קולנועי')}
      ${k(['P'], 'עצירת/הפעלת סימולציה')}${k(['T'], 'מעבר יום/לילה')}${k(['X'], 'פיצוץ במרכז המסך')}${k(['H'], 'הסתרת הממשק')}${k(['F2'], 'צילום מסך')}${k(['?'], 'חלון זה')}
      <h5>עורך</h5>
      ${k(['W'], 'כלי הזזה')}${k(['E'], 'כלי סיבוב')}${k(['R'], 'כלי קנה מידה')}${k(['F'], 'מיקוד על הנבחר')}${k(['Del'], 'מחיקה')}${k(['Ctrl', 'D'], 'שכפול')}${k(['B'], 'הוספת כדור')}${k(['Esc'], 'ביטול בחירה')}
      <h5>טיסה והליכה</h5>
      ${k(['W', 'A', 'S', 'D'], 'תנועה')}${k(['Space'], 'קפיצה / עלייה')}${k(['Q', 'E'], 'ירידה / עלייה (טיסה)')}${k(['Shift'], 'ריצה / מהירות')}${k(['Click'], 'ירי כדור')}${k(['F'], 'ירי כדור')}${k(['Esc'], 'שחרור העכבר')}
    </div>`);
    this.openModal('קיצורי מקלדת', body);
  }

  // --------------------------------------------------------------- frame

  _onFrame(s) {
    if (this._treeDirty && !this.hierarchy.hidden) this.renderTree();
    const now = performance.now();
    if (now - (this._lastStats || 0) > 250) {
      this._lastStats = now;
      const q = this.engine.quality;
      const fpsEl = this.statusbar.querySelector('.stat.fps');
      fpsEl.classList.toggle('warn', s.fps < 50 && s.fps >= 30);
      fpsEl.classList.toggle('bad', s.fps < 30);
      this.statusbar.querySelector('#stFps').textContent = s.fps.toFixed(0);
      this.statusbar.querySelector('#stMs').textContent = s.ms.toFixed(1);
      this.statusbar.querySelector('#stCalls').textContent = s.calls;
      this.statusbar.querySelector('#stTris').textContent = s.triangles > 1e6 ? `${(s.triangles / 1e6).toFixed(2)}M` : `${Math.round(s.triangles / 1000)}k`;
      this.statusbar.querySelector('#stBodies').textContent = s.bodies;
      this.statusbar.querySelector('#stScale').textContent = `${Math.round(q.renderScale * 100)}%`;
      this._fpsHistory.push(s.fps);
      if (this._fpsHistory.length > 32) this._fpsHistory.shift();
      const g = this.spark;
      g.clearRect(0, 0, 64, 16);
      g.strokeStyle = s.fps < 30 ? '#ff6b5d' : s.fps < 50 ? '#ffcc4d' : '#3ddc97';
      g.lineWidth = 1.2;
      g.beginPath();
      this._fpsHistory.forEach((f, i) => {
        const x = (i / 31) * 63;
        const y = 15 - Math.min(1, f / 70) * 14;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    }
    if (now - this._lastInspectorSync > 120) {
      this._lastInspectorSync = now;
      if (this.tab === 'object' && this.selected && this.selected.body && this.selected.body.mass > 0) this._syncTransformFields();
      if (this.tab === 'environment') this._syncEnvironment();
    }
  }
}
