const fs = require('fs');
const crypto = require('crypto');
const cfg = require('./config');

const BATCH_SIZE = 3;
const BATCH_INTERVAL_MS = 6_000;
const ROUND_WAIT_MS = 120_000;
const MAX_ROUNDS = 5;

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAndCheck(entry) {
  const r = await fetch(entry.url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  if (!entry.isFilter) {
    entry.warmOk = true;
    entry.detail = 'non-filter';
    console.log(`🟢 [warm] ${entry.url} — non-filter ok`);
    return;
  }

  const text = await r.text();
  const { checksum, normalized } = normalize(text);

  if (!checksum) {
    entry.warmOk = false;
    entry.detail = 'no-checksum-in-response';
    console.log(`🟡 [warm] ${entry.url} — no checksum in response (jsDelivr not ready)`);
    return;
  }

  if (entry.expectedChecksum) {
    if (checksum === entry.expectedChecksum && isValid(normalized, checksum)) {
      entry.warmOk = true;
      entry.detail = 'checksum:match';
      console.log(`🟢 [warm] ${entry.url} — checksum match ${checksum}`);
    } else {
      entry.warmOk = false;
      entry.detail = 'checksum:mismatch';
      console.log(`🔴 [warm] ${entry.url} — checksum mismatch served:${checksum} expected:${entry.expectedChecksum}`);
    }
  } else {
    if (isValid(normalized, checksum)) {
      entry.warmOk = true;
      entry.detail = 'checksum:match';
      console.log(`🟢 [warm] ${entry.url} — checksum valid ${checksum}`);
    } else {
      entry.warmOk = false;
      entry.detail = 'checksum:mismatch';
      console.log(`🔴 [warm] ${entry.url} — checksum invalid ${checksum}`);
    }
  }
}

async function runWave(pending) {
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (entry) => {
        try {
          await fetchAndCheck(entry);
        } catch (e) {
          entry.warmOk = false;
          entry.detail = `error: ${e.message}`;
          console.log(`🔴 [warm] ${entry.url} — ${e.message}`);
        }
      })
    );
    if (i + BATCH_SIZE < pending.length) await sleep(BATCH_INTERVAL_MS);
  }
}

async function main() {
  const { filters } = JSON.parse(fs.readFileSync(cfg.outputFiltersJson, 'utf8'));
  const checksumMap = Object.fromEntries(filters.map((f) => [f.filterId, f.checksum]));

  const reportPath = 'public/jsdelivr-cache-report.json';
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  const entries = report.results.map((r) => {
    const isFilter = r.url.includes('/filters/') && r.url.endsWith('.txt');
    const filterId = isFilter ? parseInt(r.url.match(/\/(\d+)\.txt$/)?.[1]) : null;
    return {
      ...r,
      isFilter,
      expectedChecksum: checksumMap[filterId] ?? null,
      warmOk: false,
      detail: null,
    };
  });

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const pending = entries.filter((e) => !e.warmOk);
    if (!pending.length) break;

    console.log(`\n🟡 Round ${round}/${MAX_ROUNDS} — warming ${pending.length} URLs`);
    await runWave(pending);

    const confirmed = entries.filter((e) => e.warmOk).length;
    const remaining = entries.length - confirmed;
    console.log(`\n🟢 Round ${round} done — ${confirmed}/${entries.length} confirmed 🔴 ${remaining} remaining`);

    if (!remaining) break;
    if (round < MAX_ROUNDS) {
      process.stdout.write(`⏳ Waiting ${ROUND_WAIT_MS / 1000}s`);
      for (let s = 0; s < ROUND_WAIT_MS / 1000; s++) {
        await sleep(1000);
        process.stdout.write('.');
      }
      process.stdout.write('\n');
    }
  }

  report.results = entries.map(({ isFilter, expectedChecksum, ...r }) => r);
  report.updatedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, '\t'), 'utf8');

  const warmOk = report.results.filter((r) => r.warmOk).length;
  const warmFailed = report.results.length - warmOk;

  const warmReport = {
    updatedAt: report.updatedAt,
    total: report.results.length,
    ok: warmOk,
    failed: warmFailed,
    results: report.results.map((r) => ({
      url: r.url,
      warmOk: r.warmOk,
      detail: r.detail,
    })),
  };
  fs.writeFileSync('public/jsdelivr-warm-report.json', JSON.stringify(warmReport, null, '\t'), 'utf8');

  console.log(`\n🟢 Warmed ${warmOk}/${report.results.length} — 🔴 ${warmFailed} unconfirmed`);
  if (warmFailed) {
    console.log('\n🔴 Unconfirmed URLs:');
    report.results.filter((r) => !r.warmOk).forEach((r) => console.log(`   🔴 ${r.url} — ${r.detail}`));
  }
}

main().catch((e) => { console.error(`🔴 ${e.message}`); process.exit(1); });
