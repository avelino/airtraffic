# Air Traffic

Automatic URL routing for [Firefox](https://www.mozilla.org/firefox/) containers and [Chrome](https://www.google.com/chrome/) tab groups. Define URL patterns, assign them to a destination, and tabs land in the right place automatically.

A **destination** is a Firefox container on Firefox and a tab group on Chrome. Same rules, same UI, but not the same guarantee: containers separate cookies and logins, tab groups do not. Read [Chrome: no session isolation](#chrome-no-session-isolation-and-why) before installing on Chrome.

Works with any Firefox-based browser and any Chromium-based browser. On [Zen Browser](https://zen-browser.app/), it pairs perfectly with workspaces — pair a container with a workspace and get automatic workspace switching for free.

**The problem:** You juggle multiple contexts (work, personal, client projects) and constantly end up with tabs in the wrong one.

**The solution:** Air Traffic intercepts navigation, matches URLs against your rules, and puts the tab in the correct destination. Automatically.

```
github.com      -> Dev destination
slack.com       -> Work destination
buser.com.br    -> Buser destination
gmail.com       -> Personal destination
```

## How it works

### Firefox (containers)

1. You create rules mapping URL patterns to containers
2. When you navigate to a matching URL, Air Traffic **reopens the tab** in the correct container
3. Cookies, sessions, and logins stay isolated per container

```
URL matched -> Reopen in correct container
```

### Chrome (tab groups)

1. You create rules mapping URL patterns to destinations (each destination becomes a tab group)
2. When you navigate to a matching URL, Air Traffic **moves the live tab** into the matching tab group, creating it if needed
3. There is **no cookie or session isolation**. Chrome tab groups are visual grouping only

```
URL matched -> Tab moved into correct tab group
```

### Chrome: no session isolation (and why)

On Firefox a destination is a **container**, a real storage partition with its own cookies, logins and `localStorage`. Two containers can be signed into the same site as different users at the same time.

On Chrome a destination is a **tab group**, which is paint. Every group shares one cookie jar. Sign into GitHub in the Work group and the Personal group is signed into the same account. Air Traffic on Chrome decides where a tab lands. It does not decide who you are.

**Why not Chrome profiles?** Profiles do give real isolation, so this is the fair question. The answer is that no extension can reach them. Chrome ships no profile API: an extension is installed *into* one profile and cannot list, create, switch, or open a tab in another one. The only proposal for it, [Chromium's Profile Extension API](https://www.chromium.org/developers/design-documents/extensions/proposed-changes/apis-under-development/profile-extension-api/), dates from 2012, says in its own text that "This API is read-only. It cannot change or create new profiles", and never shipped. Switching profile is a browser UI action (`chrome://profile-picker`) or a launch flag (`--profile-directory`), and an extension can do neither.

There is also no per-tab cookie store to fall back on. `chrome.tabs.create` has no equivalent of Firefox's `cookieStoreId`, so even handling cookies yourself would not let you open a tab into a chosen partition. Incognito is the only other partition Chrome exposes and it is one shared bucket, not one per destination, so it cannot express work vs personal vs client.

**If you need real isolation on Chrome**, create Chrome profiles by hand and run Air Traffic inside each one. Rules and destinations live in extension storage, which is per profile, so every profile keeps its own set and organizes its own tabs.

### Chrome: what's different

- **Destinations are matched to tab groups by title.** Renaming a group in Chrome, or renaming a destination in Options, breaks the link — a new group is created on the next matching navigation.
- **One group per window.** Chrome tab groups cannot span windows, so a destination becomes a separate group in each window you use it in.
- **Nothing is lost when routing.** Firefox re-creates the tab (scroll position, form state and back/forward history are lost, and the URL is re-fetched); Chrome regroups the live tab in place.
- **Export/import carries rules and settings, not destinations.** An imported file on Chrome references destination ids that do not exist locally — recreate the destinations and re-point the rules.

### Zen Browser (bonus: workspace switching)

Zen Browser supports pairing containers with workspaces. When combined with Air Traffic:

1. You create rules mapping URL patterns to containers
2. Each container is paired with a Zen workspace (Zen's native feature)
3. Air Traffic reopens the tab in the correct container
4. Zen automatically switches to the paired workspace

```
URL matched -> Reopen in container -> Zen switches workspace
```

This makes Air Traffic a full workspace router on Zen, without needing any Zen-specific API.

## Pattern types

| Type | Example | Matches |
|------|---------|---------|
| **Domain** | `github.com` | `github.com`, `api.github.com`, `www.github.com` |
| **Domain contains** | `google` | `mail.google.com`, `docs.google.com`, `google.com.br` |
| **URL contains** | `buser` | Any URL containing "buser" |
| **Wildcard** | `*.github.com/avelino/*` | `*` matches any characters |
| **Regex** | `^https://(www\.)?github\.com` | Full regex for power users |

All matching is case-insensitive. Domain matching is strict (won't match `fakegithub.com`).

## Installation

### Firefox, from file

1. [Download the latest release](https://github.com/avelino/firefox-airtraffic/releases)
2. Go to `about:addons`
3. Click the gear icon > **Install Add-on From File...**
4. Select the Firefox `.zip` file

> If you get a signature error, set `xpinstall.signatures.required` to `false` in `about:config`.

### Chrome, from file

1. [Download the latest release](https://github.com/avelino/firefox-airtraffic/releases) and unzip the Chrome build
2. Go to `chrome://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

> Chrome drops unpacked extensions on restart unless they come from the Web Store. Reload it the same way after a restart.

### Build from source

```bash
git clone https://github.com/avelino/firefox-airtraffic.git
cd firefox-airtraffic
npm install
npm run package:firefox   # -> web-ext-artifacts/firefox/*.zip
npm run package:chrome    # -> web-ext-artifacts/chrome/air-traffic-chrome.zip
```

## Setup

### Create routing rules

Click the Air Traffic icon in the toolbar:

1. Select the match type (Domain is recommended for most cases)
2. Enter the pattern
3. Pick the target destination (a container on Firefox, a tab group on Chrome)
4. Click **Add Rule**

Rules can be edited or deleted at any time. On Chrome, create the destination first in Options, since a tab group only exists once a tab is in it.

### Zen Browser: enable workspace switching (optional)

To get automatic workspace switching on Zen, two extra steps:

**1. Pair containers with workspaces**

Right-click a workspace > **Edit** > assign a container (e.g., workspace "Work" -> container "Work").

**2. Enable auto-switching**

**Settings > Tab Management > Workspaces > "Switch to workspace where container is set as default when opening container tabs"**

Without this, tabs will open in the correct container but Zen won't auto-switch workspaces.

## Project structure

```
firefox-airtraffic/
├── manifests/
│   ├── firefox.json           # MV3 manifest (contextualIdentities)
│   └── chrome.json            # MV3 manifest (tabGroups)
├── src/
│   ├── core/                  # Pure logic: pattern matching, routing, storage + migration
│   ├── engines/
│   │   ├── firefox/           # Engine impl backed by contextualIdentities
│   │   └── chrome/            # Engine impl backed by tabGroups
│   ├── ui/                    # Shared background/popup/options, driven by an Engine
│   ├── entrypoints/
│   │   ├── firefox/           # Wires firefoxEngine into ui/*
│   │   └── chrome/            # Wires chromeEngine into ui/*
│   ├── popup/, options/       # Shared HTML/CSS for both targets
│   └── types/browser.d.ts     # Hand-rolled ambient WebExtension types
├── icons/
└── tests/                     # Flat node:test files
```

## Development

```bash
# Run tests
npm test

# Typecheck
npm run typecheck

# Lint (targets the built Firefox bundle)
npm run lint

# Build both targets
npm run build

# Rebuild on every change
npm run watch

# Build a single target
npm run build:firefox
npm run build:chrome

# Package each target into web-ext-artifacts/
npm run package:firefox
npm run package:chrome

# Run in a fresh Zen instance against the built Firefox bundle
npx web-ext run --source-dir dist/firefox --firefox=/Applications/Zen.app/Contents/MacOS/zen
```

## Compatibility

| Browser | Destination mechanism | Cookie/session isolation | Workspace switching |
|---------|------------------------|---------------------------|---------------------|
| Firefox | Container (`contextualIdentities`) | Yes | N/A |
| Zen Browser | Container | Yes | Yes (via container-workspace pairing) |
| Other Firefox forks | Container (if `contextualIdentities` is supported) | Yes | Depends on fork |
| Chrome / Chromium | Tab Group (`tabGroups`) | No, [visual grouping only](#chrome-no-session-isolation-and-why) | N/A |

## Technical details

- **Manifest V3** — both engines target MV3; Firefox uses an event page (`background.scripts`), Chrome uses a service worker
- **Multi-engine core** — routing logic lives in `src/core/` and is shared; `src/engines/{firefox,chrome}` each implement the same `Engine` interface (containers vs. tab groups)
- **Loop prevention** — `tabsInTransit` Set with 5s timeout prevents infinite reopening
- **Ignored URLs** — `about:`, `moz-extension:`, `chrome:` protocols are skipped
- **Container validation** — checks container exists before creating tabs
- **In-memory cache** — rules are cached and invalidated via `storage.onChanged`

## Permissions

| Permission | Firefox | Chrome | Why |
|------------|---------|--------|-----|
| `contextualIdentities` | Yes | — | Read/manage Firefox containers |
| `cookies` | Yes | — | Required by `contextualIdentities` |
| `tabGroups` | — | Yes | Read/manage Chrome tab groups |
| `tabs` | Yes | Yes | Intercept navigation, create/remove/group tabs |
| `contextMenus` | Yes | Yes | "Open in destination" link menu |
| `storage` | Yes | Yes | Persist routing rules and destinations |
| `<all_urls>` (host permission) | Yes | Yes | Match URLs across all sites |

## License

MIT
