/**
 * BrowserCraft — WorldSelect Screen
 * ──────────────────────────────────
 * Singleplayer world list + new world creation dialog.
 * Worlds are stored in localStorage as JSON entries.
 *
 * Usage:
 *   const screen = new WorldSelect({ onBack, onJoinWorld });
 *   screen.mount(document.getElementById('app'));
 */

'use strict';

const WORLDS_KEY = 'browsercraft_worlds';

function loadWorlds () {
  try { return JSON.parse(localStorage.getItem(WORLDS_KEY) || '[]'); }
  catch { return []; }
}

function saveWorlds (worlds) {
  localStorage.setItem(WORLDS_KEY, JSON.stringify(worlds));
}

function generateSeed () {
  return Math.floor(Math.random() * 2147483647).toString();
}

export class WorldSelect {
  constructor ({ onBack, onJoinWorld } = {}) {
    this.onBack       = onBack       || (() => {});
    this.onJoinWorld  = onJoinWorld  || (() => {});
    this._el          = null;
    this._worlds      = loadWorlds();
    this._selected    = null;
    this._creating    = false;
  }

  mount (container) {
    this._el = document.createElement('div');
    this._el.innerHTML = this._html();
    this._el.style.cssText = 'position:absolute;inset:0;';
    container.appendChild(this._el);
    this._bind();
    this._renderList();
  }

  destroy () {
    this._el?.remove();
  }

