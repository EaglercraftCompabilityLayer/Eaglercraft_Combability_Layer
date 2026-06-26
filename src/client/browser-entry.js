/**
 * BrowserCraft — Browser Entry Point
 * ────────────────────────────────────
 * This is the client-side JS bundle entry.
 * Webpack packs this + all imports → public/bundle.js
 *
 * Responsibilities:
 *   • Boot the main menu UI
 *   • Manage screen navigation (mainMenu → worldSelect → game)
 *   • Connect to the server-side updater via REST
 *   • Open a WebSocket proxy connection when the user joins a server
 *   • Hand off to the WebGL renderer once in-game
 */

'use strict';

import { MainMenu }     from './screens/MainMenu.js';
import { OptionsScreen } from './screens/OptionsScreen.js';
import { WorldSelect }  from './screens/WorldSelect.js';
import { MultiplayerScreen } from './screens/MultiplayerScreen.js';
import { AudioManager } from './audio/AudioManager.js';
import { UpdaterClient } from './updater/UpdaterClient.js';

// ── Global state ────────────────────────────────────────────────────────────
window.BrowserCraft = {
  version:      __VERSION__,            // injected by webpack DefinePlugin
  mcVersion:    null,                   // set after updater finishes
  currentScreen: null,
  audio:        null,
  ws:           null,
};

// ── Boot ────────────────────────────────────────────────────────────────────
async function boot () {
  const BC = window.BrowserCraft;

  // 1. Start background music
  BC.audio = new AudioManager();
  BC.audio.playMenuMusic();

  // 2. Check for game data updates
  const updater = new UpdaterClient();
  updater.on('update-complete', ({ version }) => {
    BC.mcVersion = version;
    console.log(`[Client] Game data synced to MC ${version}`);
  });
  updater.check();

  // 3. Render main menu
  const menu = new MainMenu({
    onSingleplayer:  () => showScreen(new WorldSelect({ onBack: () => showScreen(menu) })),
    onMultiplayer:   () => showScreen(new MultiplayerScreen({
      onConnect: (host, port) => connectToServer(host, port),
      onBack:    () => showScreen(menu),
    })),
    onOptions:       () => showScreen(new OptionsScreen({
      audio:  BC.audio,
      onBack: () => showScreen(menu),
    })),
    onCheckUpdates:  () => updater.check({ force: true }),
    onQuit:          () => showQuitDialog(),
  });

  showScreen(menu);
}

function showScreen (screen) {
  if (window.BrowserCraft.currentScreen?.destroy) {
    window.BrowserCraft.currentScreen.destroy();
  }
  window.BrowserCraft.currentScreen = screen;
  screen.mount(document.getElementById('app'));
}

// ── Server connection ────────────────────────────────────────────────────────
async function connectToServer (host, port) {
  const BC = window.BrowserCraft;

  // Determine WebSocket URL (same origin)
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/proxy`;
  BC.ws = new WebSocket(wsUrl);

  BC.ws.onopen = () => {
    // Send handshake
    BC.ws.send(JSON.stringify({
      host,
      port,
      version:  BC.mcVersion || '1.21.4',
      username: localStorage.getItem('bc_username') || 'Player',
    }));
  };

  BC.ws.onmessage = (evt) => {
    // Split header line from packet bytes
    const raw  = evt.data instanceof ArrayBuffer ? evt.data : null;
    if (!raw) return;
    // Route to renderer / game logic
    window.BrowserCraft.game?.onPacket(raw);
  };

  BC.ws.onclose = (e) => {
    console.log(`[WS] Disconnected: ${e.code} ${e.reason}`);
    window.BrowserCraft.game?.onDisconnect(e.reason);
  };

  BC.ws.onerror = (e) => {
    console.error('[WS] Error', e);
  };
}

// ── Quit dialog ──────────────────────────────────────────────────────────────
function showQuitDialog () {
  // Placeholder — will be a proper MC-style modal
  if (confirm('Are you sure you want to quit?\n\n(Are you really sure? This is a browser. Just close the tab.)')) {
    window.close();
  }
}

// ── Start ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', boot);
