/**
 * BrowserCraft — HUD
 * ───────────────────
 * In-game heads-up display overlay rendered in HTML/CSS over the WebGL canvas.
 * Includes: crosshair, hotbar (9 slots), health hearts, hunger, XP bar,
 * coordinates, FPS counter, and chat input stub.
 *
 * Usage:
 *   const hud = new HUD(document.getElementById('hud'));
 *   hud.init();
 *   hud.setHealth(15);
 *   hud.setHunger(18);
 *   hud.setXP(0.65, 3);
 *   hud.setSlot(3);         // select hotbar slot 3 (0-indexed)
 *   hud.setItem(0, 'diamond_sword', 1);
 */

'use strict';

const HEART_FULL  = '❤';
const HEART_HALF  = '♥';
const HEART_EMPTY = '♡';

const HUNGER_FULL  = '🍗';
const HUNGER_HALF  = '🍖';
const HUNGER_EMPTY = '🦴';

export class HUD {
  constructor (container) {
    this.container   = container;
    this._el         = null;
    this._health     = 20;
    this._maxHealth  = 20;
    this._hunger     = 20;
    this._xpProgress = 0;
    this._xpLevel   = 0;
    this._selectedSlot = 0;
    this._items      = new Array(9).fill(null);
    this._fps        = 0;
    this._fpsTimer   = null;
    this._frameCount = 0;
  }

  init () {
    this._el = document.createElement('div');
    this._el.innerHTML = this._html();
    this.container.appendChild(this._el);
    this._bind();
    this._startFPS();
  }

  destroy () {
    clearInterval(this._fpsTimer);
    this._el?.remove();
  }

  // ── HTML ─────────────────────────────────────────────────────────────────
  _html () {
    return `
    <style>
      #bc-hud { position:absolute;inset:0;pointer-events:none;font-family:'VT323',monospace;image-rendering:pixelated; }

      /* Crosshair */
      #hud-crosshair { position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:20px;height:20px; }
      #hud-crosshair::before,#hud-crosshair::after { content:'';position:absolute;background:rgba(255,255,255,0.85); }
      #hud-crosshair::before { width:2px;height:20px;left:9px;top:0; }
      #hud-crosshair::after  { width:20px;height:2px;top:9px;left:0; }

      /* Bottom area */
      #hud-bottom { position:absolute;bottom:0;left:0;right:0;display:flex;flex-direction:column;align-items:center;padding-bottom:10px;gap:4px; }

      /* XP bar */
      #hud-xp-bar { width:364px;height:5px;background:#1a1a1a;border:1px solid #2a2a2a; }
      #hud-xp-fill { height:100%;background:#7cfc00;transition:width 0.15s; }
      #hud-xp-level { position:absolute;bottom:62px;left:50%;transform:translateX(-50%);color:#7cfc00;font-size:16px;text-shadow:1px 1px #000; }

      /* Status bars */
      #hud-bars { display:flex;justify-content:space-between;width:364px; }
      .hud-hearts,.hud-hunger { display:flex;font-size:14px;gap:1px; }
      .hud-hunger { flex-direction:row-reverse; }

      /* Hotbar */
      #hud-hotbar { display:flex;gap:2px; }
      .hud-slot { width:40px;height:40px;background:rgba(0,0,0,0.55);border:2px solid #555;display:flex;align-items:center;justify-content:center;position:relative;font-size:11px; }
      .hud-slot.active { border:2px solid #fff;background:rgba(255,255,255,0.15); }
      .hud-slot-count { position:absolute;bottom:1px;right:3px;color:#fff;font-size:12px;text-shadow:1px 1px #000; }
      .hud-slot-icon { font-size:22px; }

      /* Debug / coords */
      #hud-debug { position:absolute;top:4px;left:6px;color:#fff;font-size:14px;text-shadow:1px 1px #000;line-height:1.4; }
      #hud-fps   { position:absolute;top:4px;right:6px;color:#fff;font-size:14px;text-shadow:1px 1px #000; }

      /* Chat */
      #hud-chat-log { position:absolute;bottom:68px;left:4px;width:300px;max-height:120px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:2px; }
      .hud-chat-msg { background:rgba(0,0,0,0.45);color:#fff;font-size:14px;padding:1px 5px;border-radius:1px;max-width:100%;word-break:break-word; }
    </style>

    <div id="bc-hud">
      <div id="hud-crosshair"></div>

      <div id="hud-debug">
        X: <span id="dbg-x">0</span>
        Y: <span id="dbg-y">64</span>
        Z: <span id="dbg-z">0</span><br>
        Biome: <span id="dbg-biome">plains</span>
      </div>

      <div id="hud-fps">FPS: <span id="dbg-fps">0</span></div>

      <div id="hud-chat-log" id="hud-chat"></div>

      <div id="hud-bottom">
        <div id="hud-xp-bar"><div id="hud-xp-fill" style="width:0%"></div></div>
        <div id="hud-xp-level">0</div>

        <div id="hud-bars">
          <div class="hud-hearts" id="hud-hearts"></div>
          <div class="hud-hunger" id="hud-hunger"></div>
        </div>

        <div id="hud-hotbar">
          ${Array.from({length:9}, (_,i) => `<div class="hud-slot${i===0?' active':''}" id="slot-${i}"><span class="hud-slot-icon" id="slot-icon-${i}"></span><span class="hud-slot-count" id="slot-count-${i}"></span></div>`).join('')}
        </div>
      </div>
    </div>
    `;
  }

