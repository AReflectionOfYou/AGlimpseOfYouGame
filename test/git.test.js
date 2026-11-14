'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const IMAGE = /\.(jpe?g|png|webp|heic|gif|tiff?|bmp|avif)$/i;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

test('no photos in git: only photos/README.md is tracked under photos/', () => {
  const files = git(['ls-files', 'photos']).split('\n').filter(Boolean);
  assert.deepEqual(files, ['photos/README.md']);
});

test('no image files are tracked anywhere in the repo', () => {
  const files = git(['ls-files']).split('\n').filter(Boolean);
  assert.deepEqual(files.filter((f) => IMAGE.test(f)), []);
});

test('.gitignore keeps photos, incoming, and photos.config.json out', () => {
  const ignored = (p) => {
    try {
      git(['check-ignore', '-q', '--no-index', p]);
      return true;
    } catch {
      return false;
    }
  };
  assert.ok(ignored('photos/aunties/a.jpg'));
  assert.ok(ignored('photos/demo/demo-01.jpg'));
  assert.ok(ignored('incoming/IMG_0001.jpg'));
  assert.ok(ignored('incoming/done/IMG_0001.jpg'));
  assert.ok(ignored('photos.config.json'));
  assert.ok(!ignored('photos/README.md'));
});
