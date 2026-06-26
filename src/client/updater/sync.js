/**
 * BrowserCraft — Auto-Update & Registry Sync Engine
 * ─────────────────────────────────────────────────
 * Polls piston-meta.mojang.com on startup (and on a configurable interval).
 * When a new MC version is detected it:
 *   1. Downloads the version manifest JSON
 *   2. Downloads the asset index  (textures, sounds, lang files)
 *   3. Downloads only NEW / changed assets (diff against local cache)
 *   4. Extracts registry data from the client jar reports:
 *        blocks.json  → minecraft:stone, minecraft:armadillo …
 *        entities.json
 *        items.json
 *        biomes.json
 *        damage_types.json
 *   5. Writes everything to  /public/data/<version>/
 *   6. Emits an "update-complete" event so the UI can notify the player
 *
 * Run standalone:  node src/client/updater/sync.js
 * Called by server on boot automatically.
 */

'use strict';

const fs          = require('fs-extra');
const path        = require('path');
const fetch       = require('node-fetch');
const { EventEmitter } = require('events');

// ─── Mojang CDN endpoints ─────────────────────────────────────────────────────
const MANIFEST_URL  = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RESOURCES_URL = 'https://resources.download.minecraft.net';   // + /<first2>/<hash>
const DATA_ROOT     = path.join(__dirname, '..', '..', '..', 'public', 'data');
const STATE_FILE    = path.join(DATA_ROOT, 'sync-state.json');

// ─── How often to check for updates (ms) ─────────────────────────────────────
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

class BrowserCraftUpdater extends EventEmitter {
  constructor () {
    super();
    this.state = { installedVersion: null, lastCheck: 0 };
  }

  // ── Load persisted state ──────────────────────────────────────────────────
  async loadState () {
    try {
      this.state = await fs.readJson(STATE_FILE);
    } catch {
      this.state = { installedVersion: null, lastCheck: 0 };
    }
  }

  async saveState () {
    await fs.ensureDir(DATA_ROOT);
    await fs.writeJson(STATE_FILE, this.state, { spaces: 2 });
  }

  // ── Fetch the top-level version manifest ─────────────────────────────────
  async fetchManifest () {
    this.emit('status', 'Fetching version manifest…');
    const res  = await fetch(MANIFEST_URL);
    const data = await res.json();
    return data;   // { latest: { release, snapshot }, versions: [ … ] }
  }

  // ── Fetch a specific version's package JSON ───────────────────────────────
  async fetchVersionPackage (versionEntry) {
    this.emit('status', `Fetching package for ${versionEntry.id}…`);
    const res  = await fetch(versionEntry.url);
    return res.json();
    /* Shape:
     {
       id, type, releaseTime,
       assetIndex: { id, sha1, url },
       assets: "1.21",
       libraries: [ { name, downloads: { artifact: { url, sha1, path } } } ],
       downloads: {
         client:        { url, sha1 },
         client_mappings: { url, sha1 },
         server:        { url, sha1 },
       },
       logging: …
     }
    */
  }

  // ── Fetch the asset index (maps asset names → sha1 hashes) ───────────────
  async fetchAssetIndex (pkg) {
    this.emit('status', `Fetching asset index ${pkg.assetIndex.id}…`);
    const res  = await fetch(pkg.assetIndex.url);
    return res.json();
    /* Shape:  { objects: { "minecraft/sounds/ambient/cave/cave1.ogg": { hash, size }, … } } */
  }

