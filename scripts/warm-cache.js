const fs = require('fs');
const crypto = require('crypto');
const cfg = require('./config');

const BATCH_SIZE = 3;
const BATCH_INTERVAL_MS = 6_000;
const ROUND_WAIT_MS = 120_000;
const MAX_ROUNDS = 5;
const REPURGE_AFTER_ROUND = 3;

const PURGE_BASE = 'https://purge.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main';

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

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i === retries - 1) throw e;
    }
  }
}

async function fetchAndCheck(entry) {
  const r = await fetchWithRetry(entry.url);

  if (!entry.isFilter) {
    if (entry.expectedPing) {
      const served = await r.json();
      const expected = entry.expectedPing;
      if (Date.parse(served.updatedAt) === Date.parse(expected.updatedAt) && Date.parse(served.nextUpdate) === Date.parse(expected.nextUpdate)) {
        entry.warmOk = true;
        entry.detail = 'non-filter';
        console.log(`🟢 [warm] ${entry.url} — ping match`);
      } else {
        entry.warmOk = false;
        entry.detail = 'ping:mismatch';
        console.log(`🔴 [warm] ${entry.url} — ping mismatch`);
      }
    } else {
      entry.warmOk = true;
      entry.detail = 'non-filter';
      console.log(`🟢 [warm] ${entry.url} — non-filter ok`);
    }
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

async function repurge(entries) {
  const pending = entries.filter((e) => !e.warmOk && e.isFilter);
  if (!pending.length) return;
  console.log(`\n🟡 Re-purging ${pending.length} straggler URLs...`);
  await Promise.all(
    pending.map(async (entry) => {
      const path = entry.url.replace('https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main', '');
      try {
        const r = await fetch(`${PURGE_BASE}${path}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        console.log(`🟢 [repurge] ${path}`);
      } catch (e) {
        console.log(`🔴 [repurge] ${path} — ${e.message}`);
      }
    })
  );
}

async function main() {
  const { filters } = JSON.parse(fs.readFileSync(cfg.outputFiltersJson, 'utf8'));
  const checksumMap = Object.fromEntries(filters.map((f) => [f.filterId, f.checksum]));
  const expectedPing = JSON.parse(fs.readFileSync('public/ping.json', 'utf8'));

  const reportPath = 'public/jsdelivr-cache-report.json';
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  const entries = report.results.map((r) => {
    const isFilter = !r.url.endsWith('.json') && r.url.endsWith('.txt');
    const filterId = isFilter ? parseInt(r.url.match(/\/(\d+)\.txt$/)?.[1]) : null;
    return {
      ...r,
      isFilter,
      expectedChecksum: checksumMap[filterId] ?? null,
      expectedPing: r.url.endsWith('ping.json') ? expectedPing : null,
      warmOk: false,
      detail: null,
    };
  });

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const pending = entries.filter((e) => !e.warmOk);
    if (!pending.length) break;

    if (round === REPURGE_AFTER_ROUND) await repurge(entries);
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

  report.results = entries.map(({ isFilter, expectedChecksum, expectedPing, ...r }) => r);
  report.updatedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, '\t'), 'utf8');

  const warmOk = report.results.filter((r) => r.warmOk).length;
  const warmFailed = report.results.length - warmOk;
  console.log(`\n🟢 Warmed ${warmOk}/${report.results.length} — 🔴 ${warmFailed} unconfirmed`);
  if (warmFailed) {
    console.log('\n🔴 Unconfirmed URLs:');
    report.results.filter((r) => !r.warmOk).forEach((r) => console.log(`   🔴 ${r.url} — ${r.detail}`));
  }
}

main().catch((e) => { console.error(`🔴 ${e.message}`); process.exit(1); });
