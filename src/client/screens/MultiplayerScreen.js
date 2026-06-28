/**
 * BrowserCraft — MultiplayerScreen
 * ─────────────────────────────────
 * Server list with add/remove, persistence in localStorage,
 * and live ping via the BrowserCraft proxy API.
 *
 * Usage:
 *   const screen = new MultiplayerScreen({ onBack, onConnect });
 *   screen.mount(document.getElementById('app'));
 */

'use strict';

const SERVERS_KEY = 'browsercraft_servers';

const DEFAULT_SERVERS = [
  { id: '1', name: 'Hypixel',       host: 'mc.hypixel.net',  port: 25565 },
  { id: '2', name: 'Local Server',  host: 'localhost',        port: 25565 },
];

function loadServers () {
  try {
    const stored = JSON.parse(localStorage.getItem(SERVERS_KEY));
    return Array.isArray(stored) ? stored : DEFAULT_SERVERS;
  } catch { return DEFAULT_SERVERS; }
}

function saveServers (servers) {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
}

export class MultiplayerScreen {
  constructor ({ onBack, onConnect } = {}) {
    this.onBack    = onBack    || (() => {});
    this.onConnect = onConnect || (() => {});
    this._el       = null;
    this._servers  = loadServers();
    this._selected = null;
    this._pinging  = new Set();
  }

  mount (container) {
    this._el = document.createElement('div');
    this._el.innerHTML = this._html();
    this._el.style.cssText = 'position:absolute;inset:0;';
    container.appendChild(this._el);
    this._bind();
    this._renderList();
    this._pingAll();
  }

  destroy () {
    this._el?.remove();
  }

