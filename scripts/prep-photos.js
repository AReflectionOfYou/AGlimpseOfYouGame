#!/usr/bin/env node
'use strict';

// Turns full-size photo exports into board-ready images:
// square crop, 800x800 JPEG, EXIF rotation applied, ALL metadata (including GPS) removed.
//
//   npm run prep -- --theme aunties [--position attention|center|top] [--file IMG_1234.jpg] [--dry-run]
//
// Reads from incoming/, writes to <photos>/<theme>/, then moves originals to incoming/done/.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const { resolvePhotosDir } = require('../server/themes');

const ROOT = path.resolve(__dirname, '..');
const INPUT_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const SIZE = 800;
const QUALITY = 80;
const POSITIONS = {
  attention: sharp.strategy.attention,
  center: 'centre',
  centre: 'centre',
  top: 'top',
};

const USAGE = `Usage: npm run prep -- --theme <name> [options]

Options:
  --theme <name>        Theme folder to write into (e.g. aunties). Required.
  --position <how>      Cropping: attention (default), center, or top.
  --file <name>         Process (or reprocess) just this one file from incoming/ or incoming/done/.
  --dry-run             Show what would happen without writing anything.
  --help                Show this help.`;

function parseArgs(argv) {
  const opts = { theme: null, position: 'attention', file: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--theme') opts.theme = next();
    else if (a.startsWith('--theme=')) opts.theme = a.slice(8);
    else if (a === '--position') opts.position = next();
    else if (a.startsWith('--position=')) opts.position = a.slice(11);
    else if (a === '--file') opts.file = next();
    else if (a.startsWith('--file=')) opts.file = a.slice(7);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  return opts;
}

function validTheme(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(name);
}

function shortHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

function listInputs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith('.') && INPUT_EXTS.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(dir, e.name))
      .sort();
  } catch {
    return [];
  }
}

// Returns a path sharp can read. HEIC is converted with macOS's built-in sips.
function readablePath(file, tmpDir) {
  if (path.extname(file).toLowerCase() !== '.heic') return { path: file };
  if (process.platform !== 'darwin') {
    return { skip: 'HEIC needs macOS to convert. Export from Photos as JPEG instead.' };
  }
  const out = path.join(tmpDir, `${path.basename(file, path.extname(file))}-${Date.now()}.jpg`);
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', file, '--out', out], { stdio: 'ignore' });
    return { path: out, temp: true };
  } catch {
    return { error: 'sips could not convert this HEIC file' };
  }
}

async function processImage(srcPath, position) {
  // sharp drops all metadata (EXIF, GPS, XMP, IPTC, ICC) unless asked to keep it.
  return sharp(srcPath, { failOn: 'none' })
    .rotate() // apply EXIF orientation, then forget it
    .resize(SIZE, SIZE, { fit: 'cover', position: POSITIONS[position] })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
}

function moveTo(file, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let dest = path.join(dir, path.basename(file));
  if (fs.existsSync(dest)) {
    const ext = path.extname(file);
    dest = path.join(dir, `${path.basename(file, ext)}-${Date.now()}${ext}`);
  }
  fs.renameSync(file, dest);
  return dest;
}

/**
 * @returns {Promise<{processed:string[], skipped:string[], failed:string[], outDir:string}>}
 */
async function prep({
  theme,
  position = 'attention',
  file = null,
  dryRun = false,
  incomingDir = path.join(ROOT, 'incoming'),
  photosDir = resolvePhotosDir(),
  log = console.log,
}) {
  if (!validTheme(theme)) throw new Error('Please give a theme name, e.g. --theme aunties (letters, numbers, - and _).');
  if (!(position in POSITIONS)) throw new Error('--position must be attention, center, or top.');

  const doneDir = path.join(incomingDir, 'done');
  const outDir = path.join(photosDir, theme);
  const result = { processed: [], skipped: [], failed: [], outDir };

  let inputs;
  if (file) {
    const candidates = [path.join(incomingDir, file), path.join(doneDir, file)];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) throw new Error(`Could not find ${file} in ${incomingDir} or ${doneDir}`);
    inputs = [found];
  } else {
    inputs = listInputs(incomingDir);
  }

  if (inputs.length === 0) {
    log(`Nothing to do: no photos in ${incomingDir}`);
    return result;
  }

  if (!dryRun) fs.mkdirSync(outDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glimpse-prep-'));

  try {
    for (const input of inputs) {
      const name = path.basename(input);
      try {
        const hash = shortHash(fs.readFileSync(input));
        const outFile = path.join(outDir, `${hash}.jpg`);
        const exists = fs.existsSync(outFile);
        const inDone = path.dirname(input) === doneDir;

        if (exists && !file) {
          log(`  skip   ${name}  (already present as ${hash}.jpg)`);
          result.skipped.push(name);
          if (!dryRun && !inDone) moveTo(input, doneDir);
          continue;
        }

        if (dryRun) {
          log(`  would  ${name}  ->  ${path.join(theme, hash + '.jpg')}${exists ? ' (replace)' : ''}`);
          result.processed.push(name);
          continue;
        }

        const readable = readablePath(input, tmpDir);
        if (readable.skip) {
          log(`  skip   ${name}  (${readable.skip})`);
          result.skipped.push(name);
          continue;
        }
        if (readable.error) throw new Error(readable.error);

        const buf = await processImage(readable.path, position);
        fs.writeFileSync(outFile, buf);
        if (!inDone) moveTo(input, doneDir);
        log(`  done   ${name}  ->  ${path.join(theme, hash + '.jpg')}`);
        result.processed.push(name);
      } catch (err) {
        log(`  FAIL   ${name}  (${err.message})`);
        result.failed.push(name);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return result;
}

if (require.main === module) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message + '\n\n' + USAGE);
    process.exit(1);
  }
  if (opts.help || !opts.theme) {
    console.log(USAGE);
    process.exit(opts.help ? 0 : 1);
  }
  console.log(`${opts.dryRun ? 'Dry run: ' : ''}Preparing photos for theme "${opts.theme}"`);
  prep(opts)
    .then((r) => {
      console.log(`\nProcessed: ${r.processed.length}   Skipped: ${r.skipped.length}   Failed: ${r.failed.length}`);
      if (!opts.dryRun && r.processed.length) console.log(`Photos are in ${r.outDir}`);
      process.exit(r.failed.length ? 1 : 0);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { prep, parseArgs, processImage, shortHash };
