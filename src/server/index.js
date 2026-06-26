/**
 * BrowserCraft — Main Server
 * ──────────────────────────
 * • Serves the built browser client (public/)
 * • Exposes a REST API for the updater status & registry queries
 * • Runs a WebSocket ↔ TCP proxy so the browser can connect to real MC servers
 *
 * Start:  node src/server/index.js
 */

'use strict';

require('dotenv').config();
const express   = require('express');
const http      = require('http');
const path      = require('path');
const cors      = require('cors');
const { WebSocketServer } = require('ws');

const BrowserCraftUpdater = require('../client/updater/sync');
const { getRegistry }     = require('../client/registry');

const PORT       = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// ── Express app ────────────────────────────────────────────────────────────
const app  = express();
const httpServer = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ── REST: updater status ───────────────────────────────────────────────────
const updaterState = {
  status:   'idle',
  version:  null,
  progress: 0,
};

app.get('/api/updater/status', (_req, res) => {
  res.json(updaterState);
});

app.post('/api/updater/check', async (_req, res) => {
  try {
    const updater = new BrowserCraftUpdater();
    updater.on('status',   msg => { updaterState.status = msg; });
    updater.on('progress', p   => { updaterState.progress = p.pct; });
    const result = await updater.check({ force: true });
    updaterState.status  = result.upToDate ? 'up-to-date' : 'updated';
    updaterState.version = result.version;
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── REST: registry queries ─────────────────────────────────────────────────
// GET /api/registry/:version/blocks
// GET /api/registry/:version/block/minecraft:armadillo
// GET /api/registry/:version/entities
// GET /api/registry/:version/entity/minecraft:armadillo

app.get('/api/registry/:version/:category', async (req, res) => {
  try {
    const reg  = await getRegistry(req.params.version);
    const data = reg.dump(req.params.category);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/registry/:version/:category/:key(*)', async (req, res) => {
  try {
    const reg    = await getRegistry(req.params.version);
    const method = req.params.category.replace(/s$/, ''); // 'blocks' → 'block'
    const entry  = reg[method]?.(req.params.key);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── REST: version manifest proxy (avoids CORS issues from browser) ─────────
app.get('/api/versions', async (_req, res) => {
  try {
    const fetch = require('node-fetch');
    const r = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(502).json({ error: 'Could not reach Mojang' });
  }
});

// ── WebSocket ↔ TCP proxy ─────────────────────────────────────────────────
// The browser opens a WebSocket to ws://localhost:8080/proxy
// We forward all packets to/from the real MC server over TCP.
//
// Protocol negotiation message (first WS frame from client):
//   { host: "mc.hypixel.net", port: 25565, version: "1.21.4" }

const wss = new WebSocketServer({ server: httpServer, path: '/proxy' });

wss.on('connection', (ws) => {
  let mcClient = null;
  let mc       = null;

  ws.once('message', async (raw) => {
    let config;
    try { config = JSON.parse(raw.toString()); }
    catch { ws.close(1003, 'Bad handshake'); return; }

    const { host = 'localhost', port = 25565, version = '1.21.4', username = 'BrowserCraft' } = config;

    console.log(`[Proxy] Connecting to ${host}:${port} as ${username} (mc ${version})`);

    try {
      mc = require('minecraft-protocol');
      mcClient = mc.createClient({
        host,
        port: Number(port),
        version,
        username,
        auth: 'offline',   // swap to 'microsoft' + prismarine-auth for online mode
      });
    } catch (e) {
      ws.close(1011, `Protocol error: ${e.message}`);
      return;
    }

    // MC → Browser
    mcClient.on('raw', (buffer, meta) => {
      if (ws.readyState === ws.OPEN) {
        // Prefix with packet name so the browser client can route it
        const header = Buffer.from(JSON.stringify({ name: meta.name, state: meta.state }) + '\n');
        ws.send(Buffer.concat([header, buffer]));
      }
    });

    // Browser → MC
    ws.on('message', (data) => {
      try {
        // Client sends:  { name: 'chat', data: { message: 'hello' } }
        const { name, params } = JSON.parse(data.toString());
        if (mcClient && name) mcClient.write(name, params);
      } catch { /* non-JSON frames ignored */ }
    });

    mcClient.on('error', e => {
      console.error('[Proxy] MC error:', e.message);
      ws.close(1011, e.message);
    });

    mcClient.on('end', () => ws.close());
    ws.on('close', () => mcClient?.end('Browser disconnected'));
  });
});

// ── Boot sequence ─────────────────────────────────────────────────────────
async function boot () {
  // 1. Start auto-updater daemon (checks every hour)
  const updater = new BrowserCraftUpdater();
  updater.on('status',          m => console.log(`[Updater] ${m}`));
  updater.on('manifest',        m => console.log(`[Updater] Latest: release=${m.latest.release} snapshot=${m.latest.snapshot}`));
  updater.on('progress',        p => process.stdout.write(`\r[Updater] ${p.pct}%  `));
  updater.on('update-complete', r => {
    updaterState.version = r.version;
    updaterState.status  = 'up-to-date';
    console.log(`\n[Updater] ✔ ${r.version}  (${r.downloaded} new assets)`);
  });
  updater.on('error', e => console.error('[Updater] Error:', e.message));
  updater.startDaemon({ targetChannel: 'release' });

  // 2. Start HTTP server
  httpServer.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  BrowserCraft Server  →  http://localhost:${PORT}  ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
  });
}

boot().catch(e => { console.error('[Boot] Fatal:', e); process.exit(1); });

module.exports = { app, httpServer };
