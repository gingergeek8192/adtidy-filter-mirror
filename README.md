# AdTidy Filter Mirror

A synchronised, checksum-verified mirror of AdTidy's Chromium filter lists.

It provides [Adblock-Electron](https://github.com/gingergeek8192/Adblock-Electron) with multiple delivery sources and allows consumers to run the mirror under their own GitHub and GitLab accounts.

The mirror publishes the non-deprecated Chromium filter lists to GitHub and GitLab, with jsDelivr serving the GitHub copy through its CDN. The original AdTidy download URLs are retained making four total sources across three CDN networks `Fastly` | `Cloudflare` | `Qrator`.

Each synchronisation verifies downloaded filters, publishes valid changes, manages the jsDelivr cache and records the cache-warming results.

## What the mirror provides

- **Multiple delivery sources** — the original AdTidy CDN, GitHub raw content, jsDelivr and GitLab.
- **Checksum verification** — downloaded filters are checked against the MD5 checksum embedded in their `! Checksum:` header.
- **Last-known-good protection** — a filter that fails verification is rejected; its previously verified mirror copy is left intact.
- **Automated synchronisation** — all non-deprecated Chromium filters are checked on a six-hour schedule.
- **CDN cache management** — stale jsDelivr entries are purged after publishing.
- **Cache warming** — published jsDelivr URLs are requested after synchronisation, including `filters.json`.
- **Cache health reporting** — `jsdelivr-cache-report.json` records the results of the cache-warming operation.

These are alternative delivery paths for the same filter catalogue. Adblock-Electron can try the available sources rather than depending on one mirror endpoint.

## How synchronisation works

The GitHub Actions workflow runs every six hours. It can also be started manually using workflow dispatch.

Each run:

1. Fetches the non-deprecated Chromium filter lists from AdTidy.
2. Checks each downloaded filter against its embedded MD5 checksum.
3. Publishes verified filter files and updates `filters.json` with the available download URLs.
4. Updates `public/ping.json`, including the `updatedAt` and `nextUpdate` timestamps.
5. Commits changed files to GitHub.
6. Purges all jsDelivr cached entries.
7. Synchronises `filters.json`, the filter files and `ping.json` to GitLab.
8. Warms the jsDelivr cache over up to 6 rounds (60 s apart), re-purging any still-unconfirmed filters at round 3, verifying each response against the committed checksums.
9. Publishes `public/jsdelivr-cache-report.json` when the report changes.

A failed checksum does not replace a previously verified filter. A failed or unconfirmed cache-warming request is recorded in the report rather than being treated as a successful refresh.

On the consumer side, Adblock-Electron tolerates a lagging or unavailable `ping.json` by selecting the furthest `nextUpdate` value across all sources. If every source is unavailable it retries on a two-hour buffer until the next successful six-hour sync restores a valid `ping.json`.

The workflow uses Node.js 24.

## Repository layout

```text
public/
├── extension/
│   └── chromium/
│       ├── filters.json
│       └── filters/
│           ├── 1.txt
│           ├── 2.txt
│           ├── 3.txt
│           └── ...
├── ping.json
└── jsdelivr-cache-report.json
```

| File | Contents |
|---|---|
| `extension/chromium/filters.json` | Filter metadata, including the original and mirror download URLs. |
| `extension/chromium/filters/*.txt` | Individually mirrored filter lists. |
| `ping.json` | Synchronisation timestamps and the next scheduled update. |
| `jsdelivr-cache-report.json` | Results from the latest jsDelivr cache-warming operation. |

## Delivery endpoints

Each filter has four available download paths. The URLs below use this repository's owner, `gingergeek8192`. When self-hosting, replace that owner with the account that owns your copies.

| Source | `filters.json` | Individual filter |
|---|---|---|
| AdTidy | `https://filters.adtidy.org/extension/chromium/filters.json` | `https://filters.adtidy.org/extension/chromium/filters/N.txt` |
| GitHub | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters.json` | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters/N.txt` |
| jsDelivr | `https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json` | `https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters/N.txt` |
| GitLab | `https://gitlab.com/gingergeek8192/adtidy-filter-mirror/-/raw/main/public/extension/chromium/filters.json` | `https://gitlab.com/gingergeek8192/adtidy-filter-mirror/-/raw/main/public/extension/chromium/filters/N.txt` |

`N` represents the filter ID.

## Filter metadata

The mirror retains AdTidy's filter metadata and adds three URL fields to each filter entry.

| Field | Description |
|---|---|
| `downloadUrl` | Original AdTidy CDN URL. |
| `mirrorUrl` | GitHub raw-content URL. |
| `jsDelivrUrl` | jsDelivr CDN URL. |
| `gitlabUrl` | GitLab mirror URL. |

The original metadata is retained, including filter IDs, names, descriptions, versions, timestamps, language information, tags and subscription details. The original `downloadUrl` is not replaced.

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
  "gitlabUrl": "https://gitlab.com/gingergeek8192/adtidy-filter-mirror/-/raw/main/public/extension/chromium/filters/1.txt"
}
```

## Checksum verification

Every downloaded filter is checked against the MD5 checksum embedded in its `! Checksum:` header.

A filter is published only when its checksum matches the expected value. If verification fails:

- The downloaded file is rejected.
- The existing mirrored file is left untouched.
- The last verified version remains available.

Only non-deprecated filters are included in synchronisation.

## Synchronisation schedule

| Setting | Value |
|---|---|
| Schedule | Every 6 hours |
| Cron | `0 0,6,12,18 * * *` (UTC) |
| Runtime | Node.js 24 |
| Manual execution | GitHub Actions workflow dispatch |
| Filter source | AdTidy Chromium CDN |
| Checksum algorithm | MD5 |
| Published hosts | GitHub, jsDelivr and GitLab |

Adblock-Electron checks for filter updates on a 13-hour interval. Running the mirror workflow every six hours is intended to provide at least one successful mirror refresh between those checks. The `nextUpdate` value in `ping.json` is set 13 hours ahead.

## Self-hosting

You can run the mirror under your own GitHub and GitLab accounts. Adblock-Electron can then retrieve filter data from repositories you control, rather than relying on the maintainer's mirror.

The GitHub and GitLab repositories must use the same name:

```text
adtidy-filter-mirror
```

### Setup

1. Create a public GitHub repository named `adtidy-filter-mirror` under your GitHub account.
2. Create a public GitLab project also named `adtidy-filter-mirror` under the corresponding GitLab account.
3. Push the contents of this repository to your GitHub repository. If you use a GitHub fork, enable GitHub Actions; scheduled workflows are disabled in forks by default.
4. Create a GitLab project access token with the Developer role and `write_repository` scope.
5. Add that token to the GitHub repository's Actions secrets as `GITLAB_COMMIT`.
6. Run **Actions → Sync AdTidy Filters** to populate the mirror endpoints.

The workflow then publishes to your GitHub repository, synchronises the GitLab copy and warms the jsDelivr cache. Keep the repository name `adtidy-filter-mirror` on both hosts so the generated endpoint paths remain consistent.

## Attribution

This repository mirrors AdTidy filter data. Filter contents and filtering rules remain the property of their respective authors and maintainers.
