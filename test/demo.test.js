'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const { scanThemes } = require('../server/themes');

const ROOT = path.resolve(__dirname, '..');

test('npm run demo creates a playable demo theme of at least 24 images', async () => {
  const photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glimpse-demo-'));
  execFileSync('npm', ['run', '--silent', 'demo'], {
    cwd: ROOT,
    env: { ...process.env, PHOTOS_DIR: photosDir },
    stdio: 'ignore',
  });
  const themes = scanThemes(photosDir);
  const demo = themes.find((t) => t.id === 'demo');
  assert.ok(demo, 'demo theme exists');
  assert.ok(demo.count >= 24);
  const files = fs.readdirSync(path.join(photosDir, 'demo'));
  const meta = await sharp(path.join(photosDir, 'demo', files[0])).metadata();
  assert.equal(meta.width, meta.height);
  assert.equal(meta.format, 'jpeg');
  // Images should differ from one another.
  const sizes = new Set(files.map((f) => fs.statSync(path.join(photosDir, 'demo', f)).size));
  assert.ok(sizes.size > 12);
});
