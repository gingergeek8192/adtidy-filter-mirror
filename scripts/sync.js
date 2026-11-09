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
  if (!res.ok) throw new Error(`Failed to fetch filters.json: ${res.status}`);
  const { filters } = await res.json();

  fs.mkdirSync(cfg.outputDir, { recursive: true });

  const results = [];

  await Promise.all(
    filters
      .filter((f) => !f.deprecated)
      .map(async (f) => {
        const url = `https://filters.adtidy.org/extension/chromium/filters/${f.filterId}.txt`;
        const dest = `${cfg.outputDir}/${f.filterId}.txt`;

        let text;
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          text = await r.text();
        } catch (e) {
          console.warn(`[skip] ${f.filterId}: fetch error — ${e.message}`);
          return;
        }

        const { checksum, normalized } = normalize(text);

        if (checksum && !isValid(normalized, checksum)) {
          console.warn(`[skip] ${f.filterId}: checksum mismatch`);
          return;
        }

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

  const out = { filters: results };
  fs.writeFileSync(cfg.outputFiltersJson, JSON.stringify(out, null, '\t'), 'utf8');
  console.log(`Synced ${results.length} filters`);
}

main().catch((e) => { console.error(e); process.exit(1); });
