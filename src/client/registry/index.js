/**
 * BrowserCraft — Registry
 * ───────────────────────
 * After the updater runs, this module loads the downloaded JSON registries
 * and exposes them as typed lookups.
 *
 * Usage (server or browser via webpack):
 *
 *   const Registry = require('./registry');
 *   const reg = new Registry('1.21.4');
 *   await reg.load();
 *
 *   reg.block('minecraft:stone')       // → { id, displayName, hardness, … }
 *   reg.entity('minecraft:armadillo')  // → { id, type, width, height, … }
 *   reg.item('minecraft:diamond_sword')// → { id, stackSize, enchantCategories, … }
 *   reg.biome('minecraft:desert')      // → { id, rainfall, temperature, … }
 *
 * The Registry auto-reloads when the updater emits 'update-complete'.
 */

'use strict';

const path = require('path');
const fs   = require('fs-extra');

const DATA_ROOT = path.join(__dirname, '..', '..', '..', 'public', 'data');

class Registry {
  constructor (version) {
    this.version   = version;
    this._blocks   = new Map();
    this._items    = new Map();
    this._entities = new Map();
    this._biomes   = new Map();
    this._effects  = new Map();
    this._enchants = new Map();
    this._loaded   = false;
  }

  get versionDir () {
    return path.join(DATA_ROOT, this.version, 'registries');
  }

  // ── Load all registries from disk ─────────────────────────────────────────
  async load () {
    const dir = this.versionDir;

    const [blocks, items, entities, biomes, effects, enchantments] = await Promise.all([
      this._readJson(dir, 'blocks.json'),
      this._readJson(dir, 'items.json'),
      this._readJson(dir, 'entities.json'),
      this._readJson(dir, 'biomes.json'),
      this._readJson(dir, 'effects.json'),
      this._readJson(dir, 'enchantments.json'),
    ]);

    this._index(this._blocks,   blocks,       b => `minecraft:${b.name}`);
    this._index(this._items,    items,        i => `minecraft:${i.name}`);
    this._index(this._entities, entities,     e => `minecraft:${e.name}`);
    this._index(this._biomes,   biomes,       b => `minecraft:${b.name}`);
    this._index(this._effects,  effects,      e => `minecraft:${e.name}`);
    this._index(this._enchants, enchantments, e => `minecraft:${e.name}`);

    this._loaded = true;
    console.log(`[Registry] Loaded for ${this.version}: blocks=${this._blocks.size} items=${this._items.size} entities=${this._entities.size}`);
    return this;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────
  async _readJson (dir, file) {
    try { return await fs.readJson(path.join(dir, file)); }
    catch { return []; }
  }

  _index (map, arr, keyFn) {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      map.set(keyFn(entry), entry);
      map.set(entry.id, entry);       // also index by numeric id
    }
  }

  _assertLoaded () {
    if (!this._loaded) throw new Error('Registry not loaded — call await registry.load() first');
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Look up a block by namespaced id (e.g. "minecraft:stone") or numeric id */
  block (key) {
    this._assertLoaded();
    return this._blocks.get(key) ?? null;
  }

  /** Look up an item */
  item (key) {
    this._assertLoaded();
    return this._items.get(key) ?? null;
  }

  /** Look up an entity (e.g. "minecraft:armadillo") */
  entity (key) {
    this._assertLoaded();
    return this._entities.get(key) ?? null;
  }

  /** Look up a biome */
  biome (key) {
    this._assertLoaded();
    return this._biomes.get(key) ?? null;
  }

  /** Look up a status effect */
  effect (key) {
    this._assertLoaded();
    return this._effects.get(key) ?? null;
  }

  /** Look up an enchantment */
  enchantment (key) {
    this._assertLoaded();
    return this._enchants.get(key) ?? null;
  }

  /** All blocks as an array */
  get blocks ()       { return [...this._blocks.values()].filter(b => typeof b.name === 'string'); }
  /** All items as an array */
  get items ()        { return [...this._items.values()].filter(i => typeof i.name === 'string'); }
  /** All entities as an array */
  get entities ()     { return [...this._entities.values()].filter(e => typeof e.name === 'string'); }
  /** All biomes as an array */
  get biomes ()       { return [...this._biomes.values()].filter(b => typeof b.name === 'string'); }

  /**
   * Returns a plain object with every registered minecraft:* key for a category.
   * Useful for exporting to the browser / debug panel.
   *
   * reg.dump('blocks')  →  { 'minecraft:stone': { … }, 'minecraft:grass_block': { … }, … }
   */
  dump (category = 'blocks') {
    const map = this[`_${category}`];
    if (!map) throw new Error(`Unknown category: ${category}`);
    const out = {};
    for (const [k, v] of map) {
      if (typeof k === 'string') out[k] = v;
    }
    return out;
  }
}

// ── Singleton factory ──────────────────────────────────────────────────────
const _cache = new Map();

/**
 * Get (or create + load) a Registry for a given Minecraft version.
 * Subsequent calls with the same version return the same instance.
 */
async function getRegistry (version) {
  if (_cache.has(version)) return _cache.get(version);
  const reg = new Registry(version);
  await reg.load();
  _cache.set(version, reg);
  return reg;
}

module.exports = { Registry, getRegistry };
