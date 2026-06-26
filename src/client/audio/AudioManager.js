/**
 * BrowserCraft — AudioManager
 * ───────────────────────────
 * Loads and plays Minecraft audio assets from the local cache.
 * Assets are stored after the updater runs:
 *   public/data/<version>/assets/<prefix>/<hash>
 *
 * The asset index maps logical names → hashes, e.g.:
 *   "minecraft/sounds/music/menu/menu1.ogg"  →  { hash: "abc123…", size: … }
 *
 * We also ship a small set of fallback URLs for development (before first sync).
 */

'use strict';

export class AudioManager {
  constructor () {
    this._ctx      = null;
    this._musicEl  = null;
    this._volume   = { music: 0.7, sound: 0.8 };
    this._muted    = { music: false, sound: false };
    this._assetMap = null;    // loaded from asset-index.json
    this._version  = null;

    // Menu music tracks — logical asset paths (resolved to hashes at runtime)
    this._menuTracks = [
      'minecraft/sounds/music/menu/menu1.ogg',
      'minecraft/sounds/music/menu/menu2.ogg',
      'minecraft/sounds/music/menu/menu3.ogg',
      'minecraft/sounds/music/menu/menu4.ogg',
    ];
    this._currentTrack = 0;
  }

  // ── Load the asset index for the installed MC version ─────────────────────
  async loadAssetIndex (version) {
    try {
      const res  = await fetch(`/data/${version}/asset-index.json`);
      const idx  = await res.json();
      this._assetMap = idx.objects || {};
      this._version  = version;
    } catch {
      this._assetMap = {};
    }
  }

  // ── Resolve a logical asset name → local URL ──────────────────────────────
  _resolveAsset (logicalPath) {
    const entry = this._assetMap?.[logicalPath];
    if (!entry) return null;
    const { hash } = entry;
    return `/data/${this._version}/assets/${hash.slice(0, 2)}/${hash}`;
  }

  // ── Play menu music ───────────────────────────────────────────────────────
  playMenuMusic () {
    this._stopMusic();

    const el = document.createElement('audio');
    el.loop   = false;
    el.volume = this._muted.music ? 0 : this._volume.music;

    const track  = this._menuTracks[this._currentTrack % this._menuTracks.length];
    const local  = this._resolveAsset(track);

    if (local) {
      el.src = local;
    } else {
      // Fallback: the official Minecraft.net stream (works in browser)
      el.src = 'https://www.minecraft.net/content/dam/games/minecraft/music/music_main_menu.mp3';
    }

    el.onended = () => {
      this._currentTrack++;
      setTimeout(() => this.playMenuMusic(), 3000); // short gap between tracks
    };

    el.play().catch(() => {
      // Autoplay blocked — will play after user interaction
      const unblock = () => { el.play().catch(() => {}); document.removeEventListener('click', unblock); };
      document.addEventListener('click', unblock);
    });

    this._musicEl = el;
  }

  _stopMusic () {
    if (this._musicEl) {
      this._musicEl.pause();
      this._musicEl.src = '';
      this._musicEl = null;
    }
  }

  // ── Play a one-shot sound effect ──────────────────────────────────────────
  playSound (logicalPath, volume = 1.0) {
    if (this._muted.sound) return;
    const local = this._resolveAsset(`minecraft/sounds/${logicalPath}.ogg`);
    if (!local) return;

    const el = document.createElement('audio');
    el.src    = local;
    el.volume = this._volume.sound * volume;
    el.play().catch(() => {});
    el.onended = () => el.remove();
    document.body.appendChild(el);
  }

  // ── UI sounds (button click, etc.) ───────────────────────────────────────
  playClick () { this.playSound('ui/button.click'); }

  // ── Volume control ────────────────────────────────────────────────────────
  setMusicVolume (v) {
    this._volume.music = v / 100;
    if (this._musicEl) this._musicEl.volume = this._muted.music ? 0 : this._volume.music;
  }

  setSoundVolume (v) {
    this._volume.sound = v / 100;
  }

  toggleMusic () {
    this._muted.music = !this._muted.music;
    if (this._musicEl) this._musicEl.volume = this._muted.music ? 0 : this._volume.music;
    return !this._muted.music;
  }

  get musicOn  () { return !this._muted.music; }
  get soundOn  () { return !this._muted.sound; }
  get musicVol () { return Math.round(this._volume.music * 100); }
  get soundVol () { return Math.round(this._volume.sound * 100); }
}
