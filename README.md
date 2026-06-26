# Eaglercraft Compability Layer/Minecraft: Web Edition — Architecture Blueprint

## Overview

Eaglercraft Compability Layer is a fully original and legal Minecraft-protocol browser client.
No decompiled Mojang code. Your own copyright. Uses:
- **Mojang's public CDN** for asset/data downloads (legal — same as the launcher)
- **PrismarineJS libraries** for protocol parsing & rendering (MIT licensed)
- **Your own renderer, UI, game logic** — all original code

---

## Directory Structure

```
browsercraft/
├── package.json
├── webpack.config.js
├── .env                          # PORT, AUTH_CLIENT_ID, etc.
│
├── src/
│   ├── server/
│   │   └── index.js              ← Express + WS proxy + updater boot
│   │
│   └── client/
│       ├── browser-entry.js      ← Webpack entry point
│       │
│       ├── screens/
│       │   ├── MainMenu.js       ← Main menu UI (panorama, buttons, splash)
│       │   ├── OptionsScreen.js  ← All settings (vol, FOV, render dist, …)
│       │   ├── WorldSelect.js    ← Singleplayer world list + creation
│       │   └── MultiplayerScreen.js ← Server list, add server, ping
│       │
│       ├── renderer/
│       │   ├── index.js          ← WebGL bootstrap (Three.js + prismarine-viewer)
│       │   ├── ChunkRenderer.js  ← Chunk meshing + draw
│       │   ├── EntityRenderer.js ← Mob/player models
│       │   └── HUD.js            ← Hotbar, health, hunger, XP bar
│       │
│       ├── audio/
│       │   └── AudioManager.js   ← Menu music, sound effects, volume
│       │
│       ├── registry/
│       │   └── index.js          ← minecraft:* block/item/entity lookups
│       │
│       └── updater/
│           ├── sync.js           ← Node.js: polls Mojang, downloads assets
│           └── UpdaterClient.js  ← Browser: REST client for /api/updater/*
│
└── public/
    ├── index.html                ← Shell HTML (loads bundle.js)
    ├── bundle.js                 ← Webpack output
    └── data/
        ├── sync-state.json       ← { installedVersion, lastCheck }
        └── <mc-version>/
            ├── version-package.json
            ├── asset-index.json
            ├── assets/
            │   └── <xx>/<hash>   ← textures, sounds, lang files
            └── registries/
                ├── blocks.json   ← minecraft:stone, minecraft:armadillo, …
                ├── items.json
                ├── entities.json
                ├── biomes.json
                ├── effects.json
                └── enchantments.json
```

---

## Data Flow

### 1. Auto-Update Pipeline

```
STARTUP
  │
  ▼
GET piston-meta.mojang.com/mc/game/version_manifest_v2.json
  │   { latest: { release: "1.21.4", snapshot: "25w…" }, versions: […] }
  │
  ▼ compare installedVersion vs latest.release
  │
  ├─ SAME → skip
  │
  └─ DIFFERENT →
       GET version package URL  (from manifest.versions[i].url)
         └─ GET assetIndex.url  →  { objects: { path: { hash, size } } }
              └─ for each hash: GET resources.download.minecraft.net/<xx>/<hash>
                   → save to public/data/<ver>/assets/<xx>/<hash>
       Pull registries from minecraft-data npm package
         → public/data/<ver>/registries/blocks.json  etc.
       Save sync-state.json { installedVersion: "1.21.4" }
       Emit "update-complete" → UI shows "✔ Updated to 1.21.4"
```

### 2. Registry Lookup

```
Client requests:  GET /api/registry/1.21.4/entity/minecraft:armadillo
  │
  ▼
Server loads public/data/1.21.4/registries/entities.json (cached in RAM)
  │
  ▼
Returns: {
  "id": 163,
  "name": "armadillo",
  "displayName": "Armadillo",
  "width": 0.7,
  "height": 0.6,
  "type": "passive",
  …
}
```

### 3. WebSocket ↔ TCP Proxy

```
Browser
  │  WebSocket  ws://localhost:8080/proxy
  │
  ▼
BrowserCraft Server (Node.js)
  │  { host, port, version, username }  ← first WS frame = handshake
  │
  ▼
minecraft-protocol.createClient({ host, port, version, auth: 'offline' })
  │  TCP
  ▼
Real Minecraft Java Server (mc.hypixel.net, localhost, etc.)

Packets flow both ways:
  MC → server → WS binary frame → browser renderer
  browser → WS JSON { name, params } → server → mc.write(name, params)
```

### 4. Artenos World Generation

```
WorldSelect screen → "Create New World"
  │  { seed, type, gamemode, difficulty, datapacks, rules }
  ▼
POST /api/world/create
  │
  ▼
Artenos generator (src/server/world/artenos.js)
  │  Uses minecraft-data biome/block registries
  ▼
flying-squid local server (optional) OR
  pure client-side procedural WebGL world
```

---

## Technologies & Licences

| Library | Purpose | Licence |
|---|---|---|
| `minecraft-protocol` | MC packet parse/serialise | MIT |
| `prismarine-auth` | Microsoft/Xbox live auth | MIT |
| `prismarine-viewer` | Three.js chunk renderer | MIT |
| `mineflayer` | High-level bot/client API | MIT |
| `prismarine-proxy` | WS↔TCP packet proxy | MIT |
| `minecraft-data` | Block/entity/item registries per version | MIT |
| `express` | HTTP server | MIT |
| `ws` | WebSocket server | MIT |
| Three.js | WebGL rendering | MIT |
| Webpack | Browser bundling | MIT |

---

## What Makes This "Yours"

1. **All UI code** — screens, menus, HUD, world select — written by you
2. **Renderer pipeline** — your ChunkRenderer, your shaders, your HUD layout
3. **Game logic layer** — physics, inventory, crafting hooks
4. **Artenos world generator** — your procedural world system
5. **Auto-update engine** — your polling & diff logic
6. Assets/data are fetched from Mojang's CDN (same as the official launcher —
   legally equivalent to a user running the official client)

---

## Next Steps (build order)

- [x] Main menu UI
- [ ] `src/client/screens/WorldSelect.js`
- [ ] `src/client/screens/MultiplayerScreen.js`  
- [ ] `src/client/renderer/index.js`  (Three.js + prismarine-viewer bootstrap)
- [ ] `src/client/renderer/ChunkRenderer.js`
- [ ] `src/client/renderer/HUD.js`
- [ ] `src/server/world/artenos.js`  (world gen)
- [ ] Microsoft auth flow (`prismarine-auth`)
- [ ] Hotbar, inventory, crafting
- [ ] Physics (player movement, collision)
