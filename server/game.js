'use strict';

// Pure game logic: seats, deal, secrets, flips. No sockets or files in here.
// Every action returns { ok: true } or { ok: false, error }.

const crypto = require('node:crypto');

const MIN_FACES = 6;
const MAX_FACES = 24;
const SECRET_MODES = ['random', 'choose'];

function fail(error) {
  return { ok: false, error };
}

function isIndex(i, length) {
  return Number.isInteger(i) && i >= 0 && i < length;
}

function newSeat() {
  return { token: null, connected: false, secret: null, flips: new Set() };
}

class Game {
  /**
   * @param {object} opts
   * @param {() => Array<{id:string,name:string,images:string[]}>} opts.getThemes
   * @param {() => number} [opts.random] random source in [0, 1)
   */
  constructor({ getThemes, random = Math.random } = {}) {
    this.getThemes = getThemes || (() => []);
    this.random = random;
    this.settings = { theme: null, count: 12, secretMode: 'random' };
    this.phase = 'lobby';
    this.board = [];
    this.round = 0;
    this.seats = [newSeat(), newSeat()];
  }

  // ---- seats ----

  // Claim or reclaim a seat. Returns { ok, seat, token } or { ok: false, error: 'full' }.
  join(token) {
    const valid = typeof token === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(token);
    if (valid) {
      const existing = this.seats.findIndex((s) => s.token === token);
      if (existing !== -1) return { ok: true, seat: existing, token };
    }
    const free = this.seats.findIndex((s) => s.token === null);
    if (free === -1) return fail('full');
    const seatToken = valid ? token : crypto.randomUUID();
    this.seats[free].token = seatToken;
    if (this.phase === 'lobby' && this.seats.every((s) => s.token)) this.phase = 'setup';
    return { ok: true, seat: free, token: seatToken };
  }

  setConnected(seat, connected) {
    if (this.seats[seat]) this.seats[seat].connected = !!connected;
  }

  // ---- round actions ----

  deal(seat, { theme, count, secretMode } = {}) {
    if (!this.seats[seat]) return fail('bad-seat');
    if (this.phase !== 'setup') return fail('wrong-phase');
    return this._deal({ theme, count, secretMode });
  }

  _deal({ theme, count, secretMode }) {
    if (!SECRET_MODES.includes(secretMode)) return fail('bad-secret-mode');
    if (!Number.isInteger(count) || count < MIN_FACES || count > MAX_FACES) return fail('bad-count');
    const found = this.getThemes().find((t) => t.id === theme);
    if (!found) return fail('bad-theme');
    if (count > found.images.length) return fail('not-enough-photos');

    this.settings = { theme, count, secretMode };
    this.board = this._sample(found.images, count);
    this.round += 1;
    for (const s of this.seats) {
      s.secret = null;
      s.flips = new Set();
    }

    if (secretMode === 'random') {
      const a = Math.floor(this.random() * count);
      let b = Math.floor(this.random() * (count - 1));
      if (b >= a) b += 1; // guarantees b !== a
      this.seats[0].secret = a;
      this.seats[1].secret = b;
      this.phase = 'playing';
    } else {
      this.phase = 'choosing';
    }
    return { ok: true };
  }

  // Pick `count` distinct items and shuffle them (partial Fisher-Yates).
  _sample(items, count) {
    const pool = items.slice();
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(this.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  chooseSecret(seat, index) {
    const s = this.seats[seat];
    if (!s) return fail('bad-seat');
    if (this.phase !== 'choosing') return fail('wrong-phase');
    if (s.secret !== null) return fail('already-locked');
    if (!isIndex(index, this.board.length)) return fail('bad-index');
    s.secret = index;
    if (this.seats.every((x) => x.secret !== null)) this.phase = 'playing';
    return { ok: true };
  }

  flip(seat, index, down) {
    const s = this.seats[seat];
    if (!s) return fail('bad-seat');
    if (this.phase !== 'playing') return fail('wrong-phase');
    if (!isIndex(index, this.board.length)) return fail('bad-index');
    if (typeof down !== 'boolean') return fail('bad-flip');
    if (down) s.flips.add(index);
    else s.flips.delete(index);
    return { ok: true };
  }

  newGame(seat, mode) {
    if (!this.seats[seat]) return fail('bad-seat');
    if (this.phase !== 'choosing' && this.phase !== 'playing') return fail('wrong-phase');
    if (mode === 'again') {
      const result = this._deal(this.settings);
      if (result.ok) return result;
      // The theme may have shrunk or vanished since the last deal; fall back to setup.
      this._toSetup();
      return { ok: true, fellBackToSetup: true, reason: result.error };
    }
    if (mode === 'settings') {
      this._toSetup();
      return { ok: true };
    }
    return fail('bad-mode');
  }

  _toSetup() {
    this.phase = 'setup';
    this.board = [];
    for (const s of this.seats) {
      s.secret = null;
      s.flips = new Set();
    }
  }

  // ---- views ----

  // What one seat is allowed to see. Never includes the opponent's secret or flips.
  stateFor(seat) {
    const me = this.seats[seat];
    const opp = this.seats[1 - seat];
    return {
      phase: this.phase,
      seat,
      round: this.round,
      settings: { ...this.settings },
      board: this.board.slice(),
      me: {
        secret: me.secret,
        flips: [...me.flips].sort((a, b) => a - b),
      },
      opponent: {
        joined: opp.token !== null,
        connected: opp.connected,
        locked: opp.secret !== null,
      },
    };
  }
}

module.exports = { Game, MIN_FACES, MAX_FACES, SECRET_MODES };
