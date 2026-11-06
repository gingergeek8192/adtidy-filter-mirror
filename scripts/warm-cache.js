const https = require('https');
const fs = require('fs');
const path = require('path');
const { jsDelivrBase, outputDir, outputFiltersJson } = require('./config');

const jsDelivrFiltersJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json';

function ping(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      res.resume();
      resolve({ url, status: res.statusCode });
    }).on('error', (e) => resolve({ url, status: e.message }));
  });
}

async function main() {
  const ids = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => path.basename(f, '.txt'));

  const urls = [
    jsDelivrFiltersJson,
    ...ids.map(id => `${jsDelivrBase}/${id}.txt`),
  ];

  console.log(`Warming ${urls.length} jsDelivr URLs...`);
  const results = await Promise.all(urls.map(ping));

  const failed = results.filter(r => r.status !== 200);
  results.forEach(r => console.log(`  ${r.status === 200 ? '✓' : '✗'} ${r.url}`));
  if (failed.length) console.warn(`${failed.length} URLs did not return 200`);
}

main().catch((e) => { console.error(e); process.exit(1); });
