// Grid sizing for the board. Pure function, shared by the browser and the tests.
(function (root) {
  'use strict';

  /**
   * Choose the column count that gives the biggest square tiles.
   * @param {number} n       number of faces
   * @param {number} width   available width in px
   * @param {number} height  available height in px
   * @param {object} [opts]
   * @param {number} [opts.gap=8]       gap between tiles in px
   * @param {number} [opts.minTile=64]  below this, scroll instead of shrinking
   * @returns {{cols:number, rows:number, tile:number, scroll:boolean}}
   */
  function computeLayout(n, width, height, opts) {
    var gap = opts && opts.gap != null ? opts.gap : 8;
    var minTile = opts && opts.minTile != null ? opts.minTile : 64;
    n = Math.max(1, Math.floor(n));
    width = Math.max(0, width);
    height = Math.max(0, height);

    var best = { cols: 1, rows: n, tile: -Infinity, scroll: false };
    for (var cols = 1; cols <= n; cols++) {
      var rows = Math.ceil(n / cols);
      var tw = (width - gap * (cols - 1)) / cols;
      var th = (height - gap * (rows - 1)) / rows;
      var tile = Math.min(tw, th);
      if (tile > best.tile) best = { cols: cols, rows: rows, tile: tile, scroll: false };
    }

    if (best.tile < minTile) {
      // Too small to tap comfortably: fit as many minTile columns as the width allows,
      // let the tiles grow to fill the width, and scroll vertically.
      var c = Math.max(1, Math.min(n, Math.floor((width + gap) / (minTile + gap))));
      var t = (width - gap * (c - 1)) / c;
      best = { cols: c, rows: Math.ceil(n / c), tile: t, scroll: true };
    }

    best.tile = Math.max(0, Math.floor(best.tile));
    return best;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { computeLayout: computeLayout };
  else root.computeLayout = computeLayout;
})(typeof self !== 'undefined' ? self : this);
