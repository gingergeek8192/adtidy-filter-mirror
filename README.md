# adtidy-filter-mirror

A GitHub-hosted mirror of AdTidy filter lists, synced every 12 hours.

## What it does

Every 12 hours a workflow fetches all non-deprecated filter lists from the AdTidy CDN, verifies each file against its embedded MD5 checksum, and commits the results to this repo.

## File layout

```
public/extension/chromium/filters.json       ← mirror metadata
public/extension/chromium/filters/1.txt
public/extension/chromium/filters/2.txt
...
```

## Mirror URLs

### raw.githubusercontent.com
| Resource | URL |
|---|---|
| filters.json | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters.json` |
| Filter N | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters/N.txt` |

### jsDelivr CDN
| Resource | URL |
|---|---|
| filters.json | `https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json` |
| Filter N | `https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters/N.txt` |

### GitHub UI (browse only)
| Resource | URL |
|---|---|
| filters.json | `https://github.com/gingergeek8192/adtidy-filter-mirror/blob/main/public/extension/chromium/filters.json` |
| Filter N | `https://github.com/gingergeek8192/adtidy-filter-mirror/blob/main/public/extension/chromium/filters/N.txt` |

## filters.json

Each filter entry includes three URL fields pointing to the same current filter file:

- `downloadUrl` — original AdTidy CDN URL
- `mirrorUrl` — raw.githubusercontent.com
- `jsDelivrUrl` — cdn.jsdelivr.net

## Checksum verification

Each `.txt` filter file is verified before being stored using the MD5 `! Checksum:` header line stripped. Files that fail verification are discarded and the previous version is left intact.

## Filters included

- All non-deprecated filters
- Deprecated filters: excluded
- Updated: every 12 hours via GitHub Actions

## jsDelivr cache warming

After each sync and commit, the workflow hits every jsDelivr CDN URL (including `filters.json`) to pre-warm jsDelivr's cache before the next 12-hour cycle. This means even if GitHub is temporarily unavailable, all filter files should be cached.
