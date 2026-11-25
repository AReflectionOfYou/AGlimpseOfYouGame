'use strict';

// A Glimpse of You: local WiFi server. Express for files, Socket.IO for live state.

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const { Game } = require('./game');
const { resolvePhotosDir, scanThemes } = require('./themes');
const { joinUrls } = require('./network');

const NAME = 'A Glimpse of You';
const ROOT = path.resolve(__dirname, '..');

function themeSummaries(themes) {
  return themes.map(({ id, name, count }) => ({ id, name, count }));
}

function createApp({ photosDir = resolvePhotosDir(), port = 3000 } = {}) {
  const getThemes = () => scanThemes(photosDir);
  const game = new Game({ getThemes });
  const urls = joinUrls(port);
  const joinUrl = urls.ip || urls.local || urls.fallback;

  const app = express();
  app.disable('x-powered-by');

  app.get('/api/info', (req, res) => {
    res.json({ name: NAME, joinUrl, localUrl: urls.local });
  });

  app.get('/qr.svg', async (req, res, next) => {
    try {
      const svg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
    } catch (err) {
      next(err);
    }
  });

  // Home-screen icon, drawn on the fly so no image files live in the repo.
  const iconCache = new Map();
  app.get('/icon-:size.png', async (req, res, next) => {
    const size = Number(req.params.size);
    if (![180, 192, 512].includes(size)) return res.sendStatus(404);
    try {
      if (!iconCache.has(size)) {
        const sharp = require('sharp');
        iconCache.set(size, await sharp(Buffer.from(iconSvg(size))).png().toBuffer());
      }
      res.type('image/png').send(iconCache.get(size));
    } catch (err) {
      next(err);
    }
  });

  app.use('/photos', express.static(photosDir, { dotfiles: 'ignore', index: false, maxAge: '1h' }));
  app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));

  const server = http.createServer(app);
  const io = new Server(server, { serveClient: true });

  function sendState(socket) {
    const seat = socket.data.seat;
    if (seat == null) return;
    const state = game.stateFor(seat);
    if (state.phase === 'setup') {
      const themes = getThemes();
      state.themes = themeSummaries(themes);
    }
    state.joinUrl = joinUrl;
    socket.emit('state', state);
  }

  async function broadcast() {
    const sockets = await io.fetchSockets();
    for (const s of sockets) sendState(s);
  }

  function refreshConnected() {
    const counts = [0, 0];
    for (const s of io.of('/').sockets.values()) {
      if (s.data.seat != null) counts[s.data.seat] += 1;
    }
    game.setConnected(0, counts[0] > 0);
    game.setConnected(1, counts[1] > 0);
  }

  io.on('connection', (socket) => {
    socket.on('join', (msg) => {
      const result = game.join(msg && msg.token);
      if (!result.ok) {
        socket.emit('full');
        return;
      }
      socket.data.seat = result.seat;
      socket.emit('seat', { seat: result.seat, token: result.token });
      refreshConnected();
      broadcast();
    });

    const act = (name, fn) => {
      socket.on(name, (msg) => {
        const seat = socket.data.seat;
        if (seat == null) return;
        const result = fn(seat, msg || {});
        if (!result.ok) socket.emit('oops', { action: name, error: result.error });
        broadcast();
      });
    };

    act('deal', (seat, m) => game.deal(seat, { theme: m.theme, count: m.count, secretMode: m.secretMode }));
    act('chooseSecret', (seat, m) => game.chooseSecret(seat, m.index));
    act('flip', (seat, m) => game.flip(seat, m.index, m.down));
    act('newGame', (seat, m) => game.newGame(seat, m.mode));
    socket.on('refresh', () => sendState(socket));

    socket.on('disconnect', () => {
      if (socket.data.seat == null) return;
      refreshConnected();
      broadcast();
    });
  });

  return { app, server, io, game, urls, joinUrl, photosDir, getThemes };
}

// Four cards, one showing a face.
function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs><clipPath id="card"><rect x="53" y="53" width="33" height="33" rx="6"/></clipPath></defs>
  <rect width="100" height="100" fill="#f6efe4"/>
  <rect x="14" y="14" width="33" height="33" rx="6" fill="#2f5d62"/>
  <rect x="53" y="14" width="33" height="33" rx="6" fill="#2f5d62"/>
  <rect x="14" y="53" width="33" height="33" rx="6" fill="#2f5d62"/>
  <g clip-path="url(#card)">
    <rect x="53" y="53" width="33" height="33" fill="#f4d58d"/>
    <circle cx="69.5" cy="65.5" r="6.5" fill="#e07a5f"/>
    <ellipse cx="69.5" cy="86" rx="12.5" ry="11" fill="#e07a5f"/>
  </g>
</svg>`;
}

async function printBanner({ urls, joinUrl, photosDir, getThemes, port }) {
  const line = '─'.repeat(52);
  const out = [];
  out.push('', line, `  ${NAME}`, '  Part of the A Reflection of You collection', line, '');
  out.push('  Join on the same WiFi:');
  if (urls.ip) out.push(`    ${urls.ip}`);
  if (urls.local) out.push(`    ${urls.local}`);
  if (!urls.ip && !urls.local) out.push(`    ${urls.fallback}  (no WiFi address found)`);
  out.push(`  On this computer: http://localhost:${port}`, '');
  console.log(out.join('\n'));

  try {
    const qr = await QRCode.toString(joinUrl, { type: 'terminal', small: true });
    console.log(qr);
  } catch {
    // QR is a nicety; the URL above is enough
  }

  const themes = getThemes();
  console.log(`  Photos folder: ${photosDir}`);
  if (themes.length === 0) {
    console.log(
      [
        '',
        '  No photos yet. To add some:',
        '    1. Make a folder inside the photos folder for each theme (e.g. photos/aunties).',
        '    2. Put square photos in it, or use: npm run prep -- --theme aunties',
        '    3. Refresh the setup screen.',
        '  Or try it right now with sample pictures: npm run demo',
      ].join('\n')
    );
  } else {
    const list = themes
      .slice(1)
      .map((t) => `${t.name} (${t.count})`)
      .join(', ');
    console.log(`  Themes: ${list}`);
  }
  console.log(`\n${line}\n  Press Ctrl+C to stop.\n`);
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const ctx = createApp({ port });
  ctx.server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try: PORT=3001 npm start`);
      process.exit(1);
    }
    throw err;
  });
  ctx.server.listen(port, '0.0.0.0', () => printBanner({ ...ctx, port }));
}

module.exports = { createApp, NAME };
