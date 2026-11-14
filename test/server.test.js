'use strict';
// End-to-end: real server, real sockets, two players and a third device.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../server/index');

function makePhotos() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glimpse-server-'));
  fs.mkdirSync(path.join(dir, 'pets'));
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(dir, 'pets', `p${i}.jpg`), 'x');
  return dir;
}

function nextState(sock, pred = () => true) {
  return new Promise((resolve) => {
    const h = (s) => {
      if (pred(s)) {
        sock.off('state', h);
        resolve(s);
      }
    };
    sock.on('state', h);
  });
}

test('two players over sockets: shared board, private secrets and flips, reconnect, full', async (t) => {
  const ctx = createApp({ photosDir: makePhotos(), port: 0 });
  await new Promise((r) => ctx.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${ctx.server.address().port}`;
  const opened = [];
  const open = () => {
    const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    opened.push(s);
    return s;
  };
  t.after(() => {
    opened.forEach((s) => s.close());
    ctx.io.close();
    ctx.server.close();
  });

  const a = open();
  const aSeat = new Promise((r) => a.once('seat', r));
  a.emit('join', { token: 'aaaaaaaa-0001' });
  assert.equal((await aSeat).seat, 0);

  const b = open();
  const aSetup = nextState(a, (s) => s.phase === 'setup');
  const bSetup = nextState(b, (s) => s.phase === 'setup');
  b.emit('join', { token: 'bbbbbbbb-0002' });
  const [sa, sb] = await Promise.all([aSetup, bSetup]);
  assert.equal(sa.opponent.connected, true);
  assert.deepEqual(sb.themes.map((x) => x.name), ['Everyone', 'Pets']);

  // Third device is turned away.
  const c = open();
  const full = new Promise((r) => c.once('full', () => r(true)));
  c.emit('join', { token: 'cccccccc-0003' });
  assert.equal(await full, true);

  // Deal from player 2; both get the same board.
  const aPlay = nextState(a, (s) => s.phase === 'playing');
  const bPlay = nextState(b, (s) => s.phase === 'playing');
  b.emit('deal', { theme: 'pets', count: 9, secretMode: 'random' });
  const [pa, pb] = await Promise.all([aPlay, bPlay]);
  assert.deepEqual(pa.board, pb.board);
  assert.notEqual(pa.me.secret, pb.me.secret);

  // A's flips never reach B.
  const aFlipped = nextState(a, (s) => s.me.flips.length === 2);
  const bAfter = nextState(b, () => true);
  a.emit('flip', { index: 1, down: true });
  a.emit('flip', { index: 4, down: true });
  const fa = await aFlipped;
  assert.deepEqual(fa.me.flips, [1, 4]);
  const fb = await bAfter;
  assert.deepEqual(fb.me.flips, []);
  assert.ok(!('secret' in fb.opponent) && !('flips' in fb.opponent));

  // Bad input is rejected with an error, state unchanged.
  const oops = new Promise((r) => a.once('oops', r));
  a.emit('flip', { index: 99, down: true });
  assert.equal((await oops).error, 'bad-index');

  // A reloads: same seat, same secret, same flips.
  a.close();
  await nextState(b, (s) => s.opponent.connected === false);
  const a2 = open();
  const restored = nextState(a2, (s) => s.phase === 'playing');
  a2.emit('join', { token: 'aaaaaaaa-0001' });
  const ra = await restored;
  assert.equal(ra.seat, 0);
  assert.equal(ra.me.secret, pa.me.secret);
  assert.deepEqual(ra.me.flips, [1, 4]);
  assert.deepEqual(ra.board, pa.board);

  // New game resets both.
  const aNew = nextState(a2, (s) => s.round === pa.round + 1);
  const bNew = nextState(b, (s) => s.round === pa.round + 1);
  b.emit('newGame', { mode: 'again' });
  const [na, nb] = await Promise.all([aNew, bNew]);
  assert.deepEqual(na.me.flips, []);
  assert.deepEqual(nb.me.flips, []);
  assert.deepEqual(na.board, nb.board);
});
