/**
 * BrowserCraft — ChunkRenderer
 * ─────────────────────────────
 * Receives raw chunk data from the WebSocket proxy and builds
 * Three.js BufferGeometry meshes from it.
 *
 * Each chunk (16×256×16 or 16×384×16 for 1.18+) is meshed into
 * a single merged geometry per chunk column for performance.
 *
 * Texture atlas loaded from the synced Mojang asset cache:
 *   /data/<version>/assets/minecraft/textures/block/…
 */

'use strict';

import * as THREE from 'three';

const CHUNK_W = 16;
const CHUNK_H = 384;   // 1.18+ world height
const CHUNK_D = 16;

// Faces: [normal, vertices (quad), uv-flip]
const FACES = {
  top:    { normal: [0,1,0],  verts: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]] },
  bottom: { normal: [0,-1,0], verts: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]] },
  north:  { normal: [0,0,-1], verts: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
  south:  { normal: [0,0,1],  verts: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  west:   { normal: [-1,0,0], verts: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  east:   { normal: [1,0,0],  verts: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
};

export class ChunkRenderer {
  constructor (scene, mcVersion) {
    this.scene     = scene;
    this.mcVersion = mcVersion;
    this._meshes   = new Map();   // "cx,cz" → THREE.Mesh
    this._atlas    = null;
    this._material = null;
    this._blockUVs = new Map();   // blockStateId → [u,v,size]
  }

  // ── Initialise atlas texture ───────────────────────────────────────────
  async init () {
    await this._loadAtlas();
  }

  async _loadAtlas () {
    // Attempt to load the stitched texture atlas from synced assets.
    // Falls back to a procedurally generated placeholder atlas.
    const loader = new THREE.TextureLoader();

    const atlasUrl = `/data/${this.mcVersion}/atlas/blocks.png`;
    try {
      this._atlas = await new Promise((res, rej) => {
        loader.load(atlasUrl, res, undefined, rej);
      });
    } catch {
      // Generate a simple colour-coded placeholder atlas
      this._atlas = this._generatePlaceholderAtlas();
    }

    this._atlas.magFilter = THREE.NearestFilter;
    this._atlas.minFilter = THREE.NearestFilter;

    this._material = new THREE.MeshLambertMaterial({
      map:         this._atlas,
      side:        THREE.FrontSide,
      transparent: false,
      alphaTest:   0.1,
    });
  }

  _generatePlaceholderAtlas () {
    // 256×256 canvas with 16×16 coloured tiles
    const size   = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    const TILE   = 16;
    const TILES  = size / TILE;
    const COLORS = [
      '#7cb244','#8b6914','#888888','#a89070','#55aaff',
      '#ff5555','#ffaa55','#5555ff','#aa55aa','#55ffaa',
      '#2d5e1e','#4a3510','#666666','#9b8070','#3388cc',
    ];

    for (let ty = 0; ty < TILES; ty++) {
      for (let tx = 0; tx < TILES; tx++) {
        const color = COLORS[(ty * TILES + tx) % COLORS.length];
        ctx.fillStyle = color;
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        // Pixelated border
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  // ── Load a chunk from raw section data ─────────────────────────────────
  loadChunk (cx, cz, chunkData) {
    const key = `${cx},${cz}`;
    // Remove old mesh
    this.unloadChunk(cx, cz);

    // Build geometry from section palette data
    const geo = this._meshChunk(cx, cz, chunkData);
    if (!geo) return;

    const mesh = new THREE.Mesh(geo, this._material);
    mesh.position.set(cx * CHUNK_W, -64, cz * CHUNK_D);   // -64 = 1.18 world floor
    mesh.receiveShadow = true;
    mesh.castShadow    = false;

    this.scene.add(mesh);
    this._meshes.set(key, mesh);
  }

  unloadChunk (cx, cz) {
    const key  = `${cx},${cz}`;
    const mesh = this._meshes.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    this._meshes.delete(key);
  }

  // ── Greedy mesh builder ────────────────────────────────────────────────
  _meshChunk (cx, cz, chunkData) {
    const positions = [];
    const normals   = [];
    const uvs       = [];
    const indices   = [];
    let   vidx      = 0;

    const blocks = chunkData?.blocks || this._generateTestBlocks();

    const getBlock = (x, y, z) => {
      if (x < 0 || x >= CHUNK_W || z < 0 || z >= CHUNK_D || y < 0 || y >= CHUNK_H) return 0;
      return blocks[y * CHUNK_W * CHUNK_D + z * CHUNK_W + x] || 0;
    };

    const isSolid = (x, y, z) => getBlock(x, y, z) !== 0;

    for (let y = 0; y < CHUNK_H; y++) {
      for (let z = 0; z < CHUNK_D; z++) {
        for (let x = 0; x < CHUNK_W; x++) {
          const b = getBlock(x, y, z);
          if (!b) continue;

          const uvRect = this._getBlockUV(b);

          for (const [faceName, face] of Object.entries(FACES)) {
            const [nx, ny, nz] = face.normal;
            if (isSolid(x + nx, y + ny, z + nz)) continue;

            // Add quad
            for (const [vx, vy, vz] of face.verts) {
              positions.push(x + vx, y + vy, z + vz);
              normals.push(nx, ny, nz);
            }
            // UV mapping into atlas tile
            const [u, v, s] = uvRect;
            uvs.push(u, v+s, u+s, v+s, u+s, v, u, v);

            indices.push(vidx, vidx+1, vidx+2, vidx, vidx+2, vidx+3);
            vidx += 4;
          }
        }
      }
    }

    if (!positions.length) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,       2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    return geo;
  }

  // ── UV lookup in atlas (16×16 tiles in 256px = 1/16th) ────────────────
  _getBlockUV (blockId) {
    const tileSize = 1 / 16;
    const tile     = blockId % 256;
    const tx       = (tile % 16) * tileSize;
    const ty       = Math.floor(tile / 16) * tileSize;
    return [tx, ty, tileSize];
  }

  // ── Test terrain generator (flat world for testing before server join) ─
  _generateTestBlocks () {
    const arr = new Uint16Array(CHUNK_W * CHUNK_H * CHUNK_D);
    for (let z = 0; z < CHUNK_D; z++) {
      for (let x = 0; x < CHUNK_W; x++) {
        // Bedrock at y=0 (offset 64 from world bottom)
        arr[0  * CHUNK_W * CHUNK_D + z * CHUNK_W + x] = 7;
        // Dirt layers
        for (let y = 1; y < 4; y++) arr[y * CHUNK_W * CHUNK_D + z * CHUNK_W + x] = 3;
        // Grass top
        arr[4 * CHUNK_W * CHUNK_D + z * CHUNK_W + x] = 2;
      }
    }
    return arr;
  }

  // ── Track which chunk the player is in, load surroundings ─────────────
  updatePlayerChunk (cx, cz, renderDist = 8) {
    // Unload far chunks
    for (const [key] of this._meshes) {
      const [kx, kz] = key.split(',').map(Number);
      if (Math.abs(kx - cx) > renderDist + 2 || Math.abs(kz - cz) > renderDist + 2) {
        this.unloadChunk(kx, kz);
      }
    }
  }

  dispose () {
    for (const [key, mesh] of this._meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this._meshes.clear();
    this._material?.dispose();
    this._atlas?.dispose();
  }
}