  // ── Download a single asset by hash if not already cached ─────────────────
  async downloadAsset (hash, destDir) {
    const prefix  = hash.slice(0, 2);
    const url     = `${RESOURCES_URL}/${prefix}/${hash}`;
    const dest    = path.join(destDir, prefix, hash);

    if (await fs.pathExists(dest)) return false; // already cached

    await fs.ensureDir(path.dirname(dest));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Asset download failed: ${url} → ${res.status}`);
    const buf = await res.buffer();
    await fs.writeFile(dest, buf);
    return true; // newly downloaded
  }

  // ── Download the client.jar and extract data-generator reports ────────────
  // NOTE: In browser context we skip the jar — instead we pull the pre-generated
  // minecraft-data package (PrismarineJS/minecraft-data) which already ships
  // blocks.json, items.json, entities.json, biomes.json for every version.
  // This avoids needing Java in CI. You can swap this for the real jar if needed.
  async syncRegistries (versionId, destDir) {
    this.emit('status', `Syncing registries for ${versionId} via minecraft-data…`);

    // minecraft-data is already a dependency — just copy the JSON files out
    let mcData;
    try {
      mcData = require(`minecraft-data/data/${versionId}`);
    } catch {
      // Fall back to nearest known version
      const minecraftData = require('minecraft-data');
      mcData = minecraftData(versionId);
    }

    const registryDir = path.join(destDir, 'registries');
    await fs.ensureDir(registryDir);

    const exports = {
      'blocks.json':       mcData.blocksArray,
      'items.json':        mcData.itemsArray,
      'entities.json':     mcData.entitiesArray,
      'biomes.json':       mcData.biomesArray,
      'effects.json':      mcData.effectsArray,
      'enchantments.json': mcData.enchantmentsArray,
      'recipes.json':      mcData.recipesArray,
      'version.json':      mcData.version,
    };

    for (const [file, data] of Object.entries(exports)) {
      if (data) {
        await fs.writeJson(path.join(registryDir, file), data, { spaces: 2 });
      }
    }

    this.emit('status', `Registries written → ${registryDir}`);
    return registryDir;
  }

  // ── Main entry: check for updates and download if needed ─────────────────
  async check ({ force = false, targetChannel = 'release' } = {}) {
    await this.loadState();

    const now = Date.now();
    if (!force && (now - this.state.lastCheck) < CHECK_INTERVAL_MS) {
      this.emit('status', 'Update check skipped — checked recently.');
      return { upToDate: true, version: this.state.installedVersion };
    }

    const manifest     = await this.fetchManifest();
    const latestId     = manifest.latest[targetChannel];  // 'release' | 'snapshot'
    this.state.lastCheck = now;

    this.emit('manifest', { latest: manifest.latest, total: manifest.versions.length });

    if (!force && this.state.installedVersion === latestId) {
      await this.saveState();
      this.emit('status', `Already on latest: ${latestId}`);
      return { upToDate: true, version: latestId };
    }

    // Find the full version entry in the manifest
    const versionEntry = manifest.versions.find(v => v.id === latestId);
    if (!versionEntry) throw new Error(`Version ${latestId} not found in manifest`);

    const pkg        = await this.fetchVersionPackage(versionEntry);
    const assetIndex = await this.fetchAssetIndex(pkg);

    const versionDir  = path.join(DATA_ROOT, latestId);
    const assetsDir   = path.join(versionDir, 'assets');
    await fs.ensureDir(assetsDir);

    // Save the raw asset index for the renderer
    await fs.writeJson(path.join(versionDir, 'asset-index.json'), assetIndex, { spaces: 2 });
    await fs.writeJson(path.join(versionDir, 'version-package.json'), pkg, { spaces: 2 });

    // Download new/changed assets
    const objects  = Object.values(assetIndex.objects);
    let downloaded = 0;
    let skipped    = 0;

    this.emit('status', `Syncing ${objects.length} assets…`);

    // Download in batches of 20 concurrent
    const BATCH = 20;
    for (let i = 0; i < objects.length; i += BATCH) {
      const batch = objects.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(({ hash }) => this.downloadAsset(hash, assetsDir))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') r.value ? downloaded++ : skipped++;
        else this.emit('warn', r.reason?.message);
      }
      const pct = Math.floor(((i + BATCH) / objects.length) * 100);
      this.emit('progress', { pct: Math.min(pct, 100), downloaded, skipped, total: objects.length });
    }

    // Sync block/entity/item registries
    await this.syncRegistries(latestId, versionDir);

    // Persist new version
    this.state.installedVersion = latestId;
    await this.saveState();

    const result = { upToDate: false, version: latestId, downloaded, skipped };
    this.emit('update-complete', result);
    return result;
  }

  // ── Convenience: start periodic background checking ───────────────────────
  startDaemon (opts = {}) {
    this.check(opts).catch(e => this.emit('error', e));
    setInterval(() => {
      this.check(opts).catch(e => this.emit('error', e));
    }, CHECK_INTERVAL_MS);
  }
}

// ── CLI entrypoint ─────────────────────────────────────────────────────────
if (require.main === module) {
  const updater = new BrowserCraftUpdater();

  updater.on('status',          msg  => console.log(`[UPDATER] ${msg}`));
  updater.on('warn',            msg  => console.warn(`[UPDATER WARN] ${msg}`));
  updater.on('progress',        p    => process.stdout.write(`\r[UPDATER] ${p.pct}% (${p.downloaded} new, ${p.skipped} cached / ${p.total} total)`));
  updater.on('manifest',        m    => console.log(`[UPDATER] Manifest: release=${m.latest.release} snapshot=${m.latest.snapshot} (${m.total} versions)`));
  updater.on('update-complete', res  => console.log(`\n[UPDATER] ✔ Done! version=${res.version} downloaded=${res.downloaded}`));
  updater.on('error',           err  => console.error(`[UPDATER ERROR]`, err));

  updater.check({ force: process.argv.includes('--force') })
    .then(r => {
      if (r.upToDate) console.log(`[UPDATER] Already up to date: ${r.version}`);
    })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = BrowserCraftUpdater;
