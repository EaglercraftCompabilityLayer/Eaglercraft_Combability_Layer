/**
 * BrowserCraft — UpdaterClient (browser side)
 * ─────────────────────────────────────────────
 * Talks to /api/updater/* on the BrowserCraft server.
 * Emits events so the UI can show update progress.
 */

'use strict';

export class UpdaterClient extends EventTarget {
  constructor () {
    super();
    this._polling = null;
  }

  emit (name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  on (name, fn) {
    this.addEventListener(name, e => fn(e.detail));
    return this;
  }

  async check ({ force = false } = {}) {
    this.emit('start', {});
    try {
      const res  = await fetch('/api/updater/check', { method: 'POST' });
      const data = await res.json();
      this.emit('update-complete', data);
      return data;
    } catch (e) {
      this.emit('error', { message: e.message });
    }
  }

  async getStatus () {
    const res = await fetch('/api/updater/status');
    return res.json();
  }
}
