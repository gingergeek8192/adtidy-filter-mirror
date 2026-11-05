# adtidy-filter-mirror

A GitHub-hosted mirror of AdTidy filter lists for use as a first-run fallback when the AdTidy CDN is unavailable.

## What it does

Every 12 hours a workflow fetches all non-deprecated filter lists from the AdTidy CDN, verifies each file against its embedded MD5 checksum, and commits the results to this repo.

## File layout

```
public/extension/chromium/filters.json       ← mirror metadata (downloadUrl rewritten to this repo)
public/extension/chromium/filters/1.txt
public/extension/chromium/filters/2.txt
...
```

## Mirror URLs

| Resource | URL |
|---|---|
| filters.json | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters.json` |
| Filter N | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters/N.txt` |

## Usage

This mirror is consumed by [adblock-electron](https://github.com/gingergeek8192/adblock-electron) as a fallback for [adtidy](https://filters.adtidy.org/extension/chromium/filters.json). On first run, if the AdTidy CDN is unreachable, the electron-adblock package falls back to this mirror. The `filters.json` served here has all `downloadUrl` fields rewritten to point to this repo so the entire fetch chain resolves without hitting the AdTidy CDN.

## Checksum verification

Each `.txt` filter file is verified before being stored using the MD5 `! Checksum:` header line stripped. Files that fail verification are discarded and the previous version is left intact.

## Filters included

- All non-deprecated filters
- Deprecated filters: excluded
- Updated: every 12 hours via GitHub Actions
