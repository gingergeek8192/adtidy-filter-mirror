const https = require('https');
const fs = require('fs');
const path = require('path');
const { jsDelivrBase, outputDir } = require('./config');

const jsDelivrFiltersJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json';
const jsDelivrPingJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/ping.json';
const purgeBase = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium';
const purgePingJson = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/ping.json';
const reportPath = 'public/jsdelivr-cache-report.json';
const PURGE_WAIT = 5000;

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

  const purgeUrls = [
    purgePingJson,
    `${purgeBase}/filters.json`,
    ...ids.map(id => `${purgeBase}/filters/${id}.txt`),
  ];
  const cdnUrls = [
    jsDelivrPingJson,
    jsDelivrFiltersJson,
    ...ids.map(id => `${jsDelivrBase}/${id}.txt`),
  ];

  // Phase 1: purge all concurrently
  console.log(`Purging ${purgeUrls.length} URLs concurrently...`);
  const purgeResponses = await Promise.all(purgeUrls.map(request));
  console.log(`Purge complete. Waiting ${PURGE_WAIT / 1000}s for CDN propagation...`);

  // Phase 2: wait for CDN propagation
  await sleep(PURGE_WAIT);

  // Phase 3: warm all concurrently, log as each resolves
  console.log(`Warming ${cdnUrls.length} URLs concurrently...`);
  const results = await Promise.all(cdnUrls.map(async (cdnUrl, i) => {
    const purgeRes = purgeResponses[i];
    const warmRes = await request(cdnUrl);

    let throttled = null;
    let providers = null;
    try {
      const parsed = JSON.parse(purgeRes.body);
      const entry = parsed.paths[Object.keys(parsed.paths)[0]];
      throttled = entry.throttled;
      providers = entry.providers;
    } catch (_) {}

    const purgeOk = throttled === false && providers !== null;
    console.log(`  ${purgeOk && warmRes.status === 200 ? '🟢' : '🔴'} [purge:${purgeOk ? 'ok' : 'fail'}] [warm:${warmRes.status}] ${cdnUrl}`);
    return { url: cdnUrl, purgeUrl: purgeUrls[i], throttled, providers, warm: warmRes.status };
  }));

  const report = {
    updatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter(r => r.throttled === false && r.warm === 200).length,
    failed: results.filter(r => r.throttled !== false || r.warm !== 200).length,
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, '\t'));
  console.log(`Report written to ${reportPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
