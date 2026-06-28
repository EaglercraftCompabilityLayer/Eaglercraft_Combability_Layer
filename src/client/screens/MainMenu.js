/**
 * BrowserCraft — MainMenu Screen
 * ────────────────────────────────
 * Programmatic screen class wrapping the main menu HTML/JS.
 * Mounts the panorama, title, splash text, buttons and update bar.
 *
 * Usage:
 *   const menu = new MainMenu({ onSingleplayer, onMultiplayer, onOptions, onCheckUpdates, onQuit });
 *   menu.mount(document.getElementById('app'));
 */

'use strict';

const SPLASHES = [
  'Now in your browser!',
  '100% original code!',
  'Auto-updating!',
  'WebGL powered!',
  'Connects to real servers!',
  'No Java required!',
  'Open source!',
  'Built from scratch!',
  'Fully self-updating!',
  'Prismarine powered!',
  'Artenos world gen!',
  'Zero Mojang code!',
];

export class MainMenu {
  constructor ({
    onSingleplayer  = () => {},
    onMultiplayer   = () => {},
    onOptions       = () => {},
    onCheckUpdates  = () => {},
    onQuit          = () => {},
  } = {}) {
    this.onSingleplayer = onSingleplayer;
    this.onMultiplayer  = onMultiplayer;
    this.onOptions      = onOptions;
    this.onCheckUpdates = onCheckUpdates;
    this.onQuit         = onQuit;
    this._el            = null;
  }

  mount (container) {
    this._el = document.createElement('div');
    this._el.style.cssText = 'position:absolute;inset:0;';
    this._el.innerHTML     = this._html();
    container.appendChild(this._el);
    this._bind();
    this._startUpdateCheck();

    // Signal boot done
    window.__bootDone?.();
  }

  destroy () {
    this._el?.remove();
  }

