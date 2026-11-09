const https = require('https');
const fs = require('fs');
const path = require('path');
const { jsDelivrBase, outputDir } = require('./config');

const jsDelivrFiltersJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json';
const jsDelivrPingJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/ping.json';
const purgeBase = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium';
const purgePingJson = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/ping.json';
const reportPath = 'public/jsdelivr-cache-report.json';
const WAIT = 500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      res.resume();
      resolve({ url, status: res.statusCode });
    }).on('error', (e) => resolve({ url, status: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ url, status: 'timeout' }); });
  });
}

async function main() {
  const ids = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => path.basename(f, '.txt'));

  const pairs = [
    [purgePingJson, jsDelivrPingJson],
    [`${purgeBase}/filters.json`, jsDelivrFiltersJson],
    ...ids.map(id => [`${purgeBase}/filters/${id}.txt`, `${jsDelivrBase}/${id}.txt`]),
  ];

  const results = [];

  for (const [purgeUrl, cdnUrl] of pairs) {
    await get(purgeUrl);
    await sleep(WAIT);
    const result = await get(cdnUrl);
    await sleep(WAIT);
    results.push(result);
    console.log(`  ${result.status === 200 ? '🟢' : '🔴'} [${result.status}] ${cdnUrl}`);
  }

  const failed = results.filter(r => r.status !== 200);
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
