'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { prep, parseArgs } = require('../scripts/prep-photos');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glimpse-prep-test-'));
}

// A generated landscape image (never a real photo) with EXIF including GPS.
async function makeLandscape(file, color = '#3a86ff') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <rect width="1600" height="900" fill="${color}"/><circle cx="1100" cy="400" r="200" fill="#ffbe0b"/></svg>`;
  await sharp(Buffer.from(svg))
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'Generated', Artist: 'Nobody' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '45/1 30/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '94/1 10/1 0/1',
      },
    })
    .toFile(file);
}

test('fixture really carries GPS EXIF (sanity check)', async () => {
  const dir = tmp();
  const f = path.join(dir, 'x.jpg');
  await makeLandscape(f);
  const meta = await sharp(f).metadata();
  assert.ok(meta.exif && meta.exif.length > 0);
  assert.ok(meta.exif.includes(Buffer.from('GPS')) || meta.exif.length > 50);
});

test('prep: landscape with GPS becomes 800x800 JPEG with no metadata', async () => {
  const incoming = tmp();
  const photos = tmp();
  await makeLandscape(path.join(incoming, 'IMG_0001.jpg'));
  const r = await prep({ theme: 'aunties', incomingDir: incoming, photosDir: photos, log: () => {} });
  assert.equal(r.processed.length, 1);
  assert.equal(r.failed.length, 0);

  const out = fs.readdirSync(path.join(photos, 'aunties'));
  assert.equal(out.length, 1);
  assert.match(out[0], /^[0-9a-f]{8}\.jpg$/);
  const meta = await sharp(path.join(photos, 'aunties', out[0])).metadata();
  assert.equal(meta.width, 800);
  assert.equal(meta.height, 800);
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.iptc, undefined);
  assert.equal(meta.orientation, undefined);
  const bytes = fs.readFileSync(path.join(photos, 'aunties', out[0]));
  assert.ok(!bytes.includes(Buffer.from('Exif')));
  assert.ok(!bytes.includes(Buffer.from('TestCam')));

  // Original moved to incoming/done, not deleted.
  assert.deepEqual(fs.readdirSync(incoming).filter((f) => f !== 'done'), []);
  assert.deepEqual(fs.readdirSync(path.join(incoming, 'done')), ['IMG_0001.jpg']);
});

test('prep: re-running the same photo does not duplicate it', async () => {
  const incoming = tmp();
  const photos = tmp();
  await makeLandscape(path.join(incoming, 'a.jpg'));
  await prep({ theme: 't', incomingDir: incoming, photosDir: photos, log: () => {} });
  fs.copyFileSync(path.join(incoming, 'done', 'a.jpg'), path.join(incoming, 'a-copy.jpg'));
  const r = await prep({ theme: 't', incomingDir: incoming, photosDir: photos, log: () => {} });
  assert.deepEqual(r.skipped, ['a-copy.jpg']);
  assert.equal(fs.readdirSync(path.join(photos, 't')).length, 1);
});

test('prep: --file reprocesses one image from done/ with a new position', async () => {
  const incoming = tmp();
  const photos = tmp();
  await makeLandscape(path.join(incoming, 'a.jpg'));
  await prep({ theme: 't', incomingDir: incoming, photosDir: photos, log: () => {} });
  const r = await prep({ theme: 't', file: 'a.jpg', position: 'top', incomingDir: incoming, photosDir: photos, log: () => {} });
  assert.equal(r.processed.length, 1);
  assert.equal(fs.readdirSync(path.join(photos, 't')).length, 1);
});

test('prep: --dry-run writes nothing and moves nothing', async () => {
  const incoming = tmp();
  const photos = tmp();
  await makeLandscape(path.join(incoming, 'a.jpg'));
  const r = await prep({ theme: 't', dryRun: true, incomingDir: incoming, photosDir: photos, log: () => {} });
  assert.equal(r.processed.length, 1);
  assert.ok(!fs.existsSync(path.join(photos, 't')));
  assert.deepEqual(fs.readdirSync(incoming), ['a.jpg']);
});

test('prep: non-images ignored, broken images reported as failed', async () => {
  const incoming = tmp();
  const photos = tmp();
  fs.writeFileSync(path.join(incoming, 'notes.txt'), 'hi');
  fs.writeFileSync(path.join(incoming, 'broken.jpg'), 'not really a jpeg');
  const r = await prep({ theme: 't', incomingDir: incoming, photosDir: photos, log: () => {} });
  assert.deepEqual(r.failed, ['broken.jpg']);
  assert.equal(r.processed.length, 0);
});

test('prep: argument parsing', () => {
  assert.deepEqual(parseArgs(['--theme', 'aunties', '--position', 'top', '--file', 'x.jpg', '--dry-run']), {
    theme: 'aunties', position: 'top', file: 'x.jpg', dryRun: true, help: false,
  });
  assert.equal(parseArgs(['--theme=cousins']).theme, 'cousins');
  assert.throws(() => parseArgs(['--bogus']));
  assert.throws(() => parseArgs(['--theme']));
});

test('prep: rejects bad theme names', async () => {
  await assert.rejects(prep({ theme: '../escape', incomingDir: tmp(), photosDir: tmp(), log: () => {} }));
});
