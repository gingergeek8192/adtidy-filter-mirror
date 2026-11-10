# adtidy-filter-mirror

A GitHub-hosted mirror of AdTidy filter lists, synced every 12 hours, providing an additional online first-run fallback for **Adblock-Electron** — an upcoming npm package currently in active development, built on AdGuard's tsurlfilters library.

## What it does

Every 12 hours a workflow fetches all non-deprecated filter lists from the AdTidy CDN, verifies each file against its embedded MD5 checksum, and commits the results to this repo. Stores adtidy filters.json with additional fallback paths.

1. Fetch all non-deprecated filters from AdTidy CDN and verify MD5 checksums
2. Write `.txt` filter files and `filters.json` with mirror URLs
3. Write `public/ping.json` with `updatedAt` and `nextUpdate` timestamps
4. Commit and push `public/` if anything changed
5. Purge stale jsDelivr CDN cache
6. Mirror `filters.json`, `.txt` files, and `ping.json` to GitLab
7. Pre-warm jsDelivr cache for all filter URLs
8. Commit `public/jsdelivr-cache-report.json` if updated

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
| Filter N mirrorUrl | `https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters/N.txt` |

### jsDelivr CDN
| Resource | URL |
|---|---|
| filters.json | `https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters.json` |
| Filter N jsDelivrUrl | `https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters/N.txt` |

### GitLab
| Resource | URL |
|---|---|
| filters.json | `https://gitlab.com/gingergeek8192/redundancy-layers/-/raw/main/public/extension/chromium/filters.json` |
| Filter N gitlabUrl | `https://gitlab.com/gingergeek8192/redundancy-layers/-/raw/main/public/extension/chromium/filters/N.txt` |

### adtidy CDN
| Resource | URL |
|---|---|
| filters.json | `https://filters.adtidy.org/extension/chromium/filters.json` |
| Filter N downloadUrl | `https://filters.adtidy.org/extension/chromium/filters/N.txt` |

## filters.json

Each filter entry includes four URL fields pointing to the same current filter file:

- `downloadUrl` — original AdTidy CDN URL (unchanged)
- `mirrorUrl` — raw.githubusercontent.com
- `jsDelivrUrl` — cdn.jsdelivr.net
- `gitlabUrl` — gitlab.com
- `gitlabUrl` — gitlab.com

```js
	"filters": [
		{
			"filterId": 1,
			"name": "AdGuard Russian filter",
			"description": "Filter that enables ad blocking on websites in Russian language.",
			"timeAdded": "2014-06-30T07:56:55+0000",
			"homepage": "https://adguard.com/kb/general/ad-filtering/adguard-filters/",
			"expires": 864000,
			"displayNumber": 1,
			"groupId": 7,
			"subscriptionUrl": "https://filters.adtidy.org/extension/chromium/filters/1.txt",
			"trustLevel": "full",
			"version": "2.1.9.50",
			"timeUpdated": "2026-11-06T09:09:03+0000",
			"deprecated": false,
			"languages": [
				"ru"
			],
			"tags": [
				1,
				8,
				10,
				11
			],
			"downloadUrl": "https://filters.adtidy.org/extension/chromium/filters/1.txt",
			"mirrorUrl": "https://raw.githubusercontent.com/gingergeek8192/adtidy-filter-mirror/main/public/extension/chromium/filters/1.txt",
			"jsDelivrUrl": "https://cdn.jsdelivr.net/gh/gingergeek8192/adtidy-filter-mirror@main/public/extension/chromium/filters/1.txt",
			"gitlabUrl": "https://gitlab.com/gingergeek8192/redundancy-layers/-/raw/main/public/extension/chromium/filters/1.txt"
		},
        {...},
        {...}
    ]
```

## Checksum verification

Each `.txt` filter file is verified before being stored using the MD5 `! Checksum:` header. Files that fail verification are discarded and the previous version is left intact.

- All non-deprecated filters
- Deprecated filters: excluded
- Updated: every 12 hours via GitHub Actions

## jsDelivr cache warming

After each sync and commit, the workflow hits every jsDelivr CDN URL (including `filters.json`) to pre-warm jsDelivr's cache before the next 12-hour cycle.

## Workflow steps

Runs on schedule (`0 */12 * * *`) and on manual dispatch:

1. Checkout repo
2. Setup Node.js 24
3. Download filters — `node scripts/sync.js` fetches all non-deprecated filters from AdTidy CDN, verifies MD5 checksums, writes `.txt` files and `filters.json`
4. Update ping — writes `public/ping.json` with `updatedAt` and `nextUpdate` timestamps
5. Commit changes — commits and pushes `public/` if anything changed
6. Purge jsDelivr — `node scripts/purge-cache.js` invalidates stale CDN cache
7. Mirror to GitLab — clones `redundancy-layers`, copies `filters.json`, all `.txt` files, and `ping.json`, then commits and pushes
8. Warm jsDelivr cache — `node scripts/warm-cache.js` pre-fetches all jsDelivr URLs to prime the cache
9. Commit cache report — commits `public/jsdelivr-cache-report.json` if updated
