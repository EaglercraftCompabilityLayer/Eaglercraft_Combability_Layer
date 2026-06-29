/**
 * BrowserCraft — AudioManager
 * ────────────────────────────
 * Loads Minecraft music the CORRECT way:
 *
 *  1. GET version_manifest_v2.json  → find latest release version
 *  2. GET version package JSON      → find assetIndex.url
 *  3. GET asset index JSON          → find music file hashes
 *  4. Build URL:
 *       https://resources.download.minecraft.net/<hash[0..2]>/<hash>
 *  5. Play via <audio> element
 *
 * No hardcoded URLs. Works for any MC version automatically.
 */

'use strict';

const MANIFEST_URL   = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RESOURCES_BASE = 'https://resources.download.minecraft.net';

// Menu music logical paths inside the asset index
const MENU_MUSIC_PATHS = [
  'minecraft/sounds/music/menu/menu1.ogg',
  'minecraft/sounds/music/menu/menu2.ogg',
  'minecraft/sounds/music/menu/menu3.ogg',
  'minecraft/sounds/music/menu/menu4.ogg',
];

export class AudioManager {
  constructor () {
    this._musicEl      = null;
    this._assetIndex   = null;   // full objects map from asset index JSON
    this._tracks       = [];     // resolved CDN URLs for menu music
    this._trackIdx     = 0;
    this._volume       = { music: 0.7, sound: 0.8 };
    this._musicOn      = true;
    this._ready        = false;
    this._loadPromise  = null;
  }

  // ── Step 1-3: resolve asset index from Mojang ─────────────────────────────
  async _resolveAssetIndex () {
    // Step 1: version manifest
    const manifestRes = await fetch(MANIFEST_URL);
    const manifest    = await manifestRes.json();
    const latestRelease = manifest.latest.release;

    // Step 2: version package
    const versionEntry = manifest.versions.find(v => v.id === latestRelease);
    if (!versionEntry) throw new Error(`Version ${latestRelease} not in manifest`);

    const pkgRes = await fetch(versionEntry.url);
    const pkg    = await pkgRes.json();

    // Step 3: asset index
    const idxRes = await fetch(pkg.assetIndex.url);
    const idx    = await idxRes.json();

    this._assetIndex = idx.objects;
    console.log(`[Audio] Asset index loaded — ${Object.keys(this._assetIndex).length} objects (MC ${latestRelease})`);
    return this._assetIndex;
  }

  // ── Step 4: build CDN URL from hash ──────────────────────────────────────
  _hashToUrl (hash) {
    // URL pattern: https://resources.download.minecraft.net/<first2chars>/<fullhash>
    const prefix = hash.slice(0, 2);
    return `${RESOURCES_BASE}/${prefix}/${hash}`;
  }

  // ── Resolve music track URLs ──────────────────────────────────────────────
  async _resolveTracks () {
    if (!this._assetIndex) await this._resolveAssetIndex();

    this._tracks = [];
    for (const path of MENU_MUSIC_PATHS) {
      const entry = this._assetIndex[path];
      if (entry) {
        const url = this._hashToUrl(entry.hash);
        this._tracks.push(url);
        console.log(`[Audio] Resolved ${path} → .../${entry.hash}`);
      } else {
        console.warn(`[Audio] Music path not found in asset index: ${path}`);
      }
    }

    if (this._tracks.length === 0) {
      throw new Error('No menu music tracks found in asset index');
    }
  }

  // ── Resolve any asset by logical path ─────────────────────────────────────
  async resolveAsset (logicalPath) {
    if (!this._assetIndex) await this._resolveAssetIndex();
    const entry = this._assetIndex[logicalPath];
    if (!entry) return null;
    return this._hashToUrl(entry.hash);
  }

  // ── Play menu music ───────────────────────────────────────────────────────
  async playMenuMusic () {
    // Load asset index first (one time)
    if (!this._loadPromise) {
      this._loadPromise = this._resolveTracks().catch(e => {
        console.error('[Audio] Failed to resolve tracks:', e.message);
        this._tracks = []; // will silently play nothing
      });
    }
    await this._loadPromise;

    if (!this._tracks.length) return;

    this._stopMusic();
    this._playTrack(this._trackIdx % this._tracks.length);
  }

  _playTrack (idx) {
    if (!this._tracks[idx]) return;

    const el = document.createElement('audio');
    el.src    = this._tracks[idx];
    el.volume = this._musicOn ? this._volume.music : 0;
    el.preload = 'auto';

    el.onended = () => {
      this._trackIdx++;
      // Gap between tracks like real MC (few seconds of silence)
      setTimeout(() => {
        if (this._musicOn) this._playTrack(this._trackIdx % this._tracks.length);
      }, 3000 + Math.random() * 5000);
    };

    el.onerror = () => {
      console.warn(`[Audio] Failed to play track ${idx}, skipping`);
      this._trackIdx++;
      setTimeout(() => this._playTrack(this._trackIdx % this._tracks.length), 1000);
    };

    // Autoplay guard — browsers require user interaction first
    const playPromise = el.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Queue play on first user interaction
        const unlock = () => {
          el.play().catch(() => {});
          document.removeEventListener('click',    unlock);
          document.removeEventListener('keydown',  unlock);
          document.removeEventListener('touchend', unlock);
        };
        document.addEventListener('click',    unlock);
        document.addEventListener('keydown',  unlock);
        document.addEventListener('touchend', unlock);
      });
    }

    this._musicEl = el;
  }

  _stopMusic () {
    if (this._musicEl) {
      this._musicEl.pause();
      this._musicEl.src = '';
      this._musicEl.onended = null;
      this._musicEl = null;
    }
  }

  // ── Play a one-shot sound effect ──────────────────────────────────────────
  async playSound (logicalPath) {
    const url = await this.resolveAsset(`minecraft/sounds/${logicalPath}.ogg`);
    if (!url) return;
    const el = document.createElement('audio');
    el.src    = url;
    el.volume = this._volume.sound;
    el.play().catch(() => {});
    el.onended = () => el.remove();
    document.body.appendChild(el);
  }

  playClick () {
    this.playSound('ui/button.click');
  }

  // ── Volume / toggle ───────────────────────────────────────────────────────
  setMusicVolume (v) {
    this._volume.music = v / 100;
    if (this._musicEl) this._musicEl.volume = this._musicOn ? this._volume.music : 0;
  }

  setSoundVolume (v) {
    this._volume.sound = v / 100;
  }

  toggleMusic () {
    this._musicOn = !this._musicOn;
    if (this._musicEl) {
      if (this._musicOn) {
        this._musicEl.volume = this._volume.music;
      } else {
        this._musicEl.volume = 0;
      }
    }
    // If turning on and no track loaded yet, start playing
    if (this._musicOn && !this._musicEl) this.playMenuMusic();
    return this._musicOn;
  }

  get musicOn  () { return this._musicOn; }
  get musicVol () { return Math.round(this._volume.music * 100); }
  get soundVol () { return Math.round(this._volume.sound * 100); }
}
