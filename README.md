# AdTidy Filter Mirror

**Automated, checksum-verified mirrors of AdTidy filter lists, providing redundant filter delivery for [Adblock-Electron](https://github.com/gingergeek8192/adblock-electron).**

This repository maintains an independently hosted mirror of AdTidy's Chromium filter lists, automatically synchronised every 12 hours.

Its purpose is to provide additional, independently hosted download sources for Adblock-Electron, helping ensure filter lists remain accessible during first-run initialisation and subsequent updates, even when an individual delivery endpoint is unavailable or serving inconsistent content.

Rather than relying exclusively on the original AdTidy CDN, each filter is made available through **GitHub, jsDelivr and GitLab**, alongside its original AdTidy download URL.

Every synchronisation includes checksum verification, automated publishing, CDN cache invalidation and cache warming.

## What it provides

- **Multiple delivery sources** — four download paths for each filter, spanning the original AdTidy CDN and three independently hosted mirror endpoints.
- **Checksum verification** — every downloaded filter is validated against its embedded MD5 checksum before being accepted.
- **Automated synchronisation** — all non-deprecated Chromium filters are checked and synchronised every 12 hours.
- **Last-known-good protection** — files failing checksum verification are discarded, leaving the previously verified version intact.
- **CDN cache management** — stale jsDelivr cache entries are purged following synchronisation.
- **Proactive cache warming** — filter URLs are fetched to prime jsDelivr's cache ahead of subsequent requests.
- **Cache health reporting** — a generated report records the results of jsDelivr cache warming.

The result is a maintained distribution layer that gives Adblock-Electron additional options when retrieving filter data, rather than depending on a single source.

## How it works

The GitHub Actions workflow runs every 12 hours, with manual dispatch also supported.

Each run performs the following operations:

1. **Fetch filters** — retrieves all non-deprecated filter lists from the AdTidy CDN.
2. **Verify integrity** — checks each downloaded file against its embedded MD5 checksum.
3. **Publish mirror files** — writes verified `.txt` files and an updated `filters.json` containing the available download URLs.
4. **Update availability metadata** — generates `public/ping.json` with `updatedAt` and `nextUpdate` timestamps.
5. **Commit changes** — publishes updated files to GitHub when changes are detected.
6. **Purge CDN cache** — invalidates stale jsDelivr cache entries.
7. **Synchronise GitLab** — mirrors `filters.json`, filter files and `ping.json` to the GitLab repository.
8. **Warm CDN cache** — requests every jsDelivr filter URL, including `filters.json`, to pre-populate the CDN cache.
9. **Publish cache report** — commits `public/jsdelivr-cache-report.json` when the report changes.

The workflow uses Node.js 24 and is designed to keep the mirror synchronised without requiring manual maintenance.

## Repository layout

```text
public/
└── extension/
    └── chromium/
        ├── filters.json
        └── filters/
            ├── 1.txt
            ├── 2.txt
            ├── 3.txt
            └── ...
└── ping.json
└── jsdelivr-cache-report.json
```

- `filters.json` — filter metadata, including original and mirror download URLs.
- `filters/*.txt` — individually mirrored filter lists.
- `ping.json` — synchronisation timestamps and next scheduled update.
- `jsdelivr-cache-report.json` — results of the latest CDN cache-warming operation.

## Mirror endpoints

Each filter is exposed through four delivery URLs. The original AdTidy URL remains unchanged, while the additional endpoints provide alternative download paths.

### GitHub — raw content

Direct access to the repository's published files.

| Resource | URL |
|---|---|
| Filter metadata | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters.json` |
| Individual filters | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters/N.txt` |

### jsDelivr — CDN delivery

CDN-backed access to the GitHub mirror, with proactive cache warming following each synchronisation.

| Resource | URL |
|---|---|
| Filter metadata | `https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json` |
| Individual filters | `https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters/N.txt` |

### GitLab — independent mirror

A separately maintained copy of the published filter files, providing another hosting location.

| Resource | URL |
|---|---|
| Filter metadata | `https://gitlab.com/gingergeek8192/redundancy-layers/-/raw/main/public/extension/chromium/filters.json` |
| Individual filters | `https://gitlab.com/gingergeek8192/redundancy-layers/-/raw/main/public/extension/chromium/filters/N.txt` |

### AdTidy — original source

The original filter delivery endpoints are retained as the primary source.

| Resource | URL |
|---|---|
| Filter metadata | `https://filters.adtidy.org/extension/chromium/filters.json` |
| Individual filters | `https://filters.adtidy.org/extension/chromium/filters/N.txt` |

## Filter metadata

The mirrored `filters.json` retains the original AdTidy filter metadata and adds three mirror URL fields to each filter entry.

| Field | Description |
|---|---|
| `downloadUrl` | Original AdTidy CDN download URL. |
| `mirrorUrl` | GitHub raw content URL. |
| `jsDelivrUrl` | jsDelivr CDN URL. |
| `gitlabUrl` | GitLab mirror URL. |

Existing filter metadata is preserved, including filter IDs, names, descriptions, versions, timestamps, language information, tags and subscription details.

For example:

```json
{
    "filterId": 1,
    "name": "AdGuard Russian filter",
    "version": "2.1.9.50",
    "deprecated": false,
    "downloadUrl": "https://filters.adtidy.org/extension/chromium/filters/1.txt",
    "mirrorUrl": "https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters/1.txt",
    "jsDelivrUrl": "https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters/1.txt",
    "gitlabUrl": "https://gitlab.com/gingergeek8192/redundancy-layers/-/raw/main/public/extension/chromium/filters/1.txt"
}
```

The original `downloadUrl` is retained, so the mirror supplements the existing metadata rather than replacing AdTidy's source information.

## Checksum verification and file integrity

Every filter download is checked against the MD5 checksum embedded in its `! Checksum:` header.

A file is only accepted for publication when its checksum matches the expected value.

If verification fails:

- The downloaded file is rejected.
- The existing mirrored file is left untouched.
- The previous verified version remains available.

This prevents an unsuccessful download or inconsistent CDN response from silently replacing a previously verified filter.

Only non-deprecated filters are included in the synchronisation.

## jsDelivr cache management

Publishing updated files to GitHub does not, by itself, guarantee that a CDN will immediately serve the latest content.

To account for this, the workflow actively manages the jsDelivr cache.

Following each synchronisation:

1. Existing cached content is purged.
2. Updated mirror files are made available.
3. Every jsDelivr filter URL is requested to warm the CDN cache.
4. Responses are checked against expected checksums.
5. A cache report records the outcome.

Cache warming is performed across all published filter URLs, including `filters.json`.

The generated `jsdelivr-cache-report.json` provides visibility into which URLs were successfully confirmed and which remain unconfirmed. Failed or inconsistent responses are reported rather than being silently treated as successful cache warming.

## Synchronisation schedule

| Setting | Value |
|---|---|
| Schedule | Every 12 hours |
| Cron | `0 */12 * * *` |
| Runtime | Node.js 24 |
| Manual execution | GitHub Actions workflow dispatch |
| Filter source | AdTidy Chromium CDN |
| Checksum algorithm | MD5 |
| Hosting | GitHub, jsDelivr and GitLab |

## Relationship with Adblock-Electron

This repository is maintained as supporting infrastructure for **Adblock-Electron**, an upcoming npm package currently in active development and built on AdGuard's `tsurlfilters` library.

Filter availability is an important part of the first-run experience. A filter engine is only useful if it can obtain the filter data it needs.

By providing additional download endpoints, independently hosted copies and automated integrity checks, this mirror gives Adblock-Electron more options for obtaining its filter lists.

The original AdTidy CDN remains available as the primary source, with GitHub, jsDelivr and GitLab providing additional delivery paths.

**One filter catalogue. Multiple hosting locations. Automated synchronisation. Verified content.**

---

*This repository mirrors AdTidy filter data. Filter contents and filtering rules remain the property of their respective authors and maintainers.*