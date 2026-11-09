const fs = require('fs');
const cfg = require('./config');

const PURGE_BASE = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main';

async function purge(path) {
  const purgeUrl = `${PURGE_BASE}${path}`;
  const r = await fetch(purgeUrl);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
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
        const pathData = data.paths?.[path] ?? {};
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
