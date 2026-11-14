'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanThemes, resolvePhotosDir, displayName } = require('../server/themes');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glimpse-themes-'));
}
function touch(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x');
}

test('display names come from folder names', () => {
  assert.equal(displayName('aunties'), 'Aunties');
  assert.equal(displayName('cousins-2025'), 'Cousins 2025');
  assert.equal(displayName('big_dogs'), 'Big Dogs');
});

test('scan ignores dotfiles, non-images, root files, and empty folders', () => {
  const dir = tmp();
  touch(path.join(dir, 'README.md'));
  touch(path.join(dir, 'loose.jpg'));
  touch(path.join(dir, 'aunties', 'a.jpg'));
  touch(path.join(dir, 'aunties', 'b.JPEG'));
  touch(path.join(dir, 'aunties', 'c.png'));
  touch(path.join(dir, 'aunties', 'd.webp'));
  touch(path.join(dir, 'aunties', '.hidden.jpg'));
  touch(path.join(dir, 'aunties', '.DS_Store'));
  touch(path.join(dir, 'aunties', 'notes.txt'));
  touch(path.join(dir, 'aunties', 'e.heic'));
  touch(path.join(dir, 'cousins-2025', 'z.jpg'));
  touch(path.join(dir, '.secret', 'x.jpg'));
  fs.mkdirSync(path.join(dir, 'empty'));
  touch(path.join(dir, 'onlytext', 'readme.txt'));

  const themes = scanThemes(dir);
  assert.deepEqual(themes.map((t) => t.name), ['Everyone', 'Aunties', 'Cousins 2025']);
  const aunties = themes.find((t) => t.id === 'aunties');
  assert.equal(aunties.count, 4);
  assert.ok(aunties.images.every((u) => u.startsWith('/photos/aunties/')));
  assert.equal(themes[0].id, '*');
  assert.equal(themes[0].count, 5);
});

test('theme folders are sorted alphabetically after Everyone', () => {
  const dir = tmp();
  for (const t of ['zoo', 'Aunts', 'middle']) touch(path.join(dir, t, '1.jpg'));
  assert.deepEqual(scanThemes(dir).map((t) => t.name), ['Everyone', 'Aunts', 'Middle', 'Zoo']);
});

test('no photos returns an empty list cleanly', () => {
  assert.deepEqual(scanThemes(tmp()), []);
  assert.deepEqual(scanThemes(path.join(tmp(), 'does-not-exist')), []);
});

test('photo URLs are encoded', () => {
  const dir = tmp();
  touch(path.join(dir, 'big family', 'a b.jpg'));
  assert.equal(scanThemes(dir)[1].images[0], '/photos/big%20family/a%20b.jpg');
});

test('PHOTOS_DIR is honored, then photos.config.json, then ./photos', () => {
  const root = tmp();
  assert.equal(resolvePhotosDir({ env: {}, root }), path.join(root, 'photos'));
  fs.writeFileSync(path.join(root, 'photos.config.json'), JSON.stringify({ photosDir: 'elsewhere' }));
  assert.equal(resolvePhotosDir({ env: {}, root }), path.join(root, 'elsewhere'));
  assert.equal(resolvePhotosDir({ env: { PHOTOS_DIR: '/tmp/shared-photos' }, root }), '/tmp/shared-photos');
  assert.equal(resolvePhotosDir({ env: { PHOTOS_DIR: '~/Pics' }, root }), path.join(os.homedir(), 'Pics'));
});
