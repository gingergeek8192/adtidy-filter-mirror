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
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function atomicWrite(dest, data) {
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, data);
  const written = fs.readFileSync(tmp);
  if (!written.equals(data)) { fs.unlinkSync(tmp); throw new Error(`Write verification failed for ${dest}`); }
  fs.renameSync(tmp, dest);
}

async function downloadFilter(filterId, downloadUrl) {
  const data = await fetch(downloadUrl);
  if (data.length === 0) throw new Error(`Empty response for filter ${filterId}`);

  const text = data.toString('utf8');
  const checksum = text.match(/^!\s*Checksum:\s*(\S+)/m)?.[1];
  if (!checksum) throw new Error(`No checksum header in filter ${filterId}`);

  const normalized = text
    .replace(/^!\s*Checksum:.*(\r?\n|$)/m, '')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, '\n');
  const computed = crypto.createHash('md5').update(normalized, 'utf8').digest('base64').replace(/=+$/, '');
  if (computed !== checksum) throw new Error(`Checksum mismatch filter ${filterId}: expected ${checksum} got ${computed}`);

  atomicWrite(path.join(outputDir, `${filterId}.txt`), data);
  console.log(`  🟢 ${filterId}.txt  checksum:${checksum}`);
  return { filterId, checksum };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const raw = await fetch(sourceFiltersJson);
  const source = JSON.parse(raw.toString());
  const eligible = source.filters.filter(f => !f.deprecated);
  console.log(`Syncing ${eligible.length} non-deprecated filters from AdTidy`);

  const results = await Promise.allSettled(eligible.map(f => downloadFilter(f.filterId, f.downloadUrl)));

  const failed = results.filter(r => r.status === 'rejected');
  failed.forEach(r => console.warn(`  🔴 ${r.reason.message}`));
  if (failed.length) console.warn(`${failed.length} filters failed`);

  const succeeded = new Map(results.filter(r => r.status === 'fulfilled').map(r => [r.value.filterId, r.value.checksum]));

  source.filters = eligible
    .filter(f => succeeded.has(f.filterId))
    .map(f => ({
      ...f,
      checksum: succeeded.get(f.filterId),
      downloadUrl: `https://filters.adtidy.org/extension/chromium/filters/${f.filterId}.txt`,
      mirrorUrl: `${mirrorBase}/${f.filterId}.txt`,
      jsDelivrUrl: `${jsDelivrBase}/${f.filterId}.txt`,
      gitlabUrl: `${gitlabBase}/${f.filterId}.txt`,
    }));

  atomicWrite(outputFiltersJson, Buffer.from(JSON.stringify(source, null, '\t')));
  console.log(`Written ${outputFiltersJson} with ${source.filters.length} entries`);
}

main().catch(e => { console.error(e); process.exit(1); });
