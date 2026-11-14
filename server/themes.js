'use strict';

// Scans the photos folder to build the theme list.
// Each subfolder is a theme; "Everyone" combines them all and is listed first.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const EVERYONE_ID = '*';

function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// PHOTOS_DIR env var wins, then photos.config.json { "photosDir": "..." }, then ./photos.
function resolvePhotosDir({ env = process.env, root = ROOT } = {}) {
  if (env.PHOTOS_DIR && env.PHOTOS_DIR.trim()) {
    return path.resolve(root, expandHome(env.PHOTOS_DIR.trim()));
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'photos.config.json'), 'utf8'));
    if (cfg && typeof cfg.photosDir === 'string' && cfg.photosDir.trim()) {
      return path.resolve(root, expandHome(cfg.photosDir.trim()));
    }
  } catch {
    // no config file, or unreadable: fall through to the default
  }
  return path.join(root, 'photos');
}

function displayName(folder) {
  return folder
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function isImage(name) {
  return !name.startsWith('.') && IMAGE_EXTS.has(path.extname(name).toLowerCase());
}

function imageUrl(folder, file) {
  return `/photos/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
}

// Returns [{ id, name, count, images: [url, ...] }]. Empty list if nothing is found.
function scanThemes(photosDir) {
  let entries;
  try {
    entries = fs.readdirSync(photosDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const themes = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    let files;
    try {
      files = fs.readdirSync(path.join(photosDir, entry.name), { withFileTypes: true });
    } catch {
      continue;
    }
    const images = files
      .filter((f) => f.isFile() && isImage(f.name))
      .map((f) => f.name)
      .sort()
      .map((f) => imageUrl(entry.name, f));
    if (images.length === 0) continue;
    themes.push({ id: entry.name, name: displayName(entry.name), count: images.length, images });
  }

  themes.sort((a, b) => a.name.localeCompare(b.name));
  if (themes.length === 0) return [];

  const all = themes.flatMap((t) => t.images);
  return [{ id: EVERYONE_ID, name: 'Everyone', count: all.length, images: all }, ...themes];
}

module.exports = { resolvePhotosDir, scanThemes, displayName, isImage, EVERYONE_ID, IMAGE_EXTS };
