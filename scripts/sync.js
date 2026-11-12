const fs = require('fs');
const crypto = require('crypto');
const cfg = require('./config');

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
  const res = await fetch(cfg.sourceFiltersJson);
  const body = await res.text();
  if (!res.ok) throw new Error(`Failed to fetch filters.json: ${res.status}`);
  const { filters } = JSON.parse(body);
  console.log(`🟢 Fetched filters.json — ${filters.filter(f => !f.deprecated).length} non-deprecated filters`);

  fs.mkdirSync(cfg.outputDir, { recursive: true });

  const results = [];
  let skipped = 0;

  await Promise.all(
    filters
      .filter((f) => !f.deprecated)
      .map(async (f) => {
        const url = `https://filters.adtidy.org/extension/chromium/filters/${f.filterId}.txt`;
        const dest = `${cfg.outputDir}/${f.filterId}.txt`;

        let text;
        try {
          const r = await fetch(url);
          text = await r.text();
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        } catch (e) {
          console.log(`🔴 [${f.filterId}] fetch failed — ${e.message}`);
          skipped++;
          return;
        }

        const { checksum, normalized } = normalize(text);

        if (checksum && !isValid(normalized, checksum)) {
          console.log(`🔴 [${f.filterId}] checksum mismatch — expected ${checksum}`);
          skipped++;
          return;
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
      })
  );

  results.sort((a, b) => a.filterId - b.filterId);

  fs.writeFileSync(cfg.outputFiltersJson, JSON.stringify({ filters: results }, null, '\t'), 'utf8');
  console.log(`\n🟢 Synced ${results.length} filters — 🔴 ${skipped} skipped`);
}

main().catch((e) => { console.error(`🔴 ${e.message}`); process.exit(1); });
