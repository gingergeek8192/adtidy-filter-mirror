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

function request(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ url, status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    }).on('error', (e) => resolve({ url, status: e.message, body: null }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ url, status: 'timeout', body: null }); });
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
    const purge = await request(purgeUrl);
    let purgeOk = false;
    try {
      const parsed = JSON.parse(purge.body);
      const entry = parsed.paths[Object.keys(parsed.paths)[0]];
      purgeOk = entry.throttled === false && !!entry.providers;
    } catch (_) {}

    if (!purgeOk) {
      console.log(`  🔴 purge failed: ${purgeUrl}`);
      results.push({ url: cdnUrl, purge: 'failed', warm: null });
      continue;
    }

    await sleep(WAIT);
    const warm = await request(cdnUrl);
    results.push({ url: cdnUrl, purge: 'ok', warm: warm.status });
    console.log(`  ${warm.status === 200 ? '🟢' : '🔴'} [${warm.status}] ${cdnUrl}`);
  }

  const failed = results.filter(r => r.purge !== 'ok' || r.warm !== 200);
  if (failed.length) console.warn(`${failed.length} URLs did not complete successfully`);

  const report = {
    updatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter(r => r.purge === 'ok' && r.warm === 200).length,
    failed: failed.length,
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, '\t'));
  console.log(`Report written to ${reportPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
