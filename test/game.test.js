'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../server/game');

function themes() {
  const a = Array.from({ length: 10 }, (_, i) => `/photos/aunties/a${i}.jpg`);
  const c = Array.from({ length: 30 }, (_, i) => `/photos/cousins/c${i}.jpg`);
  const tiny = ['/photos/tiny/t0.jpg', '/photos/tiny/t1.jpg'];
  return [
    { id: '*', name: 'Everyone', images: [...a, ...c, ...tiny] },
    { id: 'aunties', name: 'Aunties', images: a },
    { id: 'cousins', name: 'Cousins', images: c },
    { id: 'tiny', name: 'Tiny', images: tiny },
  ];
}

function ready(opts = {}) {
  const g = new Game({ getThemes: themes, ...opts });
  g.join('token-aaaa-1111');
  g.join('token-bbbb-2222');
  return g;
}

test('seats: two players, third is turned away, tokens reclaim seats', () => {
  const g = new Game({ getThemes: themes });
  assert.equal(g.phase, 'lobby');
  const p1 = g.join(null);
  assert.equal(p1.seat, 0);
  assert.equal(g.phase, 'lobby');
  const p2 = g.join('token-bbbb-2222');
  assert.equal(p2.seat, 1);
  assert.equal(p2.token, 'token-bbbb-2222');
  assert.equal(g.phase, 'setup');
  assert.deepEqual(g.join('token-cccc-3333'), { ok: false, error: 'full' });
  assert.equal(g.join(p1.token).seat, 0);
  assert.equal(g.join('token-bbbb-2222').seat, 1);
});

test('deal: correct count, distinct, same order for both, only from chosen theme', () => {
  for (let trial = 0; trial < 50; trial++) {
    const g = ready();
    assert.ok(g.deal(0, { theme: 'cousins', count: 24, secretMode: 'random' }).ok);
    const s0 = g.stateFor(0);
    const s1 = g.stateFor(1);
    assert.equal(s0.board.length, 24);
    assert.equal(new Set(s0.board).size, 24);
    assert.deepEqual(s0.board, s1.board);
    assert.ok(s0.board.every((u) => u.startsWith('/photos/cousins/')));
  }
});

test('deal: Everyone draws across themes', () => {
  const seen = new Set();
  for (let trial = 0; trial < 30; trial++) {
    const g = ready();
    assert.ok(g.deal(1, { theme: '*', count: 24, secretMode: 'random' }).ok);
    for (const u of g.board) seen.add(u.split('/')[2]);
  }
  assert.ok(seen.has('aunties') && seen.has('cousins'));
});

test('deal: shuffles order (not always the folder order)', () => {
  const g = ready();
  g.deal(0, { theme: 'aunties', count: 10, secretMode: 'random' });
  const orders = new Set();
  for (let i = 0; i < 10; i++) {
    g.newGame(0, 'again');
    orders.add(g.board.join(','));
  }
  assert.ok(orders.size > 1);
});

test('random secrets: always on the board and different from each other', () => {
  for (let trial = 0; trial < 500; trial++) {
    const g = ready();
    const count = 6 + (trial % 19);
    g.deal(0, { theme: 'cousins', count, secretMode: 'random' });
    const a = g.stateFor(0).me.secret;
    const b = g.stateFor(1).me.secret;
    assert.ok(Number.isInteger(a) && a >= 0 && a < count);
    assert.ok(Number.isInteger(b) && b >= 0 && b < count);
    assert.notEqual(a, b);
    assert.equal(g.phase, 'playing');
  }
});

test('random secrets: extreme random values still give distinct secrets', () => {
  for (const r of [0, 0.999999]) {
    const g = ready({ random: () => r });
    g.deal(0, { theme: 'aunties', count: 6, secretMode: 'random' });
    assert.notEqual(g.seats[0].secret, g.seats[1].secret);
    assert.ok(g.seats[0].secret < 6 && g.seats[1].secret < 6);
  }
});

test('choosing: play waits for both, locked secrets cannot change, same face allowed', () => {
  const g = ready();
  g.deal(0, { theme: 'aunties', count: 6, secretMode: 'choose' });
  assert.equal(g.phase, 'choosing');
  assert.equal(g.stateFor(0).me.secret, null);
  assert.equal(g.flip(0, 0, true).ok, false);

  assert.ok(g.chooseSecret(0, 3).ok);
  assert.equal(g.phase, 'choosing');
  assert.equal(g.stateFor(1).opponent.locked, true);
  assert.deepEqual(g.chooseSecret(0, 4), { ok: false, error: 'already-locked' });
  assert.equal(g.stateFor(0).me.secret, 3);

  assert.ok(g.chooseSecret(1, 3).ok);
  assert.equal(g.phase, 'playing');
  assert.equal(g.chooseSecret(1, 2).ok, false);
  assert.equal(g.stateFor(1).me.secret, 3);
});

