const https = require('https');
const fs = require('fs');
const path = require('path');
const { jsDelivrBase, outputDir } = require('./config');

const jsDelivrFiltersJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json';
const jsDelivrPingJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/ping.json';
const purgeBase = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium';
const purgePingJson = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/ping.json';
const reportPath = 'public/jsdelivr-cache-report.json';

function ping(url, retries = 3) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      res.resume();
      if (res.statusCode !== 200 && retries > 0)
        return resolve(ping(url, retries - 1));
      resolve({ url, status: res.statusCode });
    }).on('error', (e) => {
      if (retries > 0) return resolve(ping(url, retries - 1));
      resolve({ url, status: e.message });
    });
    req.setTimeout(15000, () => { req.destroy(); resolve({ url, status: 'timeout' }); });
  });
}

async function main() {
  const ids = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => path.basename(f, '.txt'));

  const cdnUrls = [
    jsDelivrPingJson,
    jsDelivrFiltersJson,
    ...ids.map(id => `${jsDelivrBase}/${id}.txt`),
  ];

  const purgeUrls = [
    purgePingJson,
    `${purgeBase}/filters.json`,
    ...ids.map(id => `${purgeBase}/filters/${id}.txt`),
  ];

  console.log(`Purging ${purgeUrls.length} jsDelivr URLs...`);
  await Promise.all(purgeUrls.map(ping));

  console.log(`Warming ${cdnUrls.length} jsDelivr URLs...`);
  const results = await Promise.all(cdnUrls.map(ping));

  const failed = results.filter(r => r.status !== 200);
  results.forEach(r => console.log(`  ${r.status === 200 ? '🟢' : r.status === 403 ? '🟡' : '🔴'} [${r.status}] ${r.url}`));
  if (failed.length) console.warn(`${failed.length} URLs did not return 200`);

  const report = {
    updatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter(r => r.status === 200).length,
    failed: failed.length,
    results: results.map(r => ({ url: r.url, status: r.status })),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, '\t'));
  console.log(`Report written to ${reportPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
