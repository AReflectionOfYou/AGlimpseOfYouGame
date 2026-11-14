#!/usr/bin/env node
'use strict';

// Generates a "demo" theme of simple, original, colorful pictures so the game can be
// tried without any personal photos. Usage: npm run demo  (honors PHOTOS_DIR)

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { resolvePhotosDir } = require('../server/themes');

const COUNT = 24;
const SIZE = 800;
const PALETTE = [
  ['#e63946', '#f1faee'], ['#2a9d8f', '#e9c46a'], ['#264653', '#f4a261'], ['#ffb703', '#023047'],
  ['#8338ec', '#ffbe0b'], ['#3a86ff', '#ffffff'], ['#06d6a0', '#073b4c'], ['#ef476f', '#ffd166'],
  ['#118ab2', '#fefae0'], ['#bc6c25', '#fefae0'], ['#6a994e', '#f2e8cf'], ['#d62828', '#fcbf49'],
];
const LABELS = 'ABCDEFGHJKLMNPRSTUVWXYZ123456789'.split('');

function pattern(kind, fg) {
  switch (kind % 4) {
    case 0: // stripes
      return `<pattern id="p" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
        <rect width="30" height="60" fill="${fg}" opacity="0.18"/></pattern>`;
    case 1: // dots
      return `<pattern id="p" width="70" height="70" patternUnits="userSpaceOnUse">
        <circle cx="35" cy="35" r="12" fill="${fg}" opacity="0.2"/></pattern>`;
    case 2: // checks
      return `<pattern id="p" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="50" height="50" fill="${fg}" opacity="0.15"/><rect x="50" y="50" width="50" height="50" fill="${fg}" opacity="0.15"/></pattern>`;
    default: // rings
      return `<pattern id="p" width="120" height="120" patternUnits="userSpaceOnUse">
        <circle cx="60" cy="60" r="40" fill="none" stroke="${fg}" stroke-width="10" opacity="0.18"/></pattern>`;
  }
}

function shape(kind, fg) {
  const c = SIZE / 2;
  switch (kind % 6) {
    case 0: return `<circle cx="${c}" cy="${c}" r="270" fill="${fg}" opacity="0.9"/>`;
    case 1: return `<rect x="150" y="150" width="500" height="500" rx="60" fill="${fg}" opacity="0.9"/>`;
    case 2: return `<polygon points="${c},90 720,690 80,690" fill="${fg}" opacity="0.9"/>`;
    case 3: return `<polygon points="${c},70 730,${c} ${c},730 70,${c}" fill="${fg}" opacity="0.9"/>`;
    case 4: {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 140 : 330;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${fg}" opacity="0.9"/>`;
    }
    default: {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        pts.push(`${(c + 300 * Math.cos(a)).toFixed(1)},${(c + 300 * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${fg}" opacity="0.9"/>`;
    }
  }
}

function demoSvg(i) {
  const [bg, fg] = PALETTE[i % PALETTE.length];
  const label = LABELS[i % LABELS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>${pattern(i + Math.floor(i / 4), fg)}</defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#p)"/>
  ${shape(i + Math.floor(i / 6), fg)}
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="300"
        fill="${bg}" stroke="${fg}" stroke-width="6">${label}</text>
</svg>`;
}

async function makeDemo(photosDir = resolvePhotosDir(), count = COUNT) {
  const dir = path.join(photosDir, 'demo');
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (let i = 0; i < count; i++) {
    const file = path.join(dir, `demo-${String(i + 1).padStart(2, '0')}.jpg`);
    await sharp(Buffer.from(demoSvg(i))).jpeg({ quality: 82 }).toFile(file);
    written.push(file);
  }
  return { dir, written };
}

if (require.main === module) {
  makeDemo()
    .then(({ dir, written }) => {
      console.log(`Made ${written.length} demo pictures in ${dir}`);
      console.log('Start the game with: npm start  (or refresh the setup screen if it is running)');
    })
    .catch((err) => {
      console.error('Could not make demo pictures:', err.message);
      process.exit(1);
    });
}

module.exports = { makeDemo, demoSvg };
