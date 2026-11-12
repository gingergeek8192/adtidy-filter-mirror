const fs = require('fs');
const crypto = require('crypto');
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

function normalize(text) {
  return {
    checksum: text.match(/^!\s*Checksum:\s*(\S+)/m)?.[1],
    normalized: text
      .replace(/^!\s*Checksum:.*(?:\r?\n|$)/m, '')
      .replace(/\r/g, '\n')
      .replace(/\n+/g, '\n'),
  };
}

function isValid(normalized, checksum) {
  return (
    crypto.createHash('md5').update(normalized, 'utf8').digest('base64').replace(/=+$/, '') ===
    checksum
  );
}

async function main() {
  const body = await get(cfg.sourceFiltersJson).catch((e) => { throw new Error(`Failed to fetch filters.json: ${e.message}`); });
  const { filters } = JSON.parse(body);
  console.log(`🟢 Fetched filters.json — ${filters.filter(f => !f.deprecated).length} non-deprecated filters`);

  fs.mkdirSync(cfg.outputDir, { recursive: true });

  const results = [];
  let skipped = 0;

  const settled = await Promise.allSettled(
    filters.filter((f) => !f.deprecated).map((f) => get(`https://filters.adtidy.org/extension/chromium/filters/${f.filterId}.txt`).then((text) => ({ f, text })))
  );

  for (const result of settled) {
    if (result.status === 'rejected') {
      console.log(`🔴 fetch failed — ${result.reason.message}`);
      skipped++;
      continue;
    }
    const { f, text } = result.value;
    const dest = `${cfg.outputDir}/${f.filterId}.txt`;
    const { checksum, normalized } = normalize(text);

    if (checksum && !isValid(normalized, checksum)) {
      console.log(`🔴 [${f.filterId}] checksum mismatch — expected ${checksum}`);
      skipped++;
      continue;
    }

    console.log(`🟢 [${f.filterId}] checksum valid — ${checksum ?? 'no checksum in file'}`);
    fs.writeFileSync(dest, text, 'utf8');

    const { downloadUrl: _drop, ...rest } = f;
    results.push({
      ...rest,
      downloadUrl: `https://filters.adtidy.org/extension/chromium/filters/${f.filterId}.txt`,
      checksum,
      mirrorUrl: `${cfg.mirrorBase}/${f.filterId}.txt`,
      jsDelivrUrl: `${cfg.jsDelivrBase}/${f.filterId}.txt`,
      gitlabUrl: `${cfg.gitlabBase}/${f.filterId}.txt`,
    });
  }

  results.sort((a, b) => a.filterId - b.filterId);

  fs.writeFileSync(cfg.outputFiltersJson, JSON.stringify({ filters: results }, null, '\t'), 'utf8');
  console.log(`\n🟢 Synced ${results.length} filters — 🔴 ${skipped} skipped`);
}

main().catch((e) => { console.error(`🔴 ${e.message}`); process.exit(1); });
