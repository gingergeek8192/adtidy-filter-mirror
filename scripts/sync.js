const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sourceFiltersJson, mirrorBase, jsDelivrBase, gitlabBase, outputDir, outputFiltersJson } = require('./config');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function atomicWrite(dest, data) {
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, data);
  const written = fs.readFileSync(tmp);
  if (!written.equals(data)) {
    fs.unlinkSync(tmp);
    throw new Error(`Write verification failed for ${dest}`);
  }
  fs.renameSync(tmp, dest);
}

async function downloadFilter(filterId, sourceUrl) {
  const data = await fetch(sourceUrl);
  if (data.length === 0) throw new Error(`Empty response for filter ${filterId}`);

  const text = data.toString('utf8');
  const checksum = text.match(/^!\s*Checksum:\s*(\S+)/m)?.[1];
  if (checksum) {
    const normalized = text
      .replace(/^!\s*Checksum:.*(?:\r?\n|$)/m, '')
      .replace(/\r/g, '\n')
      .replace(/\n+/g, '\n');
    const computed = crypto.createHash('md5').update(normalized, 'utf8').digest('base64').replace(/=+$/, '');
    if (computed !== checksum) throw new Error(`Checksum mismatch for filter ${filterId}: expected ${checksum}, got ${computed}`);
  }

  // checksum passed — write full original data to .tmp, verify read-back, then rename
  atomicWrite(path.join(outputDir, `${filterId}.txt`), data);
  console.log(`  🟢 ${filterId}.txt`);
  return { filterId, checksum: checksum || null };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const raw = await fetch(sourceFiltersJson);
  const { filters } = JSON.parse(raw.toString());

  const eligible = filters.filter(f => !f.deprecated);
  console.log(`Syncing ${eligible.length} filters (non-deprecated)`);

  const results = await Promise.allSettled(eligible.map(f => downloadFilter(f.filterId, f.downloadUrl)));

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    failed.forEach(r => console.warn(`  🟡 ${r.reason.message}`));
    console.warn(`${failed.length} filters failed`);
  }

  const succeeded = new Map(results.filter(r => r.status === 'fulfilled').map(r => [r.value.filterId, r.value.checksum]));

  const mirroredFilters = eligible
    .filter(f => succeeded.has(f.filterId))
    .map(f => ({
      ...f,
      checksum: succeeded.get(f.filterId),
      mirrorUrl: `${mirrorBase}/${f.filterId}.txt`,
      jsDelivrUrl: `${jsDelivrBase}/${f.filterId}.txt`,
      gitlabUrl: `${gitlabBase}/${f.filterId}.txt`,
    }));

  const original = JSON.parse(raw.toString());
  original.filters = mirroredFilters;

  const jsonData = Buffer.from(JSON.stringify(original, null, '\t'));
  atomicWrite(outputFiltersJson, jsonData);
  console.log(`Written ${outputFiltersJson} with ${mirroredFilters.length} entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
