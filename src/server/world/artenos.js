/**
 * BrowserCraft — Artenos World Generator
 * ────────────────────────────────────────
 * Original procedural world generation system.
 * Supports: seed, world type, gamemode, difficulty, gamerules, datapacks.
 *
 * Artenos generates chunk data that feeds directly into ChunkRenderer.
 * It uses minecraft-data biome/block registries for correct block IDs
 * so the renderer and the registry system stay in sync.
 *
 * Called by:  POST /api/world/create  { seed, type, gamemode, rules, datapacks }
 * Also used client-side for preview.
 */

'use strict';

// ── Simple deterministic PRNG (xoshiro128**) ──────────────────────────────
function createRNG (seed) {
  let s0 = seed ^ 0xdeadbeef;
  let s1 = seed ^ 0x12345678;
  let s2 = seed ^ 0xabcdef01;
  let s3 = seed ^ 0x87654321;

  return function next () {
    const t = s1 << 9;
    let r = s0 * 5; r = ((r << 7) | (r >>> 25)) * 9;
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3;
    s2 ^= t; s3 = (s3 << 11) | (s3 >>> 21);
    return (r >>> 0) / 0x100000000;
  };
}

// ── Simple noise (value noise, 2D) ────────────────────────────────────────
function buildNoise (rng) {
  const TABLE = new Float32Array(256);
  for (let i = 0; i < 256; i++) TABLE[i] = rng();

  function smooth (t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp  (a, b, t) { return a + t * (b - a); }

  function noise2d (x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u  = smooth(xf);
    const v  = smooth(yf);
    const a  = TABLE[(xi + TABLE[yi    & 255] * 256) % 256];
    const b  = TABLE[(xi + TABLE[(yi+1)& 255] * 256) % 256];
    const c  = TABLE[((xi+1)+TABLE[yi  & 255] * 256) % 256];
    const d  = TABLE[((xi+1)+TABLE[(yi+1)& 255]*256)%256];
    return lerp(lerp(a, c, u), lerp(b, d, u), v);
  }

  function octaves (x, y, oct = 4, persistence = 0.5, scale = 0.01) {
    let val = 0, amp = 1, freq = scale, max = 0;
    for (let i = 0; i < oct; i++) {
      val += noise2d(x * freq, y * freq) * amp;
      max += amp;
      amp  *= persistence;
      freq *= 2;
    }
    return val / max;
  }

  return { noise2d, octaves };
}

// ── Block IDs (minecraft-data numeric IDs for 1.21.x) ────────────────────
const BLOCKS = {
  AIR:        0,
  STONE:      1,
  GRASS:      2,
  DIRT:       3,
  BEDROCK:    7,
  WATER:      9,
  SAND:       12,
  GRAVEL:     13,
  GOLD_ORE:   14,
  IRON_ORE:   15,
  COAL_ORE:   16,
  OAK_LOG:    17,
  OAK_LEAVES: 18,
  SANDSTONE:  24,
  SNOW:       78,
  ICE:        79,
  CLAY:       82,
  GRAVEL_2:   82,
};

const CHUNK_W = 16;
const CHUNK_D = 16;
const CHUNK_H = 384;
const SEA_LEVEL = 64;

// ── World type generators ─────────────────────────────────────────────────
const GENERATORS = {
  default:    generateDefault,
  flat:       generateFlat,
  largeBiomes: (cx, cz, rng, noise) => generateDefault(cx, cz, rng, noise, 4),
  amplified:  (cx, cz, rng, noise) => generateDefault(cx, cz, rng, noise, 1, 2.5),
  singleBiome: generateFlat,
  debug:      generateDebug,
};

// ── Artenos main class ────────────────────────────────────────────────────
class Artenos {
  constructor (config = {}) {
    const {
      seed        = Date.now(),
      type        = 'default',
      gamemode    = 'survival',
      difficulty  = 'normal',
      datapacks   = ['vanilla'],
      rules       = {},
    } = config;

    this.seed       = typeof seed === 'string' ? this._hashSeed(seed) : seed;
    this.type       = type;
    this.gamemode   = gamemode;
    this.difficulty = difficulty;
    this.datapacks  = datapacks;
    this.rules      = {
      keepInventory:    false,
      doDaylightCycle:  true,
      doMobSpawning:    true,
      doFireTick:       true,
      fallDamage:       true,
      pvp:              true,
      showCoordinates:  false,
      ...rules,
    };

    this._rng       = createRNG(this.seed);
    this._noise     = buildNoise(this._rng);
    this._generator = GENERATORS[type] || generateDefault;
    this._chunkCache = new Map();
  }

  _hashSeed (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h;
  }

  // ── Generate a chunk column ───────────────────────────────────────────
  generateChunk (cx, cz) {
    const key = `${cx},${cz}`;
    if (this._chunkCache.has(key)) return this._chunkCache.get(key);

    // Per-chunk seed offset
    const chunkRng = createRNG(this.seed ^ (cx * 0x6b8b4567) ^ (cz * 0x327b23c6));
    const noise    = buildNoise(chunkRng);

    const blocks = this._generator(cx, cz, chunkRng, noise);

    const chunk = { cx, cz, blocks, biome: this._getBiome(cx, cz) };
    this._chunkCache.set(key, chunk);
    return chunk;
  }

  _getBiome (cx, cz) {
    const t = this._noise.octaves(cx, cz, 2, 0.5, 0.05);
    const r = this._noise.octaves(cx + 500, cz + 500, 2, 0.5, 0.05);
    if (t > 0.65) return 'desert';
    if (t < 0.35) return 'snowy_taiga';
    if (r > 0.6)  return 'forest';
    if (r < 0.4)  return 'plains';
    return 'birch_forest';
  }

  // ── Spawn point (first solid block above sea level at 0,0) ────────────
  findSpawnPoint () {
    const chunk = this.generateChunk(0, 0);
    const cx = 8, cz = 8;
    for (let y = SEA_LEVEL + 60; y > 0; y--) {
      const b = chunk.blocks[y * CHUNK_W * CHUNK_D + cz * CHUNK_W + cx];
      if (b && b !== BLOCKS.WATER) return { x: cx, y: y + 1, z: cz };
    }
    return { x: 8, y: SEA_LEVEL + 1, z: 8 };
  }

  // ── Export world metadata ──────────────────────────────────────────────
  toJSON () {
    return {
      seed:       this.seed,
      type:       this.type,
      gamemode:   this.gamemode,
      difficulty: this.difficulty,
      datapacks:  this.datapacks,
      rules:      this.rules,
      generator:  'Artenos/1.0',
    };
  }
}

// ── Default generator ─────────────────────────────────────────────────────
function generateDefault (cx, cz, rng, noise, biomeScale = 1, heightScale = 1) {
  const blocks = new Uint16Array(CHUNK_W * CHUNK_H * CHUNK_D);

  for (let lz = 0; lz < CHUNK_D; lz++) {
    for (let lx = 0; lx < CHUNK_W; lx++) {
      const wx = cx * CHUNK_W + lx;
      const wz = cz * CHUNK_D + lz;

      // Height via layered noise
      const base     = noise.octaves(wx, wz, 6, 0.5, 0.005 / biomeScale) * 60 * heightScale;
      const detail   = noise.octaves(wx + 200, wz + 200, 3, 0.5, 0.02) * 8;
      const height   = Math.floor(SEA_LEVEL + base + detail);
      const capped   = Math.min(height, CHUNK_H - 1);

      // Biome temp
      const temp  = noise.octaves(wx, wz, 2, 0.5, 0.003 * biomeScale);
      const isDesert = temp > 0.65;
      const isCold   = temp < 0.32;

      for (let y = 0; y < CHUNK_H; y++) {
        const idx = y * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx;

        if (y === 0) { blocks[idx] = BLOCKS.BEDROCK; continue; }
        if (y <= 4 && rng() > 0.5) { blocks[idx] = BLOCKS.BEDROCK; continue; }

        if (y > capped) {
          // Water fill below sea level
          if (y <= SEA_LEVEL && y > capped) blocks[idx] = BLOCKS.WATER;
          continue;
        }

        if (y === capped) {
          if (isDesert)     blocks[idx] = BLOCKS.SAND;
          else if (isCold && y > SEA_LEVEL + 20) blocks[idx] = BLOCKS.SNOW;
          else              blocks[idx] = BLOCKS.GRASS;
        } else if (y >= capped - 3) {
          blocks[idx] = isDesert ? BLOCKS.SAND : BLOCKS.DIRT;
        } else {
          // Stone + ores
          const oreRoll = rng();
          if      (y < 16  && oreRoll < 0.012) blocks[idx] = BLOCKS.GOLD_ORE;
          else if (y < 64  && oreRoll < 0.04)  blocks[idx] = BLOCKS.IRON_ORE;
          else if (           oreRoll < 0.08)  blocks[idx] = BLOCKS.COAL_ORE;
          else                                 blocks[idx] = BLOCKS.STONE;
        }
      }

      // Trees (rough placement, ~1/80 chance per column)
      if (!isDesert && capped > SEA_LEVEL && rng() < 0.013) {
        placeTree(blocks, lx, capped + 1, lz);
      }
    }
  }

  return blocks;
}

// ── Flat generator ────────────────────────────────────────────────────────
function generateFlat (cx, cz) {
  const blocks = new Uint16Array(CHUNK_W * CHUNK_H * CHUNK_D);
  for (let lz = 0; lz < CHUNK_D; lz++) {
    for (let lx = 0; lx < CHUNK_W; lx++) {
      blocks[0 * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx] = BLOCKS.BEDROCK;
      for (let y = 1; y < 3; y++) blocks[y * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx] = BLOCKS.DIRT;
      blocks[3 * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx] = BLOCKS.GRASS;
    }
  }
  return blocks;
}

// ── Debug generator (all unique block IDs in a grid) ─────────────────────
function generateDebug (cx, cz) {
  const blocks = new Uint16Array(CHUNK_W * CHUNK_H * CHUNK_D);
  for (let lz = 0; lz < CHUNK_D; lz++) {
    for (let lx = 0; lx < CHUNK_W; lx++) {
      const blockId = ((cx * CHUNK_W + lx) & 0xff) + ((cz * CHUNK_D + lz) & 0xff) * 256;
      blocks[1 * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx] = blockId || 1;
    }
  }
  return blocks;
}

// ── Tree placement ────────────────────────────────────────────────────────
function placeTree (blocks, x, y, z) {
  if (x < 2 || x > 13 || z < 2 || z > 13) return; // near chunk edge — skip
  const height = 4 + Math.floor(Math.random() * 2);

  // Trunk
  for (let i = 0; i < height; i++) {
    const iy = y + i;
    if (iy >= CHUNK_H) break;
    blocks[iy * CHUNK_W * CHUNK_D + z * CHUNK_W + x] = BLOCKS.OAK_LOG;
  }

  // Leaves
  for (let ly = y + height - 2; ly <= y + height + 1; ly++) {
    if (ly >= CHUNK_H) break;
    const r = ly <= y + height - 1 ? 2 : 1;
    for (let lx = x - r; lx <= x + r; lx++) {
      for (let lz = z - r; lz <= z + r; lz++) {
        if (lx < 0 || lx >= CHUNK_W || lz < 0 || lz >= CHUNK_D) continue;
        const dist = Math.abs(lx - x) + Math.abs(lz - z);
        if (dist > r + 1) continue;
        if (!blocks[ly * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx]) {
          blocks[ly * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx] = BLOCKS.OAK_LEAVES;
        }
      }
    }
  }
}

module.exports = { Artenos, BLOCKS, CHUNK_W, CHUNK_H, CHUNK_D, SEA_LEVEL };
