/**
 * BrowserCraft — Browser Entry Point
 * ────────────────────────────────────
 * Webpack entry → public/bundle.js
 * Boots the client: main menu, screen navigation, WS proxy connection.
 */

import { MainMenu }          from './screens/MainMenu.js';
import { OptionsScreen }     from './screens/OptionsScreen.js';
import { WorldSelect }       from './screens/WorldSelect.js';
import { MultiplayerScreen } from './screens/MultiplayerScreen.js';
import { AudioManager }      from './audio/AudioManager.js';
import { UpdaterClient }     from './updater/UpdaterClient.js';

// ── Global state ─────────────────────────────────────────────────────────────
window.BrowserCraft = {
  version:       typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.1.0',
  mcVersion:     null,
  currentScreen: null,
  audio:         null,
  ws:            null,
  game:          null,
};

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot () {
  const BC = window.BrowserCraft;

  // 1. Audio
  BC.audio = new AudioManager();
  BC.audio.playMenuMusic();

  // 2. Updater — fire and forget, updates mcVersion when done
  const updater = new UpdaterClient();
  updater.on('update-complete', (data) => {
    BC.mcVersion = data.version;
    console.log('[Client] Game data synced to MC', data.version);
  });
  updater.check().catch(() => {
    // Offline or server not running — fine for static deploy
    console.log('[Client] Updater offline — using cached data');
  });

  // 3. Build screen factory functions (avoids circular ref issues)
  const makeMenu = () => new MainMenu({
    onSingleplayer: () => showScreen(new WorldSelect({
      onBack:      () => showScreen(makeMenu()),
      onJoinWorld: (world) => handleJoinWorld(world),
    })),
    onMultiplayer: () => showScreen(new MultiplayerScreen({
      onBack:    () => showScreen(makeMenu()),
      onConnect: (host, port) => connectToServer(host, port),
    })),
    onOptions: () => showScreen(new OptionsScreen({
      audio:  BC.audio,
      onBack: () => showScreen(makeMenu()),
    })),
    onCheckUpdates: () => updater.check({ force: true }).catch(() => {}),
    onQuit:         () => showQuitDialog(),
  });

  showScreen(makeMenu());

  // Signal boot splash to hide
  if (typeof window.__bootDone === 'function') window.__bootDone();
}

// ── Screen management ─────────────────────────────────────────────────────────
function showScreen (screen) {
  const BC  = window.BrowserCraft;
  const app = document.getElementById('app');
  if (!app) return;

  // Destroy previous screen
  try { BC.currentScreen?.destroy?.(); } catch (e) {}

  // Clear container
  app.innerHTML = '';

  BC.currentScreen = screen;
  screen.mount(app);
}

// ── Singleplayer world join ───────────────────────────────────────────────────
function handleJoinWorld (world) {
  console.log('[Client] Joining world:', world.name, 'seed:', world.seed);
  // TODO: boot Artenos generator + renderer for singleplayer
  // For now show a placeholder
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="position:absolute;inset:0;background:#87ceeb;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:VT323,monospace;color:#fff;font-size:28px;text-shadow:2px 2px #000;">
      <div>Loading world: ${world.name}</div>
      <div style="font-size:16px;margin-top:8px;color:#ddd;">Seed: ${world.seed} · ${world.type} · ${world.gamemode}</div>
      <button onclick="location.reload()" style="margin-top:24px;font-family:VT323,monospace;font-size:22px;padding:10px 28px;background:#848484;border:none;border-top:3px solid #c8c8c8;border-left:3px solid #c8c8c8;border-right:3px solid #3f3f3f;border-bottom:3px solid #3f3f3f;color:#fff;cursor:pointer;">Back to Menu</button>
    </div>`;
}

// ── Multiplayer server connection ─────────────────────────────────────────────
function connectToServer (host, port) {
  const BC = window.BrowserCraft;

  // BrowserCraft server must be running for WS proxy
  // On static-only deploy (Cloudflare Pages) this will fail gracefully
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://${location.host}/proxy`;

  console.log('[Client] Connecting to', host, port, 'via', wsUrl);

  let ws;
  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    alert('WebSocket proxy not available on static deploy.\nRun the BrowserCraft Node.js server locally to connect to real MC servers.');
    return;
  }

  BC.ws = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({
      host,
      port:    Number(port),
      version: BC.mcVersion || '1.21.4',
      username: localStorage.getItem('bc_username') || 'BrowserCraft',
    }));
    console.log('[WS] Connected — handshake sent');
  };

  ws.onmessage = (evt) => {
    BC.game?.onPacket?.(evt.data);
  };

  ws.onclose = (e) => {
    console.log('[WS] Disconnected:', e.code, e.reason);
    BC.game?.onDisconnect?.(e.reason);
  };

  ws.onerror = () => {
    alert('Could not connect to BrowserCraft proxy server.\nMake sure the Node.js server is running.');
  };
}

// ── Quit ──────────────────────────────────────────────────────────────────────
function showQuitDialog () {
  if (confirm('Quit BrowserCraft?\n\n(It\'s a browser tab. You can just close it 😄)')) {
    window.close();
  }
}

// ── Start on DOM ready ────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
