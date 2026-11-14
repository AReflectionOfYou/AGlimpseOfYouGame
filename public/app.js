/* A Glimpse of You: browser client. Plain JS, no build step. */
(function () {
  'use strict';

  var PRESETS = [6, 9, 12, 16, 20, 24];
  var MIN = 6;
  var MAX = 24;
  var TOKEN_KEY = 'glimpse.seatToken';

  var $ = function (id) { return document.getElementById(id); };

  // ---------- storage (may be blocked in private mode) ----------
  function loadToken() {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function saveToken(t) {
    try { window.localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ignore */ }
  }

  // ---------- state ----------
  var state = null;        // last state from server
  var sel = null;          // setup selections on this device
  var boardKey = null;     // identifies the currently rendered board
  var boardReady = false;  // images preloaded and tiles built
  var localFlips = new Set();
  var lastFlipAt = 0;
  var pendingChoice = null;

  var socket = io({ reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000 });

  socket.on('connect', function () {
    socket.emit('join', { token: loadToken() });
  });
  socket.on('disconnect', function () { renderPeer(); });
  socket.on('seat', function (m) { if (m && m.token) saveToken(m.token); });
  socket.on('full', function () { showScreen('full'); hideTopbarActions(); });
  socket.on('state', function (s) { state = s; render(); });
  socket.on('oops', function (m) { toast(friendlyError(m && m.error)); });

  // iPads sleep; when one wakes, make sure we have the latest.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && socket.connected) socket.emit('refresh');
  });

  // ---------- screens ----------
  var SCREENS = ['connecting', 'full', 'lobby', 'setup', 'board'];
  function showScreen(name) {
    SCREENS.forEach(function (s) { $('screen-' + s).classList.toggle('hidden', s !== name); });
  }
  function hideTopbarActions() {
    $('myFaceBtn').classList.add('hidden');
    $('newGameBtn').classList.add('hidden');
    $('upCount').classList.add('hidden');
  }

  function render() {
    if (!state) return;
    renderPeer();
    if (state.phase === 'lobby') {
      closeModals();
      hideTopbarActions();
      renderLobby();
      showScreen('lobby');
    } else if (state.phase === 'setup') {
      closeModals();
      hideTopbarActions();
      boardKey = null;
      renderSetup();
      showScreen('setup');
    } else {
      showScreen('board');
      renderBoard();
    }
  }

  function renderPeer() {
    var peer = $('peer');
    var label = peer.querySelector('.peer-label');
    var on = !!(state && socket.connected && state.opponent.connected);
    peer.classList.toggle('on', on);
    if (!socket.connected) label.textContent = 'Reconnecting…';
    else if (!state || !state.opponent.joined) label.textContent = 'Waiting for player';
    else label.textContent = on ? 'Other player here' : 'Other player away';
  }

  // ---------- lobby ----------
  function renderLobby() {
    var url = state.joinUrl || window.location.origin;
    if (!$('qr').getAttribute('src')) $('qr').src = '/qr.svg';
    $('joinUrl').textContent = url;
    var canShare = typeof navigator.share === 'function';
    $('shareBtn').hidden = !canShare;
    var touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    $('textLink').hidden = canShare || !touch;
    $('textLink').href = 'sms:&body=' + encodeURIComponent('Join A Glimpse of You: ' + url);
  }
  $('shareBtn').addEventListener('click', function () {
    var url = (state && state.joinUrl) || window.location.origin;
    navigator.share({ title: 'A Glimpse of You', text: 'Join A Glimpse of You', url: url }).catch(function () {});
  });

  // ---------- setup ----------
  function themeById(id) {
    var list = (state && state.themes) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function maxFor(theme) { return theme ? Math.min(MAX, theme.count) : 0; }

  function renderSetup() {
    var themes = state.themes || [];
    var none = themes.length === 0;
    $('setupPanel').classList.toggle('hidden', none);
    $('noPhotos').classList.toggle('hidden', !none);
    if (none) return;

    if (!sel) sel = { theme: state.settings.theme, count: state.settings.count, secretMode: state.settings.secretMode };
    var t = themeById(sel.theme);
    if (!t || t.count < MIN) {
      t = themes.filter(function (x) { return x.count >= MIN; })[0] || themes[0];
      sel.theme = t.id;
    }
    sel.count = Math.max(MIN, Math.min(sel.count || 12, maxFor(t)));

    var list = $('themeList');
    list.innerHTML = '';
    themes.forEach(function (th) {
      var b = document.createElement('button');
      b.className = 'choice theme' + (th.id === sel.theme ? ' selected' : '');
      b.disabled = th.count < MIN;
      b.innerHTML = '<span class="name"></span><span class="count"></span>';
      b.querySelector('.name').textContent = th.name;
      b.querySelector('.count').textContent = th.count < MIN ? 'needs ' + MIN : th.count + ' photos';
      b.addEventListener('click', function () { sel.theme = th.id; renderSetup(); });
      list.appendChild(b);
    });

    var presets = $('countPresets');
    presets.innerHTML = '';
    var max = maxFor(t);
    PRESETS.forEach(function (n) {
      var b = document.createElement('button');
      b.className = 'choice num' + (n === sel.count ? ' selected' : '');
      b.textContent = n;
      b.disabled = n > max;
      b.addEventListener('click', function () { sel.count = n; renderSetup(); });
      presets.appendChild(b);
    });
    $('countValue').textContent = sel.count;
    $('countDown').disabled = sel.count <= MIN;
    $('countUp').disabled = sel.count >= max;

    Array.prototype.forEach.call(document.querySelectorAll('#modeChoices .choice'), function (b) {
      b.classList.toggle('selected', b.getAttribute('data-mode') === sel.secretMode);
    });
    $('dealBtn').disabled = !(t && t.count >= MIN);
  }

  $('countDown').addEventListener('click', function () { sel.count -= 1; renderSetup(); });
  $('countUp').addEventListener('click', function () { sel.count += 1; renderSetup(); });
  Array.prototype.forEach.call(document.querySelectorAll('#modeChoices .choice'), function (b) {
    b.addEventListener('click', function () { sel.secretMode = b.getAttribute('data-mode'); renderSetup(); });
  });
  $('dealBtn').addEventListener('click', function () {
    if (!sel) return;
    socket.emit('deal', { theme: sel.theme, count: sel.count, secretMode: sel.secretMode });
  });
  $('recheckBtn').addEventListener('click', function () { socket.emit('refresh'); });

  // ---------- board ----------
  function preload(urls) {
    return Promise.all(urls.map(function (u) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = img.onerror = function () { resolve(); };
        img.src = u;
      });
    }));
  }

  function renderBoard() {
    var key = state.round + '|' + state.board.join('|');
    if (key !== boardKey) {
      boardKey = key;
      boardReady = false;
      sel = null; // next time setup opens, start from the server's last settings
      closeModals();
      localFlips = new Set(state.me.flips);
      $('board').innerHTML = '';
      $('loading').classList.remove('hidden');
      $('boardWrap').classList.add('hidden');
      var thisKey = key;
      preload(state.board).then(function () {
        if (boardKey !== thisKey) return;
        buildTiles();
        boardReady = true;
        $('loading').classList.add('hidden');
        $('boardWrap').classList.remove('hidden');
        updateBoard();
      });
    }
    if (boardReady) updateBoard();
    updateTopbar();
  }

  function buildTiles() {
    var board = $('board');
    board.innerHTML = '';
    state.board.forEach(function (url, i) {
      var b = document.createElement('button');
      b.className = 'tile';
      b.setAttribute('data-i', i);
      b.setAttribute('aria-label', 'Face ' + (i + 1));
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      var back = document.createElement('div');
      back.className = 'back';
      b.appendChild(img);
      b.appendChild(back);
      b.addEventListener('click', function () { onTile(i); });
      board.appendChild(b);
    });
    layoutBoard();
  }

  function updateBoard() {
    if (Date.now() - lastFlipAt > 800) localFlips = new Set(state.me.flips);
    var choosing = state.phase === 'choosing';
    var tiles = $('board').children;
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].classList.toggle('down', !choosing && localFlips.has(i));
      tiles[i].classList.toggle('locked', choosing && state.me.secret !== null);
    }
    var prompt = $('prompt');
    if (choosing) {
      prompt.classList.remove('hidden');
      prompt.textContent = state.me.secret === null
        ? 'Tap the face you want to be.'
        : 'Waiting for the other player to choose…';
    } else {
      prompt.classList.add('hidden');
    }
    layoutBoard();
    updateTopbar();
  }

  function updateTopbar() {
    var active = state && (state.phase === 'choosing' || state.phase === 'playing');
    $('newGameBtn').classList.toggle('hidden', !active);
    $('myFaceBtn').classList.toggle('hidden', !(active && state.me.secret !== null));
    var up = $('upCount');
    if (state && state.phase === 'playing') {
      up.classList.remove('hidden');
      up.textContent = (state.board.length - localFlips.size) + ' up';
    } else {
      up.classList.add('hidden');
    }
  }

  function onTile(i) {
    if (!state) return;
    if (state.phase === 'choosing') {
      if (state.me.secret !== null) return;
      pendingChoice = i;
      $('chooseImg').src = state.board[i];
      openModal('chooseModal');
      return;
    }
    if (state.phase !== 'playing') return;
    var down = !localFlips.has(i);
    if (down) localFlips.add(i); else localFlips.delete(i);
    lastFlipAt = Date.now();
    $('board').children[i].classList.toggle('down', down);
    updateTopbar();
    socket.emit('flip', { index: i, down: down });
    // Re-sync with the server once taps settle.
    setTimeout(function () { if (Date.now() - lastFlipAt >= 800) socket.emit('refresh'); }, 900);
  }

  function layoutBoard() {
    var wrap = $('boardWrap');
    var board = $('board');
    var n = state ? state.board.length : 0;
    if (!n || wrap.classList.contains('hidden')) return;
    var cs = window.getComputedStyle(wrap);
    var w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var h = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var gap = w < 500 ? 6 : 10;
    var L = window.computeLayout(n, w, h, { gap: gap, minTile: 64 });
    board.style.gap = gap + 'px';
    board.style.gridTemplateColumns = 'repeat(' + L.cols + ', ' + L.tile + 'px)';
    board.style.gridAutoRows = L.tile + 'px';
    wrap.classList.toggle('scroll', L.scroll);
  }

  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutBoard, 60);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', function () { setTimeout(layoutBoard, 250); });

  // ---------- modals ----------
  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }
  function closeModals() { ['chooseModal', 'myFaceModal', 'newGameModal'].forEach(closeModal); }
  ['chooseModal', 'myFaceModal', 'newGameModal'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === $(id)) closeModal(id); });
  });

  $('chooseBack').addEventListener('click', function () { pendingChoice = null; closeModal('chooseModal'); });
  $('chooseYes').addEventListener('click', function () {
    if (pendingChoice !== null) socket.emit('chooseSecret', { index: pendingChoice });
    pendingChoice = null;
    closeModal('chooseModal');
  });

  $('myFaceBtn').addEventListener('click', function () {
    if (!state || state.me.secret === null) return;
    $('myFaceImg').src = state.board[state.me.secret];
    openModal('myFaceModal');
  });
  $('myFaceClose').addEventListener('click', function () { closeModal('myFaceModal'); });

  $('newGameBtn').addEventListener('click', function () { openModal('newGameModal'); });
  $('ngCancel').addEventListener('click', function () { closeModal('newGameModal'); });
  $('ngAgain').addEventListener('click', function () { closeModal('newGameModal'); socket.emit('newGame', { mode: 'again' }); });
  $('ngSettings').addEventListener('click', function () { closeModal('newGameModal'); socket.emit('newGame', { mode: 'settings' }); });

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg) {
    if (!msg) return;
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2500);
  }
  function friendlyError(code) {
    switch (code) {
      case 'not-enough-photos': return 'That theme does not have enough photos.';
      case 'bad-theme': return 'That theme is gone. Pick another.';
      case 'wrong-phase': return null; // the other player probably acted first; state will catch up
      case 'already-locked': return 'Your face is already locked in.';
      default: return null;
    }
  }
})();
