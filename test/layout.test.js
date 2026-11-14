'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLayout } = require('../public/layout');

// Rough usable board areas after the top bar and safe areas.
const PHONE_PORTRAIT = [370, 680];
const PHONE_LANDSCAPE = [760, 300];
const IPAD_LANDSCAPE = [1160, 720];
const IPAD_PORTRAIT = [800, 1060];

test('6 faces on a portrait phone: 2x3 big tiles', () => {
  const L = computeLayout(6, ...PHONE_PORTRAIT);
  assert.deepEqual([L.cols, L.rows], [2, 3]);
  assert.ok(L.tile > 150);
  assert.equal(L.scroll, false);
});

test('24 faces on a portrait phone: about 4x6', () => {
  const L = computeLayout(24, ...PHONE_PORTRAIT);
  assert.deepEqual([L.cols, L.rows], [4, 6]);
  assert.ok(L.tile >= 64);
  assert.equal(L.scroll, false);
});

test('6 and 24 faces on a landscape phone: wide grids', () => {
  const six = computeLayout(6, ...PHONE_LANDSCAPE);
  assert.deepEqual([six.cols, six.rows], [3, 2]);
  const many = computeLayout(24, ...PHONE_LANDSCAPE);
  assert.ok(many.cols > many.rows);
  assert.ok(many.cols * many.rows >= 24);
  assert.ok(many.tile * many.rows <= PHONE_LANDSCAPE[1]);
});

test('24 faces on a landscape iPad: about 6x4', () => {
  const L = computeLayout(24, ...IPAD_LANDSCAPE);
  assert.deepEqual([L.cols, L.rows], [6, 4]);
  const six = computeLayout(6, ...IPAD_LANDSCAPE);
  assert.deepEqual([six.cols, six.rows], [3, 2]);
});

test('24 faces on a portrait iPad: about 4x6', () => {
  const L = computeLayout(24, ...IPAD_PORTRAIT);
  assert.deepEqual([L.cols, L.rows], [4, 6]);
});

test('the whole board fits inside the area', () => {
  for (const n of [6, 9, 12, 16, 20, 24]) {
    for (const [w, h] of [PHONE_PORTRAIT, PHONE_LANDSCAPE, IPAD_LANDSCAPE, IPAD_PORTRAIT]) {
      const gap = 8;
      const L = computeLayout(n, w, h, { gap });
      assert.ok(L.cols * L.rows >= n);
      if (!L.scroll) {
        assert.ok(L.cols * L.tile + (L.cols - 1) * gap <= w + 0.5, `${n} @ ${w}x${h} too wide`);
        assert.ok(L.rows * L.tile + (L.rows - 1) * gap <= h + 0.5, `${n} @ ${w}x${h} too tall`);
      }
    }
  }
});

test('tiny screens scroll instead of shrinking below 64px', () => {
  const L = computeLayout(24, 320, 200);
  assert.equal(L.scroll, true);
  assert.ok(L.tile >= 64);
  assert.ok(L.cols * L.tile <= 320);
});
