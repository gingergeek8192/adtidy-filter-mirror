# AdTidy Filter Mirror

A synchronised, checksum-verified mirror of AdTidy's Chromium filter lists.

It provides [Adblock-Electron](https://github.com/gingergeek8192/Adblock-Electron) with multiple independent delivery sources, while allowing consumers to operate their own mirrors under their GitHub and GitLab accounts.

This repository is actively maintained and provides filter data for production open-source applications.

The mirror publishes the non-deprecated Chromium filter lists to GitHub and GitLab, with jsDelivr serving the GitHub copy through its CDN. The original AdTidy download URLs are retained, providing four delivery sources distributed across three CDN networks: Fastly, Cloudflare and Qrator.

Each synchronisation verifies downloaded filters, publishes valid changes, manages the jsDelivr cache and records cache-warming results.

## Features

- **Multiple delivery sources** — AdTidy, GitHub, jsDelivr and GitLab.
- **Checksum verification** — Downloaded filters are verified against their embedded MD5 checksums.
- **Last-known-good protection** — Invalid downloads never replace previously verified filters.
- **Automated synchronisation** — Scheduled approximately every 6 hours, providing multiple opportunities to synchronise filters against a 12-hour consumer update cycle.
- **CDN management** — jsDelivr cache purging, warming and cache health reporting.
- **External monitoring** — A local watchdog is recommended to monitor scheduled synchronisation and detect missed or unsuccessful runs.

## Self-hosting

You can operate your own mirror using your GitHub and GitLab accounts.

Both repositories must have the same name:

`adtidy-filter-mirror`

Both accounts must also use the same username.

### Setup

1. Create a public GitHub repository named `adtidy-filter-mirror`.
2. Create a public GitLab project with the same name under the corresponding account.
3. Push this repository's contents to your GitHub repository.
4. Create a GitLab project access token with the Developer role and `write_repository` scope.
5. Add the token to your GitHub repository's Actions secrets as `GITLAB_COMMIT`.
6. Enable GitHub Actions and run **Actions → Sync AdTidy Filters** to initialise synchronisation.

The workflow handles filter synchronisation, GitLab publishing and jsDelivr cache management automatically.

GitHub Actions scheduled workflows are disabled by default in forks. Enable Actions and run the workflow manually to initialise your mirror. Scheduled synchronisation will then operate according to the workflow configuration.

## Using with Adblock-Electron

Adblock-Electron supports independently hosted mirrors through the `withOwnMirror` option.

Supply your account name and the hosts you want to use:

```javascript
Adblock.setResources({
    withOwnMirror: {
        account: 'your-account',
        optIns: [
            'JSDELIVR',
            'GITLAB',
            'GITHUB'
        ]
    },
    ...
})
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