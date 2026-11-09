const https = require('https');
const fs = require('fs');
const path = require('path');
const { jsDelivrBase, outputDir, outputFiltersJson } = require('./config');

const jsDelivrFiltersJson = 'https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json';
const purgeBase = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium';
const reportPath = 'public/jsdelivr-cache-report.json';

const AFTER_PURGE_WAIT  = 60_000;   // 1 minute after purge before first check
const BETWEEN_ROUNDS    = 5 * 60_000; // 5 minutes between retry rounds
const GIVE_UP_AFTER     = 5 * 60_000; // give up 5 minutes after first check starts
const ROUND_REQUESTS    = 3;          // hit each URL 3 times per round, 10s apart

const sleep = ms => new Promise(r => setTimeout(r, ms));

function get(url) {
  return new Promise(resolve => {
    const req = https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    }).on('error', () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
  });
}

function extractChecksum(body) {
  return body?.match(/^!\s*Checksum:\s*(\S+)/m)?.[1] ?? null;
}

async function purgeAll(purgeUrls) {
  console.log(`\nPurging ${purgeUrls.length} URLs (once)...`);
  const responses = await Promise.all(purgeUrls.map(url => get(url)));
  let ok = 0, throttled = 0, failed = 0;
  responses.forEach((body, i) => {
    try {
      const parsed = JSON.parse(body);
      const entry = parsed.paths[Object.keys(parsed.paths)[0]];
      if (entry.throttled === false && entry.providers) { ok++; }
      else { throttled++; console.warn(`  🟡 throttled: ${purgeUrls[i]}`); }
    } catch (_) { failed++; console.warn(`  🔴 failed: ${purgeUrls[i]}`); }
  });
  console.log(`  purge: ${ok} ok, ${throttled} throttled, ${failed} failed`);
}

// Hit each URL 3 times, 10s apart, return last checksum seen
async function probeUrl(url) {
  let last = null;
  for (let i = 0; i < ROUND_REQUESTS; i++) {
    if (i > 0) await sleep(10_000);
    const body = await get(url);
    const cs = extractChecksum(body);
    if (cs) last = cs;
  }
  return last;
}

async function checkRound(filters) {
  console.log(`\n  Probing ${filters.length} filter URLs (${ROUND_REQUESTS}x each, 10s apart)...`);
  const probes = await Promise.all(filters.map(f => probeUrl(`${jsDelivrBase}/${f.filterId}.txt`)));
  let matched = 0, mismatched = 0;
  probes.forEach((got, i) => {
    const want = filters[i].checksum;
    if (got === want) { matched++; }
    else { mismatched++; console.warn(`  🔴 filter ${filters[i].filterId}: want ${want} got ${got}`); }
  });
  console.log(`  round result: ${matched} match, ${mismatched} mismatch`);
  return mismatched === 0;
}

async function main() {
  const { filters } = JSON.parse(fs.readFileSync(outputFiltersJson, 'utf8'));
  const ids = fs.readdirSync(outputDir).filter(f => f.endsWith('.txt')).map(f => path.basename(f, '.txt'));

  const purgeUrls = [
    `${purgeBase}/filters.json`,
    ...ids.map(id => `${purgeBase}/filters/${id}.txt`),
  ];

  await purgeAll(purgeUrls);

  console.log(`\nWaiting ${AFTER_PURGE_WAIT / 1000}s after purge...`);
  await sleep(AFTER_PURGE_WAIT);

  const deadline = Date.now() + GIVE_UP_AFTER;
  let round = 1;
  let allMatch = false;

  while (true) {
    console.log(`\n=== Warm check round ${round} ===`);
    allMatch = await checkRound(filters);
    if (allMatch) { console.log('✅ All jsDelivr checksums match AdTidy checksums.'); break; }
    if (Date.now() >= deadline) { console.warn('⚠️  Give-up deadline reached — continuing anyway.'); break; }
    console.log(`Waiting ${BETWEEN_ROUNDS / 1000}s before next round...`);
    await sleep(BETWEEN_ROUNDS);
    round++;
  }

  const report = {
    updatedAt: new Date().toISOString(),
    allMatch,
    rounds: round,
    total: filters.length,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, '\t'));
  console.log(`\nReport written to ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