  // ── HTML shell ──────────────────────────────────────────────────────────
  _html () {
    return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
      .ws-root { position:absolute;inset:0;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;align-items:center;padding-top:32px;font-family:'VT323',monospace; }
      .ws-title { color:#fff;font-size:36px;text-shadow:2px 2px #3f3f3f;letter-spacing:2px;margin-bottom:16px; }
      .ws-list { width:460px;max-height:300px;overflow-y:auto;border:2px solid #444;background:#111;margin-bottom:12px; }
      .ws-list::-webkit-scrollbar { width:8px; }
      .ws-list::-webkit-scrollbar-thumb { background:#555; }
      .ws-world-item { display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #222;transition:background 0.05s; }
      .ws-world-item:hover,.ws-world-item.selected { background:rgba(255,255,255,0.1); }
      .ws-world-icon { width:40px;height:40px;background:#3a7a2a;border:2px solid #555;flex-shrink:0;image-rendering:pixelated;display:flex;align-items:center;justify-content:center;font-size:22px; }
      .ws-world-name { color:#fff;font-size:20px; }
      .ws-world-meta { color:#aaa;font-size:15px; }
      .ws-empty { color:#555;font-size:18px;text-align:center;padding:40px; }
      .ws-btn-row { display:flex;gap:6px;margin-bottom:6px; }
      .ws-btn { font-family:'VT323',monospace;font-size:20px;padding:9px 0;width:150px;color:#fff;background:#848484;border:none;border-top:3px solid #c8c8c8;border-left:3px solid #c8c8c8;border-right:3px solid #3f3f3f;border-bottom:3px solid #3f3f3f;cursor:pointer;letter-spacing:1px;text-shadow:2px 2px #3f3f3f;outline:none; }
      .ws-btn:hover { filter:brightness(1.3);color:#ffffa0; }
      .ws-btn:disabled { opacity:0.4;cursor:default;filter:none;color:#fff; }
      .ws-btn.danger { background:#6a4848;border-top-color:#a07070;border-left-color:#a07070; }
      .ws-divider { width:460px;height:2px;background:rgba(255,255,255,0.08);margin:8px 0; }

      /* ── Create World Dialog ── */
      .ws-dialog { display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.92);flex-direction:column;align-items:center;padding-top:30px;overflow-y:auto; }
      .ws-dialog.open { display:flex; }
      .ws-dialog-title { color:#fff;font-size:30px;text-shadow:2px 2px #3f3f3f;margin-bottom:18px; }
      .ws-field { display:flex;align-items:center;gap:10px;margin-bottom:10px;width:420px; }
      .ws-label { color:#ccc;font-size:18px;width:140px;flex-shrink:0; }
      .ws-input { flex:1;font-family:'VT323',monospace;font-size:18px;background:#1a1a1a;color:#fff;border:2px solid #555;padding:6px 10px;outline:none; }
      .ws-input:focus { border-color:#aaa; }
      .ws-select { flex:1;font-family:'VT323',monospace;font-size:18px;background:#1a1a1a;color:#fff;border:2px solid #555;padding:6px 8px;outline:none;cursor:pointer; }
      .ws-section { color:#ffff55;font-size:16px;width:420px;margin:10px 0 4px;border-bottom:1px solid #333;padding-bottom:4px; }
      .ws-toggle-row { display:flex;align-items:center;gap:10px;margin-bottom:8px;width:420px; }
      .ws-toggle { font-family:'VT323',monospace;font-size:16px;padding:4px 14px;background:#848484;border:none;border-top:2px solid #c8c8c8;border-left:2px solid #c8c8c8;border-right:2px solid #3f3f3f;border-bottom:2px solid #3f3f3f;color:#fff;cursor:pointer; }
      .ws-toggle.on { color:#55ff55; }
      .ws-toggle.off { color:#ff5555; }
      .ws-seed-row { display:flex;gap:6px;align-items:center;flex:1; }
      .ws-seed-btn { font-family:'VT323',monospace;font-size:16px;padding:6px 12px;background:#848484;border:none;border-top:2px solid #c8c8c8;border-left:2px solid #c8c8c8;border-right:2px solid #3f3f3f;border-bottom:2px solid #3f3f3f;color:#fff;cursor:pointer;white-space:nowrap; }
      .ws-seed-btn:hover { filter:brightness(1.3);color:#ffffa0; }
    </style>

    <div class="ws-root">
      <div class="ws-title">Select World</div>

      <div class="ws-list" id="ws-list">
        <div class="ws-empty">No worlds yet — create one!</div>
      </div>

      <div class="ws-btn-row">
        <button class="ws-btn" id="ws-play-btn" disabled>Play Selected</button>
        <button class="ws-btn" id="ws-new-btn">New World</button>
        <button class="ws-btn danger" id="ws-del-btn" disabled>Delete</button>
      </div>
      <div class="ws-btn-row">
        <button class="ws-btn" id="ws-back-btn" style="width:306px">Back</button>
      </div>
    </div>

    <!-- Create World Dialog -->
    <div class="ws-dialog" id="ws-dialog">
      <div class="ws-dialog-title">Create New World</div>

      <div class="ws-field">
        <span class="ws-label">World Name</span>
        <input class="ws-input" id="ws-name-input" type="text" value="New World" maxlength="32">
      </div>

      <div class="ws-field">
        <span class="ws-label">Seed</span>
        <div class="ws-seed-row">
          <input class="ws-input" id="ws-seed-input" type="text" placeholder="(random)" style="flex:1">
          <button class="ws-seed-btn" id="ws-rand-seed">🎲 Random</button>
        </div>
      </div>

      <div class="ws-section">▸ WORLD TYPE</div>
      <div class="ws-field">
        <span class="ws-label">Type</span>
        <select class="ws-select" id="ws-type-select">
          <option value="default">Default</option>
          <option value="flat">Superflat</option>
          <option value="largeBiomes">Large Biomes</option>
          <option value="amplified">Amplified</option>
          <option value="singleBiome">Single Biome</option>
          <option value="debug">Debug Mode</option>
        </select>
      </div>

      <div class="ws-section">▸ GAME SETTINGS</div>
      <div class="ws-field">
        <span class="ws-label">Game Mode</span>
        <select class="ws-select" id="ws-gamemode-select">
          <option value="survival">Survival</option>
          <option value="creative">Creative</option>
          <option value="adventure">Adventure</option>
          <option value="spectator">Spectator</option>
        </select>
      </div>
      <div class="ws-field">
        <span class="ws-label">Difficulty</span>
        <select class="ws-select" id="ws-diff-select">
          <option value="peaceful">Peaceful</option>
          <option value="easy">Easy</option>
          <option value="normal" selected>Normal</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      <div class="ws-section">▸ GAME RULES</div>
      <div class="ws-toggle-row">
        <span class="ws-label">Keep Inventory</span>
        <button class="ws-toggle off" data-rule="keepInventory">OFF</button>
      </div>
      <div class="ws-toggle-row">
        <span class="ws-label">Do Daylight Cycle</span>
        <button class="ws-toggle on" data-rule="doDaylightCycle">ON</button>
      </div>
      <div class="ws-toggle-row">
        <span class="ws-label">Do Mob Spawning</span>
        <button class="ws-toggle on" data-rule="doMobSpawning">ON</button>
      </div>
      <div class="ws-toggle-row">
        <span class="ws-label">Do Fire Tick</span>
        <button class="ws-toggle on" data-rule="doFireTick">ON</button>
      </div>
      <div class="ws-toggle-row">
        <span class="ws-label">Fall Damage</span>
        <button class="ws-toggle on" data-rule="fallDamage">ON</button>
      </div>
      <div class="ws-toggle-row">
        <span class="ws-label">PvP</span>
        <button class="ws-toggle on" data-rule="pvp">ON</button>
      </div>
      <div class="ws-toggle-row">
        <span class="ws-label">Show Coordinates</span>
        <button class="ws-toggle off" data-rule="showCoordinates">OFF</button>
      </div>

      <div class="ws-section">▸ DATAPACKS</div>
      <div class="ws-field">
        <span class="ws-label">Enabled</span>
        <select class="ws-select" id="ws-datapack-select" multiple style="height:72px;">
          <option value="vanilla" selected>vanilla</option>
          <option value="bundle">bundle</option>
          <option value="trade_rebalance">trade_rebalance</option>
        </select>
      </div>

      <div class="ws-divider" style="width:420px;margin-top:14px;"></div>

      <div class="ws-btn-row" style="margin-top:12px;">
        <button class="ws-btn" id="ws-create-btn" style="width:200px;">Create World</button>
        <button class="ws-btn danger" id="ws-cancel-btn" style="width:200px;">Cancel</button>
      </div>
      <div style="height:30px;"></div>
    </div>
    `;
  }

  // ── Bind events ──────────────────────────────────────────────────────────
  _bind () {
    this._el.querySelector('#ws-back-btn').onclick  = () => this.onBack();
    this._el.querySelector('#ws-new-btn').onclick   = () => this._openDialog();
    this._el.querySelector('#ws-cancel-btn').onclick = () => this._closeDialog();
    this._el.querySelector('#ws-play-btn').onclick  = () => this._playSelected();
    this._el.querySelector('#ws-del-btn').onclick   = () => this._deleteSelected();
    this._el.querySelector('#ws-rand-seed').onclick = () => {
      this._el.querySelector('#ws-seed-input').value = generateSeed();
    };
    this._el.querySelector('#ws-create-btn').onclick = () => this._createWorld();

    // Gamerule toggles
    this._el.querySelectorAll('.ws-toggle').forEach(btn => {
      btn.onclick = () => {
        const on = btn.textContent === 'ON';
        btn.textContent  = on ? 'OFF' : 'ON';
        btn.className    = 'ws-toggle ' + (on ? 'off' : 'on');
      };
    });
  }

  // ── World list rendering ─────────────────────────────────────────────────
  _renderList () {
    const list = this._el.querySelector('#ws-list');
    if (!this._worlds.length) {
      list.innerHTML = '<div class="ws-empty">No worlds yet — create one!</div>';
      return;
    }
    list.innerHTML = this._worlds.map((w, i) => `
      <div class="ws-world-item${this._selected === i ? ' selected' : ''}" data-idx="${i}">
        <div class="ws-world-icon">🌍</div>
        <div>
          <div class="ws-world-name">${w.name}</div>
          <div class="ws-world-meta">${w.gamemode} · ${w.type} · Seed: ${w.seed}</div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.ws-world-item').forEach(el => {
      el.onclick = () => {
        this._selected = parseInt(el.dataset.idx);
        this._renderList();
        this._el.querySelector('#ws-play-btn').disabled = false;
        this._el.querySelector('#ws-del-btn').disabled  = false;
      };
      el.ondblclick = () => {
        this._selected = parseInt(el.dataset.idx);
        this._playSelected();
      };
    });
  }

  // ── Dialog open/close ────────────────────────────────────────────────────
  _openDialog () {
    this._el.querySelector('#ws-dialog').classList.add('open');
    this._el.querySelector('#ws-name-input').focus();
  }

  _closeDialog () {
    this._el.querySelector('#ws-dialog').classList.remove('open');
  }

  // ── Create world ─────────────────────────────────────────────────────────
  _createWorld () {
    const name     = this._el.querySelector('#ws-name-input').value.trim() || 'New World';
    const seed     = this._el.querySelector('#ws-seed-input').value.trim() || generateSeed();
    const type     = this._el.querySelector('#ws-type-select').value;
    const gamemode = this._el.querySelector('#ws-gamemode-select').value;
    const difficulty = this._el.querySelector('#ws-diff-select').value;

    // Collect gamerules
    const rules = {};
    this._el.querySelectorAll('.ws-toggle').forEach(btn => {
      rules[btn.dataset.rule] = btn.textContent === 'ON';
    });

    // Collect datapacks
    const datapacks = [...this._el.querySelector('#ws-datapack-select').selectedOptions]
      .map(o => o.value);

    const world = {
      id:          Date.now().toString(),
      name,
      seed,
      type,
      gamemode,
      difficulty,
      rules,
      datapacks,
      created:     new Date().toISOString(),
      lastPlayed:  null,
    };

    this._worlds.unshift(world);
    saveWorlds(this._worlds);
    this._selected = 0;
    this._closeDialog();
    this._renderList();
    this._el.querySelector('#ws-play-btn').disabled = false;
    this._el.querySelector('#ws-del-btn').disabled  = false;
  }

  // ── Play / delete ─────────────────────────────────────────────────────────
  _playSelected () {
    if (this._selected === null) return;
    const world = this._worlds[this._selected];
    world.lastPlayed = new Date().toISOString();
    saveWorlds(this._worlds);
    this.onJoinWorld(world);
  }

  _deleteSelected () {
    if (this._selected === null) return;
    if (!confirm(`Delete "${this._worlds[this._selected].name}"? This cannot be undone.`)) return;
    this._worlds.splice(this._selected, 1);
    this._selected = null;
    saveWorlds(this._worlds);
    this._renderList();
    this._el.querySelector('#ws-play-btn').disabled = true;
    this._el.querySelector('#ws-del-btn').disabled  = true;
  }
}