  _bind () {
    // Keyboard slot selection (1-9)
    document.addEventListener('keydown', (e) => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= 9) this.setSlot(n - 1);
    });
    // Scroll hotbar
    document.addEventListener('wheel', (e) => {
      const delta = e.deltaY > 0 ? 1 : -1;
      this.setSlot((this._selectedSlot + delta + 9) % 9);
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  setHealth (hp, max = 20) {
    this._health    = hp;
    this._maxHealth = max;
    const hearts = this._el.querySelector('#hud-hearts');
    if (!hearts) return;
    let html = '';
    for (let i = 0; i < max / 2; i++) {
      const full = hp >= (i + 1) * 2;
      const half = !full && hp >= i * 2 + 1;
      html += `<span style="color:${full||half?'#ff0000':'#555'}">${full ? HEART_FULL : half ? HEART_HALF : HEART_EMPTY}</span>`;
    }
    hearts.innerHTML = html;
  }

  setHunger (hunger) {
    this._hunger = hunger;
    const bar = this._el.querySelector('#hud-hunger');
    if (!bar) return;
    let html = '';
    for (let i = 0; i < 10; i++) {
      const full = hunger >= (i + 1) * 2;
      const half = !full && hunger >= i * 2 + 1;
      html += `<span style="color:${full||half?'#c07020':'#555'}">${full ? HUNGER_FULL : half ? HUNGER_HALF : HUNGER_EMPTY}</span>`;
    }
    bar.innerHTML = html;
  }

  setXP (progress, level) {
    this._xpProgress = progress;
    this._xpLevel    = level;
    const fill = this._el.querySelector('#hud-xp-fill');
    const lvl  = this._el.querySelector('#hud-xp-level');
    if (fill) fill.style.width = (progress * 100) + '%';
    if (lvl)  lvl.textContent  = level > 0 ? level : '';
  }

  setSlot (idx) {
    this._el.querySelector(`#slot-${this._selectedSlot}`)?.classList.remove('active');
    this._selectedSlot = idx;
    this._el.querySelector(`#slot-${idx}`)?.classList.add('active');
  }

  setItem (slot, iconEmoji, count = 1) {
    this._items[slot] = { icon: iconEmoji, count };
    const iconEl  = this._el.querySelector(`#slot-icon-${slot}`);
    const countEl = this._el.querySelector(`#slot-count-${slot}`);
    if (iconEl)  iconEl.textContent  = iconEmoji || '';
    if (countEl) countEl.textContent = count > 1 ? count : '';
  }

  setPosition (x, y, z) {
    const el = this._el;
    if (!el) return;
    el.querySelector('#dbg-x').textContent = x.toFixed(1);
    el.querySelector('#dbg-y').textContent = y.toFixed(1);
    el.querySelector('#dbg-z').textContent = z.toFixed(1);
  }

  setBiome (name) {
    const el = this._el?.querySelector('#dbg-biome');
    if (el) el.textContent = name || 'unknown';
  }

  addChatMessage (sender, text, color = '#fff') {
    const log = this._el?.querySelector('#hud-chat-log');
    if (!log) return;
    const msg = document.createElement('div');
    msg.className = 'hud-chat-msg';
    msg.innerHTML = sender
      ? `<span style="color:#aaa">&lt;${sender}&gt;</span> <span style="color:${color}">${text}</span>`
      : `<span style="color:${color}">${text}</span>`;
    log.appendChild(msg);
    // Auto-remove after 10 seconds
    setTimeout(() => msg.remove(), 10000);
    // Scroll to bottom
    log.scrollTop = log.scrollHeight;
  }

  // ── FPS counter ──────────────────────────────────────────────────────────
  _startFPS () {
    this._frameCount = 0;
    this._fpsTimer = setInterval(() => {
      const fpsEl = this._el?.querySelector('#dbg-fps');
      if (fpsEl) fpsEl.textContent = this._frameCount;
      this._frameCount = 0;
    }, 1000);
    // Hook into rAF
    const tick = () => {
      this._frameCount++;
      if (this._el) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
