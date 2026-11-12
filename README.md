# AdTidy Filter Mirror

A synchronised, checksum-verified mirror of AdTidy's Chromium filter lists.

It provides [Adblock-Electron](https://github.com/gingergeek8192/Adblock-Electron) with multiple delivery sources and allows consumers to run the mirror under their own GitHub and GitLab accounts. 

This repo is maintained and provides filters for production open source applications.

The mirror publishes the non-deprecated Chromium filter lists to GitHub and GitLab, with jsDelivr serving the GitHub copy through its CDN. The original AdTidy download URLs are retained making four total sources across three CDN networks `Fastly` | `Cloudflare` | `Qrator`.

Each synchronisation verifies downloaded filters, publishes valid changes, manages the jsDelivr cache and records the cache-warming results.

## Features

- **Multiple delivery sources** — AdTidy, GitHub, jsDelivr and GitLab.
- **Checksum verification** — downloaded filters are verified against their embedded MD5 checksums.
- **Last-known-good protection** — invalid downloads never replace previously verified filters.
- **Automated synchronisation** — runs every six hours.
- **CDN management** — jsDelivr cache purging, warming and cache health reporting.

## Self-hosting

You can run your own mirror using your GitHub and GitLab accounts.

Both repositories must have the same name:

`adtidy-filter-mirror`

### Setup

1. Create a public GitHub repository named `adtidy-filter-mirror`.
2. Create a public GitLab project with the same name under the corresponding account.
3. Push this repository's contents to your GitHub repository.
4. Create a GitLab project access token with the Developer role and `write_repository` scope.
5. Add the token to your GitHub repository's Actions secrets as `GITLAB_COMMIT`.
6. Run **Actions → Sync AdTidy Filters** to initialise synchronisation.

The workflow handles filter synchronisation, GitLab publishing and jsDelivr cache management automatically.

GitHub Actions scheduled workflows are disabled by default in forks. Enable Actions and run the workflow manually to initialise your mirror.

## Using with Adblock-Electron

Adblock-Electron supports independently hosted mirrors through the `withOwnMirror` option.

Supply your account name and the hosts you want to use:

```javascript

Adblock.setResources(
    withOwnMirror: {
        account: 'your-account',
        optIns: [
            'JSDELIVR',
            'GITLAB',
            'GITHUB'
        ]
    },
    ...
)

```

**Configuration:**

| Property | Description |
|---|---|
| `account` | Your GitHub and GitLab account name. Both accounts must use the same username. |
| `optIns` | The mirror hosts to enable: `JSDELIVR`, `GITLAB` and `GITHUB`. |

`ADTIDY` is automatically included by Adblock-Electron, so it does not need to be specified in `optIns`.

The repository name and directory structure are fixed. Adblock-Electron constructs the corresponding endpoints using the supplied account name and selected hosts.

No additional URL configuration is required.

## Attribution

This repository mirrors AdTidy filter data. Filter contents and filtering rules remain the property of their respective authors and maintainers.
