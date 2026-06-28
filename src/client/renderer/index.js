/**
 * BrowserCraft — WebGL Renderer Bootstrap
 * ─────────────────────────────────────────
 * Initialises Three.js + prismarine-viewer for the in-game view.
 * Called once the player joins a world or server.
 *
 * Usage:
 *   import { BrowserCraftRenderer } from './renderer/index.js';
 *   const renderer = new BrowserCraftRenderer(canvas);
 *   await renderer.init(mcVersion);
 *   renderer.start();
 */

'use strict';

import * as THREE from 'three';
import { ChunkRenderer } from './ChunkRenderer.js';
import { HUD }           from './HUD.js';

export class BrowserCraftRenderer {
  constructor (canvas) {
    this.canvas = canvas;
    this.scene       = null;
    this.camera      = null;
    this.renderer    = null;
    this.chunks      = null;   // ChunkRenderer
    this.hud         = null;   // HUD overlay
    this._running    = false;
    this._rafId      = null;

    // Player view state
    this.yaw   = 0;
    this.pitch = 0;
    this.pos   = new THREE.Vector3(0, 64, 0);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  async init (mcVersion = '1.21.4') {
    // Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // sky blue
    this.scene.fog = new THREE.Fog(0x87ceeb, 128, 256);

    // Camera (first-person, 70° FOV)
    this.camera = new THREE.PerspectiveCamera(
      70,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.05,
      512,
    );
    this.camera.position.copy(this.pos);

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas:    this.canvas,
      antialias: false,      // off for pixelated MC look
      alpha:     false,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

    // Lighting
    this._setupLighting();

    // Chunk renderer
    this.chunks = new ChunkRenderer(this.scene, mcVersion);
    await this.chunks.init();

    // HUD
    this.hud = new HUD(document.getElementById('hud'));
    this.hud.init();

    // Resize handler
    window.addEventListener('resize', () => this._onResize());

    console.log('[Renderer] Initialised — Three.js', THREE.REVISION, 'MC', mcVersion);
  }

  // ── Lighting ──────────────────────────────────────────────────────────────
  _setupLighting () {
    // Ambient — sky light simulation
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Sun directional light
    const sun = new THREE.DirectionalLight(0xfff5cc, 1.0);
    sun.position.set(200, 400, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 1024;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -256;
    sun.shadow.camera.right = sun.shadow.camera.top   =  256;
    this.scene.add(sun);
    this.sun = sun;

    // Hemisphere light (sky vs ground)
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a3728, 0.4);
    this.scene.add(hemi);
  }

  // ── Camera look ───────────────────────────────────────────────────────────
  setLook (yaw, pitch) {
    this.yaw   = yaw;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  // ── Player position ───────────────────────────────────────────────────────
  setPosition (x, y, z) {
    this.pos.set(x, y + 1.62, z);   // +1.62 = eye height
    this.camera.position.copy(this.pos);

    // Trigger chunk loading around player
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    this.chunks?.updatePlayerChunk(cx, cz);

    // Move sun with player
    if (this.sun) {
      this.sun.position.set(x + 200, 400, z + 100);
      this.sun.target.position.set(x, 0, z);
      this.sun.target.updateMatrixWorld();
    }
  }

  // ── Day/night cycle ───────────────────────────────────────────────────────
  setTimeOfDay (ticks) {
    // ticks: 0 = dawn, 6000 = noon, 12000 = dusk, 18000 = midnight
    const t        = (ticks % 24000) / 24000;
    const angle    = t * Math.PI * 2 - Math.PI / 2;
    const sinAngle = Math.sin(angle);

    // Sky colour
    const nightColor = new THREE.Color(0x0a0a1a);
    const dayColor   = new THREE.Color(0x87ceeb);
    const skyColor   = dayColor.clone().lerp(nightColor, Math.max(0, -sinAngle));
    this.scene.background = skyColor;
    this.scene.fog.color  = skyColor;

    // Sun intensity
    if (this.sun) {
      this.sun.intensity = Math.max(0, sinAngle);
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  start () {
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      this._rafId = requestAnimationFrame(loop);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop () {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  // ── Receive a chunk packet from the WS proxy ──────────────────────────────
  onChunkData (x, z, chunkData) {
    this.chunks?.loadChunk(x, z, chunkData);
  }

  onUnloadChunk (x, z) {
    this.chunks?.unloadChunk(x, z);
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  _onResize () {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  dispose () {
    this.stop();
    this.chunks?.dispose();
    this.hud?.destroy();
    this.renderer?.dispose();
    window.removeEventListener('resize', this._onResize);
  }
}