  _html () {
    return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
      .mp-root { position:absolute;inset:0;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;align-items:center;padding-top:32px;font-family:'VT323',monospace; }
      .mp-title { color:#fff;font-size:36px;text-shadow:2px 2px #3f3f3f;letter-spacing:2px;margin-bottom:14px; }
      .mp-list { width:480px;max-height:320px;overflow-y:auto;border:2px solid #444;background:#111;margin-bottom:10px; }
      .mp-list::-webkit-scrollbar { width:8px; }
      .mp-list::-webkit-scrollbar-thumb { background:#555; }
      .mp-item { display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #222; }
      .mp-item:hover,.mp-item.selected { background:rgba(255,255,255,0.08); }
      .mp-ping-dot { width:12px;height:12px;border-radius:50%;background:#aaa;flex-shrink:0; }
      .mp-ping-dot.online  { background:#55ff55; }
      .mp-ping-dot.offline { background:#ff5555; }
      .mp-ping-dot.pinging { background:#ffff55;animation:blink 0.6s infinite; }
      @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }
      .mp-server-name { color:#fff;font-size:20px; }
      .mp-server-meta { color:#aaa;font-size:15px; }
      .mp-ping-ms { color:#55ff55;font-size:15px;margin-left:auto;flex-shrink:0; }
      .mp-btn-row { display:flex;gap:6px;margin-bottom:6px; }
      .mp-btn { font-family:'VT323',monospace;font-size:19px;padding:8px 0;width:150px;color:#fff;background:#848484;border:none;border-top:3px solid #c8c8c8;border-left:3px solid #c8c8c8;border-right:3px solid #3f3f3f;border-bottom:3px solid #3f3f3f;cursor:pointer;letter-spacing:1px;text-shadow:1px 1px #3f3f3f;outline:none; }
      .mp-btn:hover { filter:brightness(1.3);color:#ffffa0; }
      .mp-btn:disabled { opacity:0.4;cursor:default;filter:none;color:#fff; }
      .mp-btn.danger { background:#6a4848;border-top-color:#a07070;border-left-color:#a07070; }
      .mp-divider { width:480px;height:2px;background:rgba(255,255,255,0.08);margin:6px 0; }

      /* Add server dialog */
      .mp-dialog { display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.92);flex-direction:column;align-items:center;justify-content:center; }
      .mp-dialog.open { display:flex; }
      .mp-dialog-title { color:#fff;font-size:28px;text-shadow:2px 2px #3f3f3f;margin-bottom:16px; }
      .mp-field { display:flex;align-items:center;gap:10px;margin-bottom:10px;width:380px; }
      .mp-dlabel { color:#ccc;font-size:18px;width:120px;flex-shrink:0; }
      .mp-input { flex:1;font-family:'VT323',monospace;font-size:18px;background:#1a1a1a;color:#fff;border:2px solid #555;padding:6px 10px;outline:none; }
      .mp-input:focus { border-color:#aaa; }
    </style>

    <div class="mp-root">
      <div class="mp-title">Multiplayer</div>
      <div class="mp-list" id="mp-list"></div>

      <div class="mp-btn-row">
        <button class="mp-btn" id="mp-join-btn" disabled>Join Server</button>
        <button class="mp-btn" id="mp-add-btn">Add Server</button>
        <button class="mp-btn danger" id="mp-del-btn" disabled>Remove</button>
      </div>
      <div class="mp-btn-row">
        <button class="mp-btn" id="mp-refresh-btn" style="width:150px">Refresh</button>
        <button class="mp-btn" id="mp-back-btn" style="width:304px">Back</button>
      </div>
    </div>

    <!-- Add Server Dialog -->
    <div class="mp-dialog" id="mp-dialog">
      <div class="mp-dialog-title">Add Server</div>
      <div class="mp-field">
        <span class="mp-dlabel">Name</span>
        <input class="mp-input" id="mp-name-input" type="text" value="My Server" maxlength="32">
      </div>
      <div class="mp-field">
        <span class="mp-dlabel">Address</span>
        <input class="mp-input" id="mp-host-input" type="text" placeholder="mc.example.com" maxlength="128">
      </div>
      <div class="mp-field">
        <span class="mp-dlabel">Port</span>
        <input class="mp-input" id="mp-port-input" type="number" value="25565" min="1" max="65535" style="width:80px;flex:none;">
      </div>
      <div class="mp-btn-row" style="margin-top:16px;">
        <button class="mp-btn" id="mp-save-btn" style="width:180px;">Add Server</button>
        <button class="mp-btn danger" id="mp-dcancel-btn" style="width:180px;">Cancel</button>
      </div>
    </div>
    `;
  }

  _bind () {
    this._el.querySelector('#mp-back-btn').onclick    = () => this.onBack();
    this._el.querySelector('#mp-add-btn').onclick     = () => this._openDialog();
    this._el.querySelector('#mp-dcancel-btn').onclick = () => this._closeDialog();
    this._el.querySelector('#mp-save-btn').onclick    = () => this._addServer();
    this._el.querySelector('#mp-join-btn').onclick    = () => this._joinSelected();
    this._el.querySelector('#mp-del-btn').onclick     = () => this._deleteSelected();
    this._el.querySelector('#mp-refresh-btn').onclick = () => this._pingAll();
  }

  _renderList () {
    const list = this._el.querySelector('#mp-list');
    if (!this._servers.length) {
      list.innerHTML = '<div style="color:#555;font-size:18px;text-align:center;padding:40px;font-family:VT323,monospace;">No servers yet</div>';
      return;
    }
    list.innerHTML = this._servers.map((s, i) => `
      <div class="mp-item${this._selected === i ? ' selected' : ''}" data-idx="${i}">
        <div class="mp-ping-dot pinging" id="ping-dot-${s.id}"></div>
        <div>
          <div class="mp-server-name">${s.name}</div>
          <div class="mp-server-meta">${s.host}:${s.port}</div>
        </div>
        <div class="mp-ping-ms" id="ping-ms-${s.id}">…</div>
      </div>
    `).join('');

    list.querySelectorAll('.mp-item').forEach(el => {
      el.onclick = () => {
        this._selected = parseInt(el.dataset.idx);
        this._renderList();
        this._el.querySelector('#mp-join-btn').disabled = false;
        this._el.querySelector('#mp-del-btn').disabled  = false;
      };
      el.ondblclick = () => {
        this._selected = parseInt(el.dataset.idx);
        this._joinSelected();
      };
    });
  }

  // ── Ping servers via /api/ping proxy ──────────────────────────────────────
  async _pingAll () {
    this._renderList();
    for (const server of this._servers) {
      this._pingOne(server);
    }
  }

  async _pingOne (server) {
    const dot = this._el.querySelector(`#ping-dot-${server.id}`);
    const ms  = this._el.querySelector(`#ping-ms-${server.id}`);
    if (!dot || !ms) return;

    dot.className = 'mp-ping-dot pinging';
    ms.textContent = '…';

    const t0 = Date.now();
    try {
      const res = await fetch(`/api/ping?host=${encodeURIComponent(server.host)}&port=${server.port}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      const latency = Date.now() - t0;
      dot.className    = 'mp-ping-dot online';
      ms.textContent   = `${latency}ms`;
      ms.style.color   = latency < 80 ? '#55ff55' : latency < 200 ? '#ffff55' : '#ff5555';
      if (data.players) {
        const metaEl = this._el.querySelector(`#ping-dot-${server.id}`)
          ?.closest('.mp-item')?.querySelector('.mp-server-meta');
        if (metaEl) metaEl.textContent = `${server.host}:${server.port} — ${data.players.online}/${data.players.max} online`;
      }
    } catch {
      dot.className  = 'mp-ping-dot offline';
      ms.textContent = 'Offline';
      ms.style.color = '#ff5555';
    }
  }

  _openDialog () {
    this._el.querySelector('#mp-dialog').classList.add('open');
    this._el.querySelector('#mp-name-input').focus();
  }

  _closeDialog () {
    this._el.querySelector('#mp-dialog').classList.remove('open');
  }

  _addServer () {
    const name = this._el.querySelector('#mp-name-input').value.trim() || 'My Server';
    const host = this._el.querySelector('#mp-host-input').value.trim();
    const port = parseInt(this._el.querySelector('#mp-port-input').value) || 25565;
    if (!host) { alert('Please enter a server address.'); return; }

    const server = { id: Date.now().toString(), name, host, port };
    this._servers.push(server);
    saveServers(this._servers);
    this._closeDialog();
    this._renderList();
    this._pingOne(server);
  }

  _joinSelected () {
    if (this._selected === null) return;
    const s = this._servers[this._selected];
    this.onConnect(s.host, s.port, s.name);
  }

  _deleteSelected () {
    if (this._selected === null) return;
    if (!confirm(`Remove "${this._servers[this._selected].name}"?`)) return;
    this._servers.splice(this._selected, 1);
    this._selected = null;
    saveServers(this._servers);
    this._renderList();
    this._el.querySelector('#mp-join-btn').disabled = true;
    this._el.querySelector('#mp-del-btn').disabled  = true;
  }
}
