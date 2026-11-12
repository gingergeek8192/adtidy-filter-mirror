const fs = require('fs');
const https = require('https');
const cfg = require('./config');

const get = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => data += c);
    res.on('end', () => resolve(data));
    res.on('error', reject);
  }).on('error', reject);
});

const PURGE_BASE = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main';

async function purge(path) {
  const data = await get(`${PURGE_BASE}${path}`);
  return JSON.parse(data);
}

async function main() {
  const { filters } = JSON.parse(fs.readFileSync(cfg.outputFiltersJson, 'utf8'));

  const paths = [
    '/public/ping.json',
    '/public/extension/chromium/filters.json',
    ...filters.map((f) => `/public/extension/chromium/filters/${f.filterId}.txt`),
  ];

  console.log(`🟡 Purging ${paths.length} jsDelivr URLs...`);

  const results = [];
  let ok = 0;
  let failed = 0;

  await Promise.all(
    paths.map(async (path) => {
      const cdnUrl = `${CDN_BASE}${path}`;
      const purgeUrl = `${PURGE_BASE}${path}`;
      try {
        const data = await purge(path);
        const pathData = Object.values(data.paths ?? {})[0] ?? {};
        const throttled = pathData.throttled ?? false;
        const providers = pathData.providers ?? {};
        const providerStr = Object.entries(providers).map(([k, v]) => `${k}:${v ? '✓' : '✗'}`).join(' ');
        const icon = throttled ? '🟡' : '🟢';
        console.log(`${icon} [purge] ${path} — throttled:${throttled} providers:[${providerStr}]`);
        results.push({ url: cdnUrl, purgeUrl, throttled, providers, ok: true });
        ok++;
      } catch (e) {
        console.log(`🔴 [purge] ${path} — ${e.message}`);
        results.push({ url: cdnUrl, purgeUrl, ok: false, error: e.message });
        failed++;
      }
    })
  );

  results.sort((a, b) => a.url.localeCompare(b.url));

  const report = {
    updatedAt: new Date().toISOString(),
    total: results.length,
    ok,
    failed,
    results,
  };

  fs.writeFileSync('public/jsdelivr-cache-report.json', JSON.stringify(report, null, '\t'), 'utf8');
  console.log(`\n🟢 Purged ${ok}/${results.length} — 🔴 ${failed} failed`);
}

main().catch((e) => { console.error(`🔴 ${e.message}`); process.exit(1); });