test('privacy: a state payload never contains the opponent secret or flips', () => {
  const g = ready();
  g.deal(0, { theme: 'cousins', count: 24, secretMode: 'choose' });
  g.chooseSecret(0, 17);
  g.chooseSecret(1, 5);
  for (const i of [1, 2, 3, 20, 21]) g.flip(0, i, true);
  for (const i of [9, 11]) g.flip(1, i, true);

  const s1 = g.stateFor(1);
  const s0 = g.stateFor(0);
  assert.equal(s1.me.secret, 5);
  assert.deepEqual(s1.me.flips, [9, 11]);
  assert.equal(s0.me.secret, 17);
  assert.deepEqual(s0.me.flips, [1, 2, 3, 20, 21]);
  assert.deepEqual(Object.keys(s1.opponent).sort(), ['connected', 'joined', 'locked']);

  // Deep scan: nothing that looks like the opponent's data anywhere in the payload.
  const walk = (obj, fn, p = '') => {
    if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) walk(v, fn, `${p}.${k}`);
    else fn(p, obj);
  };
  walk(s1, (p, v) => {
    assert.ok(!/opponent\.(secret|flips)/.test(p), `leaked ${p}`);
    if (p.startsWith('.opponent')) assert.equal(typeof v, 'boolean');
  });
  const json = JSON.stringify(s1);
  assert.ok(!json.includes('token'), 'tokens appear in payload');

  // Changing the opponent's secret and flips must not change my payload at all.
  g.seats[0].secret = 2;
  g.seats[0].flips = new Set([0, 7, 8, 23]);
  assert.deepEqual(g.stateFor(1), s1);
});

test('flips: toggle down and up, survive in state for reloads', () => {
  const g = ready();
  g.deal(0, { theme: 'aunties', count: 9, secretMode: 'random' });
  assert.ok(g.flip(0, 4, true).ok);
  assert.ok(g.flip(0, 2, true).ok);
  assert.deepEqual(g.stateFor(0).me.flips, [2, 4]);
  assert.ok(g.flip(0, 4, false).ok);
  assert.deepEqual(g.stateFor(0).me.flips, [2]);
  assert.deepEqual(g.stateFor(1).me.flips, []);
});

test('validation: indices, counts, themes, modes and phases', () => {
  const g = ready();
  assert.equal(g.flip(0, 0, true).error, 'wrong-phase');
  assert.equal(g.chooseSecret(0, 0).error, 'wrong-phase');
  assert.equal(g.newGame(0, 'again').error, 'wrong-phase');
  assert.equal(g.deal(0, { theme: 'aunties', count: 5, secretMode: 'random' }).error, 'bad-count');
  assert.equal(g.deal(0, { theme: 'cousins', count: 25, secretMode: 'random' }).error, 'bad-count');
  assert.equal(g.deal(0, { theme: 'cousins', count: 12.5, secretMode: 'random' }).error, 'bad-count');
  assert.equal(g.deal(0, { theme: 'cousins', count: '12', secretMode: 'random' }).error, 'bad-count');
  assert.equal(g.deal(0, { theme: 'aunties', count: 12, secretMode: 'random' }).error, 'not-enough-photos');
  assert.equal(g.deal(0, { theme: 'nope', count: 6, secretMode: 'random' }).error, 'bad-theme');
  assert.equal(g.deal(0, { theme: 'aunties', count: 6, secretMode: 'cheat' }).error, 'bad-secret-mode');
  assert.equal(g.deal(5, { theme: 'aunties', count: 6, secretMode: 'random' }).error, 'bad-seat');
  assert.equal(g.phase, 'setup');

  assert.ok(g.deal(0, { theme: 'aunties', count: 6, secretMode: 'choose' }).ok);
  assert.equal(g.deal(1, { theme: 'aunties', count: 6, secretMode: 'random' }).error, 'wrong-phase');
  for (const bad of [-1, 6, 1.5, '2', null, undefined]) {
    assert.equal(g.chooseSecret(0, bad).error, 'bad-index');
  }
  g.chooseSecret(0, 0);
  g.chooseSecret(1, 1);
  for (const bad of [-1, 6, 2.5, '1', null]) assert.equal(g.flip(0, bad, true).error, 'bad-index');
  assert.equal(g.flip(0, 1, 'yes').error, 'bad-flip');
  assert.equal(g.newGame(0, 'whatever').error, 'bad-mode');
});

test('new game: again redeals both boards, settings returns to setup', () => {
  const g = ready();
  g.deal(0, { theme: 'cousins', count: 12, secretMode: 'random' });
  g.flip(0, 1, true);
  g.flip(1, 2, true);
  const round = g.round;
  assert.ok(g.newGame(1, 'again').ok);
  assert.equal(g.phase, 'playing');
  assert.equal(g.round, round + 1);
  assert.deepEqual(g.stateFor(0).me.flips, []);
  assert.deepEqual(g.stateFor(1).me.flips, []);
  assert.deepEqual(g.stateFor(0).settings, { theme: 'cousins', count: 12, secretMode: 'random' });

  assert.ok(g.newGame(0, 'settings').ok);
  assert.equal(g.phase, 'setup');
  assert.deepEqual(g.board, []);
  assert.equal(g.stateFor(0).me.secret, null);
  assert.deepEqual(g.stateFor(1).settings, { theme: 'cousins', count: 12, secretMode: 'random' });
});