  _html () {
    const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
      .mm-root { position:absolute;inset:0;overflow:hidden;background:#000;font-family:'VT323',monospace;image-rendering:pixelated; }
      .mm-panorama { position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#6ab3e8 0%,#3a7fc1 30%,#1a4a7a 60%,#0a1a3a 100%);animation:mmSway 20s ease-in-out infinite alternate; }
      @keyframes mmSway { 0%{filter:brightness(0.85)saturate(1.1)}100%{filter:brightness(1.05)saturate(1.2)} }
      .mm-cloud { position:absolute;background:rgba(255,255,255,0.15);border-radius:2px;animation:mmCloud linear infinite; }
      @keyframes mmCloud { from{transform:translateX(-200px)}to{transform:translateX(110%)} }
      .mm-ground { position:absolute;bottom:0;left:0;right:0;height:120px;background:linear-gradient(to bottom,#3a7a2a 0%,#2d5e1e 18%,#5a3a1a 19%,#4a2e10 40%,#3a2208 100%); }
      .mm-title-area { position:relative;text-align:center;padding-top:60px;z-index:10; }
      .mm-title { font-size:72px;color:#fff;text-shadow:4px 4px 0 #3f3f3f,-1px -1px 0 #3f3f3f,0 0 20px rgba(255,255,100,0.3);letter-spacing:2px;line-height:1;display:inline-block;animation:mmBob 3s ease-in-out infinite; }
      .mm-title .yel { color:#ffff55;text-shadow:3px 3px 0 #3f3f00,0 0 20px rgba(255,255,0,0.5); }
      @keyframes mmBob { 0%,100%{transform:translateY(0)rotate(-1deg)}50%{transform:translateY(-4px)rotate(-1deg)} }
      .mm-splash { color:#ffff00;font-size:20px;transform:rotate(-15deg)translateX(80px);display:inline-block;margin-top:-8px;text-shadow:2px 2px 0 #7f7f00;animation:mmPulse 1s ease-in-out infinite alternate; }
      @keyframes mmPulse { from{transform:rotate(-15deg)translateX(80px)scale(1)}to{transform:rotate(-15deg)translateX(80px)scale(1.08)} }
      .mm-buttons { position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:28px; }
      .mm-btn { width:260px;padding:10px 0;font-family:'VT323',monospace;font-size:22px;color:#fff;background:#848484;border:none;border-top:3px solid #c8c8c8;border-left:3px solid #c8c8c8;border-right:3px solid #3f3f3f;border-bottom:3px solid #3f3f3f;cursor:pointer;letter-spacing:1px;text-shadow:2px 2px #3f3f3f;outline:none; }
      .mm-btn:hover { filter:brightness(1.3);color:#ffffa0; }
      .mm-btn:active { border-top:3px solid #3f3f3f;border-left:3px solid #3f3f3f;border-right:3px solid #c8c8c8;border-bottom:3px solid #c8c8c8; }
      .mm-btn-row { display:flex;gap:6px; }
      .mm-btn-row .mm-btn { width:127px; }
      .mm-version { position:absolute;bottom:8px;left:10px;color:#fff;font-size:14px;text-shadow:1px 1px #000;z-index:10;opacity:0.8; }
      .mm-copy { position:absolute;bottom:8px;right:10px;color:#fff;font-size:14px;text-shadow:1px 1px #000;z-index:10;opacity:0.8; }
      .mm-audio { position:absolute;top:10px;right:10px;z-index:30;font-family:'VT323',monospace;font-size:14px;color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:6px;cursor:pointer;background:none;border:none; }
      .mm-audio:hover { color:#fff; }
      .mm-note { animation:mmNote 2s ease-in-out infinite;display:inline-block; }
      @keyframes mmNote { 0%,100%{transform:translateY(0);opacity:0.6}50%{transform:translateY(-4px);opacity:1} }
      .mm-update-bar { position:absolute;top:0;left:0;right:0;background:rgba(0,100,0,0.85);color:#55ff55;font-family:'VT323',monospace;font-size:16px;padding:6px 14px;z-index:100;display:none;align-items:center;gap:10px; }
      .mm-update-bar.show { display:flex; }
      .mm-update-track { flex:1;height:6px;background:#1a4a1a;border-radius:2px;overflow:hidden; }
      .mm-update-fill { height:100%;background:#55ff55;transition:width 0.3s;border-radius:2px;width:0%; }
    </style>

    <div class="mm-root">
      <!-- Update bar -->
      <div class="mm-update-bar" id="mm-update-bar">
        <span id="mm-update-text">⬇ Checking for updates...</span>
        <div class="mm-update-track"><div class="mm-update-fill" id="mm-update-fill"></div></div>
        <span id="mm-update-pct">0%</span>
      </div>

      <!-- Audio toggle -->
      <button class="mm-audio" id="mm-audio-btn">
        <span class="mm-note">♪</span>
        <span id="mm-audio-label">Music: ON</span>
      </button>

      <!-- Panorama -->
      <div class="mm-panorama">
        <div class="mm-cloud" style="width:120px;height:24px;top:18%;animation-duration:28s;left:-200px"></div>
        <div class="mm-cloud" style="width:80px;height:16px;top:25%;animation-duration:22s;animation-delay:-8s;left:-200px"></div>
        <div class="mm-cloud" style="width:160px;height:20px;top:12%;animation-duration:35s;animation-delay:-14s;left:-200px"></div>
        <div class="mm-cloud" style="width:60px;height:14px;top:32%;animation-duration:18s;animation-delay:-4s;left:-200px"></div>
      </div>
      <div class="mm-ground"></div>

      <!-- Title -->
      <div class="mm-title-area">
        <div><span class="mm-title">Mine<span class="yel">craft</span></span></div>
        <div><span class="mm-splash">${splash}</span></div>
      </div>

      <!-- Buttons -->
      <div class="mm-buttons">
        <button class="mm-btn" id="mm-sp">Singleplayer</button>
        <button class="mm-btn" id="mm-mp">Multiplayer</button>
        <button class="mm-btn" id="mm-opt">Options</button>
        <div class="mm-btn-row">
          <button class="mm-btn" id="mm-about">About</button>
          <button class="mm-btn" id="mm-update">Check Updates</button>
        </div>
        <button class="mm-btn" id="mm-quit" style="background:#6a4848;border-top-color:#a07070;border-left-color:#a07070">Quit Game</button>
      </div>

      <div class="mm-version" id="mm-ver">BrowserCraft v0.1.0 — Alpha</div>
      <div class="mm-copy">© 2026 CK Gaming Studios</div>
    </div>
    `;
  }

  _bind () {
    this._el.querySelector('#mm-sp').onclick     = () => this.onSingleplayer();
    this._el.querySelector('#mm-mp').onclick     = () => this.onMultiplayer();
    this._el.querySelector('#mm-opt').onclick    = () => this.onOptions();
    this._el.querySelector('#mm-update').onclick = () => this.onCheckUpdates();
    this._el.querySelector('#mm-quit').onclick   = () => this.onQuit();
    this._el.querySelector('#mm-about').onclick  = () => this._showAbout();
    this._el.querySelector('#mm-audio-btn').onclick = () => this._toggleAudio();

    this._audioEl = document.createElement('audio');
    this._audioEl.loop = true;
    this._audioEl.src  = 'https://www.minecraft.net/content/dam/games/minecraft/music/music_main_menu.mp3';
    this._audioEl.volume = 0.5;
    this._audioEl.play().catch(() => {
      // Autoplay blocked until interaction
      const unlock = () => { this._audioEl.play().catch(()=>{}); document.removeEventListener('click', unlock); };
      document.addEventListener('click', unlock);
    });
    this._audioOn = true;
  }

  _toggleAudio () {
    this._audioOn = !this._audioOn;
    this._audioEl[this._audioOn ? 'play' : 'pause']();
    this._el.querySelector('#mm-audio-label').textContent = `Music: ${this._audioOn ? 'ON' : 'OFF'}`;
  }

  _showAbout () {
    alert('BrowserCraft — Original Minecraft browser client\nBy CK Gaming Studios\nPowered by PrismarineJS + Artenos');
  }

  async _startUpdateCheck () {
    try {
      const r = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      const d = await r.json();
      const ver = this._el.querySelector('#mm-ver');
      if (ver) ver.textContent = `BrowserCraft v0.1.0 — MC ${d.latest.release} data`;
    } catch { /* offline */ }
  }

  showUpdateBar (text, pct) {
    const bar  = this._el.querySelector('#mm-update-bar');
    const fill = this._el.querySelector('#mm-update-fill');
    const txt  = this._el.querySelector('#mm-update-text');
    const pctEl = this._el.querySelector('#mm-update-pct');
    if (!bar) return;
    bar.classList.add('show');
    if (txt)  txt.textContent  = text;
    if (fill) fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    if (pct >= 100) setTimeout(() => bar.classList.remove('show'), 3000);
  }
}
