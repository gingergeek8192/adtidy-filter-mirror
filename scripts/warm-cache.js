const https = require('https');
const fs = require('fs');
const path = require('path');
const { jsDelivrBase, outputDir, outputFiltersJson } = require('./config');

const jsDelivrFiltersJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json';
const jsDelivrPingJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/ping.json';
const purgeBase = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium';
const purgePingJson = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/ping.json';
const reportPath = 'public/jsdelivr-cache-report.json';
const PURGE_WAIT = 10000;
const RETRY_DELAY = 1000;
const RETRY_MAX = 6;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, storedChecksum, attempt = 1) {
  const res = await request(url);
  const bodyChecksum = res.body?.match(/^!\s*Checksum:\s*(\S+)/m)?.[1] ?? null;
  if (storedChecksum && bodyChecksum && bodyChecksum !== storedChecksum && attempt < RETRY_MAX) {
    await sleep(RETRY_DELAY);
    return fetchWithRetry(url, storedChecksum, attempt + 1);
  }
  return { body: res.body, bodyChecksum };
}

function request(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ url, body: Buffer.concat(chunks).toString() }));
    }).on('error', (e) => resolve({ url, body: null }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ url, body: null }); });
  });
}

async function main() {
  const ids = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => path.basename(f, '.txt'));

  const { filters } = JSON.parse(fs.readFileSync(outputFiltersJson, 'utf8'));
  const checksumMap = new Map(filters.filter(f => f.checksum).map(f => [String(f.filterId), f.checksum]));

  const purgeUrls = [
    purgePingJson,
    `${purgeBase}/filters.json`,
    ...ids.map(id => `${purgeBase}/filters/${id}.txt`),
  ];

  const cdnUrls = [
    jsDelivrPingJson,
    jsDelivrFiltersJson,
    ...ids.map(id => ({ id, url: `${jsDelivrBase}/${id}.txt` })),
  ];

  // Step 1: fire all purge requests concurrently
  console.log(`Purging ${purgeUrls.length} URLs concurrently...`);
  const purgeResponses = await Promise.allSettled(purgeUrls.map(url => request(url)));

  // Step 2: parse each purge response object
  const purgeResults = purgeResponses.map((r, i) => {
    let throttled = null, providers = null;
    try {
      const parsed = JSON.parse(r.value.body);
      const entry = parsed.paths[Object.keys(parsed.paths)[0]];
      throttled = entry.throttled;
      providers = entry.providers;
    } catch (_) {}
    const purgeOk = throttled === false && providers !== null;
    console.log(`  ${purgeOk ? '🟢' : '🔴'} [purge:${purgeOk ? 'ok' : 'fail'}] ${purgeUrls[i]}`);
    return { throttled, providers, purgeOk };
  });

  // Step 3: sleep
  console.log(`\nWaiting ${PURGE_WAIT / 1000}s for CDN propagation...`);
  await sleep(PURGE_WAIT);

  // Step 4: request each file sequentially, validate checksum
  console.log(`\nWarming ${cdnUrls.length} URLs sequentially...`);
  const results = [];

  for (let i = 0; i < cdnUrls.length; i++) {
    const entry = cdnUrls[i];
    const { throttled, providers, purgeOk } = purgeResults[i];
    const isFilter = typeof entry === 'object';
    const url = isFilter ? entry.url : entry;
    const id = isFilter ? entry.id : null;

    let warmOk = false;
    let detail = 'fail';

    if (isFilter) {
      const storedChecksum = checksumMap.get(id);
      const { body, bodyChecksum } = await fetchWithRetry(url, storedChecksum);
      if (body) {
        if (storedChecksum && bodyChecksum) {
          warmOk = bodyChecksum === storedChecksum;
          detail = warmOk ? 'checksum:match' : `checksum:mismatch(got:${bodyChecksum},want:${storedChecksum})`;
        } else {
          warmOk = true;
          detail = storedChecksum ? 'no-checksum-in-response' : 'no-stored-checksum';
        }
      }
    } else {
      const res = await request(url);
      if (res.body) { warmOk = true; detail = 'non-filter'; }
    }

    const ok = purgeOk && warmOk;
    console.log(`  ${ok ? '🟢' : '🔴'} [warm:${detail}] ${url}`);
    results.push({ url, purgeUrl: purgeUrls[i], throttled, providers, warmOk, detail });
  }

  const report = {
    updatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter(r => r.throttled === false && r.warmOk).length,
    failed: results.filter(r => r.throttled !== false || !r.warmOk).length,
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, '\t'));
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
