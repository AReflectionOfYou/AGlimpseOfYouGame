'use strict';

// Finds the addresses other devices on the home WiFi can use to reach this computer.

const os = require('node:os');
const { execFileSync } = require('node:child_process');

function isPrivateIPv4(ip) {
  return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

// Non-internal IPv4 addresses, best guess first (private ranges, then en0/wlan, then others).
function lanAddresses(interfaces = os.networkInterfaces()) {
  const found = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const a of addrs || []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue; // link-local, not useful
      let score = 0;
      if (isPrivateIPv4(a.address)) score += 10;
      if (/^(en0|wlan0|wlp|wl)/.test(name)) score += 5;
      if (/^(utun|bridge|vbox|vmnet|docker|veth)/.test(name)) score -= 20;
      found.push({ address: a.address, name, score });
    }
  }
  found.sort((x, y) => y.score - x.score);
  return found.map((f) => f.address);
}

// The Bonjour (.local) hostname, e.g. "mikes-macbook.local", or null.
function localHostname() {
  if (process.platform === 'darwin') {
    try {
      const name = execFileSync('scutil', ['--get', 'LocalHostName'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000,
      }).trim();
      if (name) return `${name.toLowerCase()}.local`;
    } catch {
      // fall through
    }
  }
  const host = os.hostname();
  if (host.endsWith('.local')) return host;
  return null;
}

function joinUrls(port) {
  const ips = lanAddresses();
  const host = localHostname();
  return {
    ip: ips.length ? `http://${ips[0]}:${port}` : null,
    local: host ? `http://${host}:${port}` : null,
    fallback: `http://localhost:${port}`,
  };
}

module.exports = { lanAddresses, localHostname, joinUrls, isPrivateIPv4 };
