/**
 * BrowserCraft — OptionsScreen
 * ─────────────────────────────
 * All game settings: audio, video, controls, accessibility.
 * Settings are persisted to localStorage.
 *
 * Usage:
 *   const screen = new OptionsScreen({ audio, onBack });
 *   screen.mount(document.getElementById('app'));
 */

'use strict';

const SETTINGS_KEY = 'browsercraft_settings';

const DEFAULTS = {
  musicVol:    70,
  soundVol:    80,
  fov:         70,
  renderDist:  8,
  fullscreen:  false,
  vsync:       true,
  autoUpdate:  true,
  particles:   true,
  smoothLight: true,
  fancyGraphics: true,
  guiScale:    2,
  sensitivity: 100,
  invertY:     false,
  lang:        'en_us',
};

export function loadSettings () {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings (s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export class OptionsScreen {
  constructor ({ audio, onBack } = {}) {
    this.audio  = audio;
    this.onBack = onBack || (() => {});
    this._el    = null;
    this._s     = loadSettings();
  }

  mount (container) {
    this._el = document.createElement('div');
    this._el.innerHTML = this._html();
    this._el.style.cssText = 'position:absolute;inset:0;';
    container.appendChild(this._el);
    this._bind();
  }

  destroy () {
    this._el?.remove();
  }

  _html () {
    const s = this._s;
    const tog = (key, label) => `
      <div class="opt-row">
        <span class="opt-label">${label}</span>
        <button class="opt-toggle ${s[key] ? 'on' : 'off'}" data-key="${key}">${s[key] ? 'ON' : 'OFF'}</button>
      </div>`;
    const slider = (key, label, min, max, unit) => `
      <div class="opt-row">
        <span class="opt-label">${label}</span>
        <input type="range" class="opt-slider" min="${min}" max="${max}" value="${s[key]}" data-key="${key}" data-unit="${unit}">
        <span class="opt-val" id="val-${key}">${s[key]}${unit}</span>
      </div>`;

    return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
      .opt-root { position:absolute;inset:0;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;align-items:center;padding:32px 0 20px;font-family:'VT323',monospace;overflow-y:auto; }
      .opt-title { color:#fff;font-size:36px;text-shadow:2px 2px #3f3f3f;letter-spacing:2px;margin-bottom:16px; }
      .opt-section { color:#ffff55;font-size:16px;width:440px;margin:12px 0 4px;border-bottom:1px solid #333;padding-bottom:4px; }
      .opt-row { display:flex;align-items:center;gap:10px;margin-bottom:8px;width:440px; }
      .opt-label { color:#fff;font-size:19px;width:170px;flex-shrink:0;text-shadow:1px 1px #000; }
      .opt-slider { flex:1;-webkit-appearance:none;height:8px;background:#555;border:2px solid #3f3f3f;outline:none;cursor:pointer; }
      .opt-slider::-webkit-slider-thumb { -webkit-appearance:none;width:16px;height:20px;background:#aaa;border:2px solid #fff;cursor:pointer; }
      .opt-val { color:#fff;font-size:19px;width:56px;text-align:right;text-shadow:1px 1px #000; }
      .opt-toggle { font-family:'VT323',monospace;font-size:17px;padding:5px 16px;background:#848484;border:none;border-top:2px solid #c8c8c8;border-left:2px solid #c8c8c8;border-right:2px solid #3f3f3f;border-bottom:2px solid #3f3f3f;color:#fff;cursor:pointer;letter-spacing:1px; }
      .opt-toggle:hover { filter:brightness(1.3);color:#ffffa0; }
      .opt-toggle.on { color:#55ff55; }
      .opt-toggle.off { color:#ff5555; }
      .opt-select { font-family:'VT323',monospace;font-size:17px;background:#1a1a1a;color:#fff;border:2px solid #555;padding:5px 8px;outline:none;cursor:pointer;flex:1; }
      .opt-divider { width:440px;height:2px;background:rgba(255,255,255,0.07);margin:10px 0; }
      .opt-done { font-family:'VT323',monospace;font-size:22px;padding:10px 0;width:260px;color:#fff;background:#848484;border:none;border-top:3px solid #c8c8c8;border-left:3px solid #c8c8c8;border-right:3px solid #3f3f3f;border-bottom:3px solid #3f3f3f;cursor:pointer;letter-spacing:1px;text-shadow:2px 2px #3f3f3f;margin-top:14px; }
      .opt-done:hover { filter:brightness(1.3);color:#ffffa0; }
    </style>

    <div class="opt-root">
      <div class="opt-title">Options</div>

      <div class="opt-section">▸ AUDIO</div>
      ${slider('musicVol', 'Music Volume', 0, 100, '%')}
      ${slider('soundVol', 'Sound Volume', 0, 100, '%')}

      <div class="opt-section">▸ VIDEO</div>
      ${slider('fov', 'FOV', 30, 110, '°')}
      ${slider('renderDist', 'Render Distance', 2, 32, ' ch')}
      ${slider('guiScale', 'GUI Scale', 1, 4, 'x')}
      ${tog('fullscreen', 'Fullscreen')}
      ${tog('vsync', 'V-Sync')}
      ${tog('smoothLight', 'Smooth Lighting')}
      ${tog('fancyGraphics', 'Fancy Graphics')}
      ${tog('particles', 'Particles')}

      <div class="opt-section">▸ CONTROLS</div>
      ${slider('sensitivity', 'Mouse Sensitivity', 10, 200, '%')}
      ${tog('invertY', 'Invert Y-Axis')}

      <div class="opt-section">▸ LANGUAGE</div>
      <div class="opt-row">
        <span class="opt-label">Language</span>
        <select class="opt-select" data-key="lang" id="opt-lang">
          <option value="en_us" ${s.lang === 'en_us' ? 'selected' : ''}>English (US)</option>
          <option value="en_gb" ${s.lang === 'en_gb' ? 'selected' : ''}>English (UK)</option>
          <option value="de_de" ${s.lang === 'de_de' ? 'selected' : ''}>Deutsch</option>
          <option value="fr_fr" ${s.lang === 'fr_fr' ? 'selected' : ''}>Français</option>
          <option value="ja_jp" ${s.lang === 'ja_jp' ? 'selected' : ''}>日本語</option>
          <option value="zh_cn" ${s.lang === 'zh_cn' ? 'selected' : ''}>中文(简体)</option>
        </select>
      </div>

      <div class="opt-section">▸ GAME</div>
      ${tog('autoUpdate', 'Auto Update')}

      <div class="opt-divider"></div>
      <button class="opt-done" id="opt-done-btn">Done</button>
    </div>
    `;
  }

  _bind () {
    // Sliders
    this._el.querySelectorAll('.opt-slider').forEach(slider => {
      slider.oninput = () => {
        const key  = slider.dataset.key;
        const unit = slider.dataset.unit;
        const val  = parseFloat(slider.value);
        this._s[key] = val;
        this._el.querySelector(`#val-${key}`).textContent = val + unit;
        // Live audio feedback
        if (key === 'musicVol') this.audio?.setMusicVolume(val);
        if (key === 'soundVol') this.audio?.setSoundVolume(val);
      };
    });

    // Toggles
    this._el.querySelectorAll('.opt-toggle').forEach(btn => {
      btn.onclick = () => {
        const on  = btn.textContent === 'ON';
        const key = btn.dataset.key;
        btn.textContent = on ? 'OFF' : 'ON';
        btn.className   = 'opt-toggle ' + (on ? 'off' : 'on');
        this._s[key]    = !on;
        if (key === 'fullscreen') {
          if (!on) document.documentElement.requestFullscreen?.().catch(() => {});
          else     document.exitFullscreen?.().catch(() => {});
        }
      };
    });

    // Language select
    this._el.querySelector('#opt-lang').onchange = (e) => {
      this._s.lang = e.target.value;
    };

    // Done
    this._el.querySelector('#opt-done-btn').onclick = () => {
      saveSettings(this._s);
      this.onBack();
    };
  }
}
