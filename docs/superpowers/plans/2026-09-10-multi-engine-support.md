# Air Traffic Multi-Engine Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chrome/Chromium support to Air Traffic (Tab Groups instead of containers) without duplicating routing logic, by extracting a browser-agnostic core and a single `Engine` interface implemented once per browser.

**Architecture:** `src/core/` holds pure logic (pattern matching, route resolution, storage + schema migration) with zero browser API calls. `src/engines/{firefox,chrome}/` each implement the `Engine` interface — the only real difference between browsers (how a "destination" exists and how a tab enters it). `src/ui/` (background/popup/options/rules-ui) is shared code that receives an `Engine` instance and never imports `browser.*` directly for destination logic. Thin `src/entrypoints/{firefox,chrome}/*.ts` files wire concrete engines into the shared runtime. Two manifests, two esbuild targets, two dist folders.

**Tech Stack:** TypeScript (strict), esbuild, node:test + tsx, Manifest V3 (both browsers), `webextension-polyfill` (Chrome only).

**Spec:** `docs/superpowers/specs/2026-09-10-multi-engine-support-design.md`

## Global Constraints

- All new/modified TS files live under `src/` (tsconfig `rootDir`/`include` already cover this — no tsconfig changes needed).
- Test files stay **flat** in `tests/` (no subdirectories) — the `npm test` glob (`tests/**/*.test.ts`) is run through `sh -c` by npm and does not reliably recurse into subdirectories on all shells.
- Rule field is `destinationId` (not `cookieStoreId`); Settings field is `defaultDestinationId` (not `defaultContainer`). Old data is migrated automatically and idempotently on load.
- `RouteResult.action` is `"route"` (not `"redirect"`) — generic verb for both engines.
- CSS class names (`container-badge`, `container-item`, `container-color-dot`, `container-item-name`, `container-item-icon`) are **not** renamed — only HTML element `id`s and TS identifiers move from "container" to "destination". Don't touch `.css` files in this plan.
- New engine code never imports `browser.*`/`chrome.*` at module top level (only inside function bodies) so it can be unit-tested by swapping `globalThis.browser` for a fake before calling.
- Every `Engine.applyRoute` returns `Promise<boolean>` (true = actually routed) so the shared badge/counter logic only fires on real routing, matching today's Firefox behavior exactly.
- Don't run `git commit` — global policy blocks it. Each task ends with a "stage the files" step instead; the user commits manually.

---

### Task 1: Core domain types and `Engine` interface

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/engine.ts`

**Interfaces:**
- Produces: `Rule`, `Settings`, `Destination`, `NewDestination`, `MatchType`, `MatchTypeConfig`, `RulesUIOptions` (from `core/types.ts`); `Engine`, `EngineTab` (from `core/engine.ts`) — every later task imports from these two files.

- [ ] **Step 1: Write `src/core/types.ts`**

```ts
export type MatchType = "domain" | "domainContains" | "contains" | "startsWith" | "wildcard" | "regex";

export interface Rule {
  id: string;
  pattern: string;
  matchType: MatchType;
  destinationId: string;
  negate?: boolean;
}

export interface Settings {
  mode: "route_matched" | "route_all";
  defaultDestinationId: string;
  useSync: boolean;
}

export interface Destination {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export type NewDestination = Omit<Destination, "id">;

export interface MatchTypeConfig {
  placeholder: string;
  hint: string;
  label: string;
}

export interface RulesUIOptions {
  rulesList: HTMLUListElement;
  patternInput: HTMLInputElement;
  matchTypeSelect: HTMLSelectElement;
  destinationSelect: HTMLSelectElement;
  submitBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  matchHint: HTMLElement;
  form: HTMLFormElement;
  negateCheckbox?: HTMLInputElement;
  colorMap: Record<string, string>;
  onRulesChanged?: () => void;
}
```

- [ ] **Step 2: Write `src/core/engine.ts`**

```ts
import type { Destination, NewDestination } from "./types";

export interface EngineTab {
  id: number;
  url?: string;
  windowId: number;
  index: number;
  active: boolean;
  cookieStoreId?: string; // Firefox only
  groupId?: number; // Chrome only
}

export interface Engine {
  readonly id: "firefox" | "chrome";
  listDestinations(): Promise<Destination[]>;
  createDestination(input: NewDestination): Promise<Destination>;
  updateDestination(id: string, patch: Partial<NewDestination>): Promise<void>;
  deleteDestination(id: string): Promise<void>;
  shouldSkip(tabId: number): boolean;
  currentDestinationId(tab: EngineTab): Promise<string>;
  applyRoute(tab: EngineTab, destinationId: string): Promise<boolean>;
  openInDestination(url: string, destinationId: string, refTab: EngineTab): Promise<void>;
  onDestinationsChanged(cb: () => void): void;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (these two files only declare types/interfaces, nothing references them yet)

- [ ] **Step 4: Stage the files**

```bash
git add src/core/types.ts src/core/engine.ts
```

---

### Task 2: Extend ambient browser types for MV3 (action, contextMenus, tabGroups)

**Files:**
- Modify: `src/types/browser.d.ts`

**Interfaces:**
- Produces: `browser.tabGroups.*`, `browser.tabs.group()`, `browser.contextMenus.*`, `browser.action.*`, `Tab.groupId`, ambient module `"webextension-polyfill"` — used by Task 8 (Chrome engine), Task 9 (Firefox engine, via `Tab`), Task 12 (shared background).
- Keeps `browser.menus` and `browser.browserAction` untouched so the old `src/background.ts`/`src/options/options.ts` keep compiling until Task 18 deletes them.

- [ ] **Step 1: Overwrite `src/types/browser.d.ts` with the full extended content**

```ts
// Minimal cross-browser WebExtension API type declarations
// (MV3: Firefox native `browser`, Chrome via webextension-polyfill)

interface StorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface ContextualIdentity {
  cookieStoreId: string;
  name: string;
  color: string;
  icon: string;
}

interface Tab {
  id?: number;
  url?: string;
  cookieStoreId?: string;
  groupId?: number;
  active?: boolean;
  index: number;
  windowId?: number;
}

interface TabChangeInfo {
  url?: string;
  status?: string;
}

interface MenuClickInfo {
  menuItemId: string;
  linkUrl?: string;
}

interface TabGroup {
  id: number;
  title: string;
  color: string;
  windowId: number;
}

interface BrowserEvent<T extends (...args: never[]) => void> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
}

declare namespace browser {
  namespace storage {
    const local: StorageArea;
    const sync: StorageArea;
    const onChanged: BrowserEvent<(changes: Record<string, StorageChange>, area: string) => void>;
  }

  namespace contextualIdentities {
    function query(filter: Record<string, unknown>): Promise<ContextualIdentity[]>;
    function get(cookieStoreId: string): Promise<ContextualIdentity>;
    function create(details: { name: string; color: string; icon: string }): Promise<ContextualIdentity>;
    function update(cookieStoreId: string, details: { name?: string; color?: string; icon?: string }): Promise<ContextualIdentity>;
    function remove(cookieStoreId: string): Promise<ContextualIdentity>;
    const onCreated: BrowserEvent<() => void>;
    const onRemoved: BrowserEvent<() => void>;
    const onUpdated: BrowserEvent<() => void>;
  }

  namespace tabGroups {
    const TAB_GROUP_ID_NONE: number;
    function query(filter: { windowId?: number; title?: string }): Promise<TabGroup[]>;
    function get(groupId: number): Promise<TabGroup>;
    function update(groupId: number, details: { title?: string; color?: string }): Promise<TabGroup>;
  }

  namespace tabs {
    function create(props: {
      url?: string;
      cookieStoreId?: string;
      active?: boolean;
      index?: number;
      windowId?: number;
    }): Promise<Tab>;
    function remove(tabId: number): void;
    function group(props: { tabIds: number[]; groupId?: number }): Promise<number>;
    const onUpdated: BrowserEvent<(tabId: number, changeInfo: TabChangeInfo, tab: Tab) => void>;
  }

  namespace menus {
    function create(props: { id: string; title: string; contexts: string[] }): void;
    function removeAll(): Promise<void>;
    const onClicked: BrowserEvent<(info: MenuClickInfo, tab?: Tab) => void>;
  }

  namespace contextMenus {
    function create(props: { id: string; title: string; contexts: string[] }): void;
    function removeAll(): Promise<void>;
    const onClicked: BrowserEvent<(info: MenuClickInfo, tab?: Tab) => void>;
  }

  namespace browserAction {
    function setBadgeText(details: { text: string }): void;
    function setBadgeBackgroundColor(details: { color: string }): void;
  }

  namespace action {
    function setBadgeText(details: { text: string }): void;
    function setBadgeBackgroundColor(details: { color: string }): void;
  }

  namespace runtime {
    function openOptionsPage(): Promise<void>;
  }
}

declare module "webextension-polyfill" {
  const browserPolyfill: typeof browser;
  export default browserPolyfill;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (old `src/background.ts` etc. still compile — `menus`/`browserAction` untouched; nothing new references the added namespaces yet)

- [ ] **Step 3: Stage the file**

```bash
git add src/types/browser.d.ts
```

---

### Task 3: Core `pattern-matcher` (move, no logic change)

**Files:**
- Create: `src/core/pattern-matcher.ts`
- Test: `tests/pattern-matcher.test.ts` (rewrite in place)

**Interfaces:**
- Consumes: `Rule` from `../core/types` (Task 1).
- Produces: `urlMatchesPattern(url, rule)`, `findMatchingRule(url, rules)` — used by Task 4 (route-resolver).

- [ ] **Step 1: Write `src/core/pattern-matcher.ts`**

```ts
import type { Rule } from "./types";

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function urlMatchesPattern(url: string, rule: Rule): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerPattern = rule.pattern.toLowerCase();

  let matched: boolean;
  switch (rule.matchType) {
    case "domain": {
      const hostname = extractHostname(url);
      matched = hostname !== null && (hostname === lowerPattern || hostname.endsWith("." + lowerPattern));
      break;
    }
    case "domainContains": {
      const hostname = extractHostname(url);
      matched = hostname !== null && hostname.includes(lowerPattern);
      break;
    }
    case "contains":
      matched = lowerUrl.includes(lowerPattern);
      break;
    case "startsWith":
      matched = lowerUrl.startsWith(lowerPattern);
      break;
    case "wildcard": {
      const escaped = lowerPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      try {
        matched = new RegExp(escaped, "i").test(url);
      } catch {
        matched = false;
      }
      break;
    }
    case "regex":
      try {
        matched = new RegExp(rule.pattern, "i").test(url);
      } catch {
        matched = false;
      }
      break;
    default:
      matched = false;
  }

  return rule.negate ? !matched : matched;
}

export function findMatchingRule(url: string, rules: Rule[] | null | undefined): Rule | null {
  if (!rules) return null;
  for (const rule of rules) {
    if (urlMatchesPattern(url, rule)) return rule;
  }
  return null;
}
```

- [ ] **Step 2: Rewrite `tests/pattern-matcher.test.ts`** (mechanical: import path + `cookieStoreId` → `destinationId`)

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findMatchingRule, urlMatchesPattern } from "../src/core/pattern-matcher";

describe("urlMatchesPattern", () => {
  it("matches contains pattern (case insensitive)", () => {
    const rule = { id: "1", pattern: "buser", matchType: "contains" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://app.buser.com.br/tickets", rule), true);
    assert.equal(urlMatchesPattern("https://BUSER.com.br", rule), true);
    assert.equal(urlMatchesPattern("https://example.com", rule), false);
  });

  it("matches startsWith pattern", () => {
    const rule = { id: "1", pattern: "https://github.com", matchType: "startsWith" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://gitlab.com/github.com", rule), false);
  });

  it("matches startsWith pattern (case insensitive)", () => {
    const rule = { id: "1", pattern: "https://GitHub.com", matchType: "startsWith" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://github.com/repo", rule), true);
  });

  it("matches regex pattern", () => {
    const rule = { id: "1", pattern: "^https://(www\\.)?github\\.com", matchType: "regex" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://www.github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://gitlab.com", rule), false);
  });

  it("returns false for invalid regex (does not throw)", () => {
    const rule = { id: "1", pattern: "[invalid(", matchType: "regex" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://example.com", rule), false);
  });

  it("matches domain exactly and subdomains", () => {
    const rule = { id: "1", pattern: "github.com", matchType: "domain" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://www.github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://api.github.com/repos", rule), true);
    assert.equal(urlMatchesPattern("https://notgithub.com", rule), false);
    assert.equal(urlMatchesPattern("https://github.company.com", rule), false);
    assert.equal(urlMatchesPattern("https://fakegithub.com.br", rule), false);
  });

  it("matches domain case insensitive", () => {
    const rule = { id: "1", pattern: "GitHub.com", matchType: "domain" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://github.com/repo", rule), true);
  });

  it("matches domain with invalid URL gracefully", () => {
    const rule = { id: "1", pattern: "github.com", matchType: "domain" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("not-a-url", rule), false);
    assert.equal(urlMatchesPattern("", rule), false);
  });

  it("matches domainContains for partial domain match", () => {
    const rule = { id: "1", pattern: "google", matchType: "domainContains" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://mail.google.com", rule), true);
    assert.equal(urlMatchesPattern("https://docs.google.com.br", rule), true);
    assert.equal(urlMatchesPattern("https://google.com", rule), true);
    assert.equal(urlMatchesPattern("https://example.com/search?q=google", rule), false);
  });

  it("matches domainContains case insensitive", () => {
    const rule = { id: "1", pattern: "Google", matchType: "domainContains" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://docs.google.com", rule), true);
  });

  it("matches domainContains with invalid URL gracefully", () => {
    const rule = { id: "1", pattern: "google", matchType: "domainContains" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("not-a-url", rule), false);
  });

  it("returns false for unknown matchType", () => {
    const rule = { id: "1", pattern: "test", matchType: "unknown" as const, destinationId: "dest-1" };
    // @ts-expect-error testing invalid matchType
    assert.equal(urlMatchesPattern("https://test.com", rule), false);
  });

  it("matches wildcard pattern with * as glob", () => {
    const rule = { id: "1", pattern: "*.github.com", matchType: "wildcard" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://api.github.com/repos", rule), true);
    assert.equal(urlMatchesPattern("https://www.github.com", rule), true);
    assert.equal(urlMatchesPattern("https://github.com", rule), false);
  });

  it("matches wildcard with ** prefix for any URL", () => {
    const rule = { id: "1", pattern: "*github.com*", matchType: "wildcard" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://api.github.com", rule), true);
    assert.equal(urlMatchesPattern("https://fakegithub.com", rule), true);
  });

  it("matches wildcard pattern with path glob", () => {
    const rule = { id: "1", pattern: "github.com/avelino/*", matchType: "wildcard" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino/firefox-airtraffic", rule), true);
    assert.equal(urlMatchesPattern("https://github.com/avelino/", rule), true);
    assert.equal(urlMatchesPattern("https://github.com/other/repo", rule), false);
  });

  it("matches wildcard case insensitive", () => {
    const rule = { id: "1", pattern: "*.GitHub.COM/*", matchType: "wildcard" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://api.github.com/repos", rule), true);
  });

  it("wildcard with no * acts as contains", () => {
    const rule = { id: "1", pattern: "github.com", matchType: "wildcard" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://example.com", rule), false);
  });

  it("wildcard escapes regex special chars", () => {
    const rule = { id: "1", pattern: "github.com/avelino/*", matchType: "wildcard" as const, destinationId: "dest-1" };
    assert.equal(urlMatchesPattern("https://githubXcom/avelino/test", rule), false);
  });

  describe("negated rules", () => {
    it("negated domain: false for matching URL, true for non-matching", () => {
      const rule = { id: "1", pattern: "work.company.com", matchType: "domain" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://work.company.com/dashboard", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negated contains: false for URL with pattern, true without", () => {
      const rule = { id: "1", pattern: "work", matchType: "contains" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://work.company.com", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negated regex: inverts match result", () => {
      const rule = { id: "1", pattern: "^https://(www\\.)?work\\.com", matchType: "regex" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://work.com/app", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negated wildcard: inverts match result", () => {
      const rule = { id: "1", pattern: "*.work.com", matchType: "wildcard" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://app.work.com/page", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negated domainContains: inverts match result", () => {
      const rule = { id: "1", pattern: "work", matchType: "domainContains" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://work.company.com", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negate: false behaves like no negate", () => {
      const rule = { id: "1", pattern: "github.com", matchType: "domain" as const, destinationId: "c1", negate: false };
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
      assert.equal(urlMatchesPattern("https://example.com", rule), false);
    });

    it("rule without negate field behaves normally (backward compat)", () => {
      const rule = { id: "1", pattern: "github.com", matchType: "domain" as const, destinationId: "c1" };
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
      assert.equal(urlMatchesPattern("https://example.com", rule), false);
    });

    it("negated domain with invalid URL returns true (no hostname = no match = negated to true)", () => {
      const rule = { id: "1", pattern: "work.com", matchType: "domain" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("not-a-url", rule), true);
    });
  });
});

describe("findMatchingRule", () => {
  const rules = [
    { id: "1", pattern: "github.com", matchType: "contains" as const, destinationId: "dest-1" },
    { id: "2", pattern: "buser", matchType: "contains" as const, destinationId: "dest-2" },
    { id: "3", pattern: "^https://slack\\.com", matchType: "regex" as const, destinationId: "dest-3" },
  ];

  it("returns the first matching rule", () => {
    const result = findMatchingRule("https://github.com/avelino", rules);
    assert.deepEqual(result, rules[0]);
  });

  it("returns null when no rule matches", () => {
    const result = findMatchingRule("https://example.com", rules);
    assert.equal(result, null);
  });

  it("returns null for empty rules array", () => {
    assert.equal(findMatchingRule("https://github.com", []), null);
  });

  it("returns null for undefined/null rules", () => {
    assert.equal(findMatchingRule("https://github.com", undefined), null);
    assert.equal(findMatchingRule("https://github.com", null), null);
  });

  it("first matching rule wins (order matters)", () => {
    const overlapping = [
      { id: "a", pattern: "github", matchType: "contains" as const, destinationId: "dest-1" },
      { id: "b", pattern: "github.com", matchType: "contains" as const, destinationId: "dest-2" },
    ];
    const result = findMatchingRule("https://github.com", overlapping);
    assert.equal(result?.id, "a");
  });

  it("negated rule matches URLs that do NOT match the pattern", () => {
    const rules = [
      { id: "1", pattern: "work.company.com", matchType: "domain" as const, destinationId: "personal", negate: true },
    ];
    assert.equal(findMatchingRule("https://github.com", rules)?.id, "1");
    assert.equal(findMatchingRule("https://work.company.com", rules), null);
  });

  it("positive rule before negated rule: positive wins for matching URL", () => {
    const rules = [
      { id: "pos", pattern: "github.com", matchType: "domain" as const, destinationId: "dev" },
      { id: "neg", pattern: "work.company.com", matchType: "domain" as const, destinationId: "personal", negate: true },
    ];
    assert.equal(findMatchingRule("https://github.com", rules)?.id, "pos");
    assert.equal(findMatchingRule("https://random.com", rules)?.id, "neg");
    assert.equal(findMatchingRule("https://work.company.com", rules), null);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test`
Expected: all `pattern-matcher.test.ts` cases PASS (old `tests/route-resolver.test.ts` will currently FAIL to import — that's expected, fixed in Task 4)

- [ ] **Step 4: Stage the files**

```bash
git add src/core/pattern-matcher.ts tests/pattern-matcher.test.ts
```

---

### Task 4: Core `route-resolver` (rename `cookieStoreId`→`destinationId`, `"redirect"`→`"route"`)

**Files:**
- Create: `src/core/route-resolver.ts`
- Test: `tests/route-resolver.test.ts` (rewrite in place)

**Interfaces:**
- Consumes: `Rule`, `Settings` (Task 1), `findMatchingRule` (Task 3).
- Produces: `isIgnoredUrl(url)`, `resolveRoute(url, rules, settings, currentDestinationId): RouteResult` where `RouteResult = {action:"route", destinationId:string} | {action:"none"}` — used by Task 12 (`ui/background.ts`).

- [ ] **Step 1: Write `src/core/route-resolver.ts`**

```ts
import type { Rule, Settings } from "./types";
import { findMatchingRule } from "./pattern-matcher";

const IGNORED_PROTOCOLS = ["about:", "moz-extension:", "chrome-extension:", "chrome:", "resource:", "data:", "blob:"];

export type RouteResult =
  | { action: "route"; destinationId: string }
  | { action: "none" };

export function isIgnoredUrl(url: string): boolean {
  return !url || IGNORED_PROTOCOLS.some((p) => url.startsWith(p));
}

export function resolveRoute(
  url: string,
  rules: Rule[],
  settings: Settings,
  currentDestinationId: string,
): RouteResult {
  if (isIgnoredUrl(url)) return { action: "none" };

  if (settings.mode === "route_all") {
    if (!settings.defaultDestinationId) return { action: "none" };
    const rule = findMatchingRule(url, rules);
    if (rule) {
      if (rule.negate) {
        if (currentDestinationId === rule.destinationId) return { action: "none" };
        return { action: "route", destinationId: rule.destinationId };
      }
      return { action: "none" };
    }
    if (currentDestinationId === settings.defaultDestinationId) return { action: "none" };
    return { action: "route", destinationId: settings.defaultDestinationId };
  }

  const rule = findMatchingRule(url, rules);
  if (!rule) return { action: "none" };
  if (currentDestinationId === rule.destinationId) return { action: "none" };
  return { action: "route", destinationId: rule.destinationId };
}
```

- [ ] **Step 2: Rewrite `tests/route-resolver.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isIgnoredUrl, resolveRoute } from "../src/core/route-resolver";
import type { Rule, Settings } from "../src/core/types";

describe("isIgnoredUrl", () => {
  it("ignores about: URLs", () => {
    assert.equal(isIgnoredUrl("about:blank"), true);
    assert.equal(isIgnoredUrl("about:config"), true);
  });

  it("ignores moz-extension: URLs", () => {
    assert.equal(isIgnoredUrl("moz-extension://abc/popup.html"), true);
  });

  it("ignores chrome-extension: URLs", () => {
    assert.equal(isIgnoredUrl("chrome-extension://abc/popup.html"), true);
  });

  it("ignores chrome: and resource: URLs", () => {
    assert.equal(isIgnoredUrl("chrome://settings"), true);
    assert.equal(isIgnoredUrl("resource://foo"), true);
  });

  it("ignores data: and blob: URLs", () => {
    assert.equal(isIgnoredUrl("data:text/html,hello"), true);
    assert.equal(isIgnoredUrl("blob:http://example.com/abc"), true);
  });

  it("ignores empty string", () => {
    assert.equal(isIgnoredUrl(""), true);
  });

  it("allows http/https URLs", () => {
    assert.equal(isIgnoredUrl("https://github.com"), false);
    assert.equal(isIgnoredUrl("http://example.com"), false);
  });
});

describe("resolveRoute", () => {
  const rules: Rule[] = [
    { id: "1", pattern: "github.com", matchType: "domain", destinationId: "dest-dev" },
    { id: "2", pattern: "slack.com", matchType: "domain", destinationId: "dest-work" },
  ];

  describe("route_matched mode", () => {
    const settings: Settings = { mode: "route_matched", defaultDestinationId: "", useSync: false };

    it("returns route when URL matches a rule and tab is in the wrong destination", () => {
      const result = resolveRoute("https://github.com/repo", rules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-dev" });
    });

    it("returns none when URL matches but tab is already in the correct destination", () => {
      const result = resolveRoute("https://github.com/repo", rules, settings, "dest-dev");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none when no rule matches", () => {
      const result = resolveRoute("https://example.com", rules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none for ignored URLs", () => {
      const result = resolveRoute("about:blank", rules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });
  });

  describe("route_all mode", () => {
    const settings: Settings = { mode: "route_all", defaultDestinationId: "dest-personal", useSync: false };

    it("routes unmatched URLs to the default destination", () => {
      const result = resolveRoute("https://example.com", rules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-personal" });
    });

    it("returns none when URL matches a rule (excluded from default)", () => {
      const result = resolveRoute("https://github.com/repo", rules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none when tab is already in the default destination", () => {
      const result = resolveRoute("https://random.com", rules, settings, "dest-personal");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none when no default destination is set", () => {
      const noDefault: Settings = { mode: "route_all", defaultDestinationId: "", useSync: false };
      const result = resolveRoute("https://example.com", rules, noDefault, "default");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none for ignored URLs", () => {
      const result = resolveRoute("moz-extension://abc", rules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });
  });

  describe("negated rules integration", () => {
    const negatedRules: Rule[] = [
      { id: "1", pattern: "work.company.com", matchType: "domain", destinationId: "dest-personal", negate: true },
    ];
    const settings: Settings = { mode: "route_matched", defaultDestinationId: "", useSync: false };

    it("routes non-matching URLs (negate inverts the match)", () => {
      const result = resolveRoute("https://github.com", negatedRules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-personal" });
    });

    it("does not route the excluded domain", () => {
      const result = resolveRoute("https://work.company.com/dashboard", negatedRules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });

    it("does not route when already in the correct destination", () => {
      const result = resolveRoute("https://random.com", negatedRules, settings, "dest-personal");
      assert.deepEqual(result, { action: "none" });
    });
  });

  describe("negated rules in route_all mode", () => {
    const negatedRules: Rule[] = [
      { id: "1", pattern: "work.company.com", matchType: "domain", destinationId: "dest-personal", negate: true },
    ];
    const settings: Settings = { mode: "route_all", defaultDestinationId: "dest-default", useSync: false };

    it("routes non-excluded URLs to the negated rule's destination", () => {
      const result = resolveRoute("https://github.com", negatedRules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-personal" });
    });

    it("routes the excluded domain to the default destination", () => {
      const result = resolveRoute("https://work.company.com/dashboard", negatedRules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-default" });
    });

    it("returns none when the excluded domain is already in the default destination", () => {
      const result = resolveRoute("https://work.company.com", negatedRules, settings, "dest-default");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none when the non-excluded URL is already in the rule's destination", () => {
      const result = resolveRoute("https://github.com", negatedRules, settings, "dest-personal");
      assert.deepEqual(result, { action: "none" });
    });
  });

  describe("rule priority (first match wins)", () => {
    it("positive rule before negated catch-all", () => {
      const mixed: Rule[] = [
        { id: "pos", pattern: "github.com", matchType: "domain", destinationId: "dest-dev" },
        { id: "neg", pattern: "work.com", matchType: "domain", destinationId: "dest-personal", negate: true },
      ];
      const settings: Settings = { mode: "route_matched", defaultDestinationId: "", useSync: false };

      const r1 = resolveRoute("https://github.com", mixed, settings, "default");
      assert.deepEqual(r1, { action: "route", destinationId: "dest-dev" });

      const r2 = resolveRoute("https://work.com", mixed, settings, "default");
      assert.deepEqual(r2, { action: "none" });

      const r3 = resolveRoute("https://random.com", mixed, settings, "default");
      assert.deepEqual(r3, { action: "route", destinationId: "dest-personal" });
    });
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: `pattern-matcher.test.ts` and `route-resolver.test.ts` PASS (`constants.test.ts` still fails to compile against the old shape until Task 5 — expected)

- [ ] **Step 4: Stage the files**

```bash
git add src/core/route-resolver.ts tests/route-resolver.test.ts
```

---

### Task 5: Core `constants` (MATCH_TYPE_CONFIG only)

**Files:**
- Create: `src/core/constants.ts`
- Test: `tests/constants.test.ts` (rewrite in place — drop the `CONTAINER_COLORS`/`CONTAINER_ICONS` assertions, moved to Task 8)

**Interfaces:**
- Consumes: `MatchTypeConfig` (Task 1).
- Produces: `MATCH_TYPE_CONFIG` — used by Task 13 (`ui/rules-ui.ts`).

- [ ] **Step 1: Write `src/core/constants.ts`**

```ts
import type { MatchTypeConfig } from "./types";

export const MATCH_TYPE_CONFIG: Record<string, MatchTypeConfig> = {
  domain:         { placeholder: "github.com",              hint: "Matches github.com and all subdomains",    label: "Domain" },
  domainContains: { placeholder: "google",                  hint: "Matches any domain containing \"google\"", label: "Domain contains" },
  contains:       { placeholder: "buser",                   hint: "Matches any URL containing this text",     label: "URL contains" },
  wildcard:       { placeholder: "*.github.com/avelino/*",  hint: "Use * as wildcard for any characters",     label: "Wildcard" },
  regex:          { placeholder: "^https://(www\\.)?g.*",   hint: "Regular expression (advanced)",            label: "Regex" },
};
```

- [ ] **Step 2: Rewrite `tests/constants.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MATCH_TYPE_CONFIG } from "../src/core/constants";

describe("MATCH_TYPE_CONFIG", () => {
  const expectedTypes = ["domain", "domainContains", "contains", "wildcard", "regex"];

  it("has config for all match types", () => {
    for (const type of expectedTypes) {
      assert.ok(MATCH_TYPE_CONFIG[type], `missing config for match type: ${type}`);
    }
  });

  it("each config has required fields", () => {
    for (const [type, config] of Object.entries(MATCH_TYPE_CONFIG)) {
      assert.ok(config.placeholder, `${type} missing placeholder`);
      assert.ok(config.hint, `${type} missing hint`);
      assert.ok(config.label, `${type} missing label`);
    }
  });

  it("has no extra match types without corresponding config", () => {
    const configKeys = Object.keys(MATCH_TYPE_CONFIG);
    assert.deepEqual(configKeys.sort(), expectedTypes.sort());
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: `constants.test.ts`, `pattern-matcher.test.ts`, `route-resolver.test.ts` PASS

- [ ] **Step 4: Stage the files**

```bash
git add src/core/constants.ts tests/constants.test.ts
```

---

### Task 6: Core storage + schema migration (TDD)

**Files:**
- Create: `src/core/storage.ts`
- Test: `tests/storage-migration.test.ts`

**Interfaces:**
- Consumes: `Rule`, `Settings`, `Destination` (Task 1).
- Produces: `migrateRuleSchema(raw)`, `migrateSettingsSchema(raw)` (pure, tested here), `loadSettingsFromStorage()`, `saveSettingsToStorage()`, `loadRulesFromStorage()`, `saveRulesToStorage()`, `migrateRulesStorage()`, `getSettings()`, `loadDestinationsFromStorage()`, `saveDestinationsToStorage()` — used by Task 8/9 (engines) and Task 12/14 (ui).

- [ ] **Step 1: Write the failing test — `tests/storage-migration.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { migrateRuleSchema, migrateSettingsSchema } from "../src/core/storage";

describe("migrateRuleSchema", () => {
  it("renames cookieStoreId to destinationId", () => {
    const migrated = migrateRuleSchema({ id: "1", pattern: "github.com", matchType: "domain", cookieStoreId: "container-dev" });
    assert.equal(migrated.destinationId, "container-dev");
    assert.equal((migrated as Record<string, unknown>).cookieStoreId, undefined);
  });

  it("is a no-op when destinationId is already present", () => {
    const migrated = migrateRuleSchema({ id: "1", pattern: "github.com", matchType: "domain", destinationId: "dest-1" });
    assert.equal(migrated.destinationId, "dest-1");
  });

  it("preserves other fields (negate, pattern, matchType)", () => {
    const migrated = migrateRuleSchema({ id: "1", pattern: "work.com", matchType: "domain", cookieStoreId: "c1", negate: true });
    assert.deepEqual(migrated, { id: "1", pattern: "work.com", matchType: "domain", negate: true, destinationId: "c1" });
  });
});

describe("migrateSettingsSchema", () => {
  it("renames defaultContainer to defaultDestinationId", () => {
    const migrated = migrateSettingsSchema({ mode: "route_all", defaultContainer: "container-personal", useSync: false });
    assert.equal(migrated.defaultDestinationId, "container-personal");
    assert.equal((migrated as Record<string, unknown>).defaultContainer, undefined);
  });

  it("is a no-op when defaultDestinationId is already present", () => {
    const migrated = migrateSettingsSchema({ mode: "route_all", defaultDestinationId: "dest-1", useSync: false });
    assert.equal(migrated.defaultDestinationId, "dest-1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/storage'`

- [ ] **Step 3: Write `src/core/storage.ts`**

```ts
import type { Destination, Rule, Settings } from "./types";

const DEFAULT_SETTINGS: Settings = { mode: "route_matched", defaultDestinationId: "", useSync: false };
let airtrafficSettings: Settings = { ...DEFAULT_SETTINGS };

function getStorage(): StorageArea {
  return airtrafficSettings.useSync ? browser.storage.sync : browser.storage.local;
}

export function migrateRuleSchema(raw: Record<string, unknown>): Rule {
  if (raw.destinationId === undefined && typeof raw.cookieStoreId === "string") {
    raw.destinationId = raw.cookieStoreId;
    delete raw.cookieStoreId;
  }
  return raw as unknown as Rule;
}

export function migrateSettingsSchema(raw: Record<string, unknown>): Settings {
  if (raw.defaultDestinationId === undefined && typeof raw.defaultContainer === "string") {
    raw.defaultDestinationId = raw.defaultContainer;
    delete raw.defaultContainer;
  }
  return raw as unknown as Settings;
}

export async function loadSettingsFromStorage(): Promise<Settings> {
  const data = await browser.storage.local.get("settings");
  const raw = (data.settings as Record<string, unknown>) || { ...DEFAULT_SETTINGS };
  airtrafficSettings = migrateSettingsSchema(raw);
  return airtrafficSettings;
}

export async function saveSettingsToStorage(updates: Partial<Settings>): Promise<void> {
  Object.assign(airtrafficSettings, updates);
  await browser.storage.local.set({ settings: airtrafficSettings });
}

export async function loadRulesFromStorage(): Promise<Rule[]> {
  const storage = getStorage();
  const data = await storage.get("rules");
  const rawRules = (data.rules as Record<string, unknown>[]) || [];
  return rawRules.map(migrateRuleSchema);
}

export async function saveRulesToStorage(rules: Rule[]): Promise<void> {
  const storage = getStorage();
  await storage.set({ rules });
}

export async function migrateRulesStorage(fromSync: boolean, toSync: boolean): Promise<void> {
  const oldStorage = fromSync ? browser.storage.sync : browser.storage.local;
  const newStorage = toSync ? browser.storage.sync : browser.storage.local;
  const data = await oldStorage.get("rules");
  const rawRules = (data.rules as Record<string, unknown>[]) || [];
  await newStorage.set({ rules: rawRules.map(migrateRuleSchema) });
}

export function getSettings(): Settings {
  return airtrafficSettings;
}

export async function loadDestinationsFromStorage(): Promise<Destination[]> {
  const storage = getStorage();
  const data = await storage.get("destinations");
  return (data.destinations as Destination[]) || [];
}

export async function saveDestinationsToStorage(destinations: Destination[]): Promise<void> {
  const storage = getStorage();
  await storage.set({ destinations });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all `storage-migration.test.ts` cases PASS; `pattern-matcher`/`route-resolver`/`constants` still PASS

- [ ] **Step 5: Stage the files**

```bash
git add src/core/storage.ts tests/storage-migration.test.ts
```

---

### Task 7: Chrome `group-planner` (TDD, pure)

**Files:**
- Create: `src/engines/chrome/group-planner.ts`
- Test: `tests/chrome-group-planner.test.ts`

**Interfaces:**
- Produces: `ChromeTabGroupRef`, `GroupPlan`, `planGroupAction(existingGroups, destinationName): GroupPlan` — used by Task 8 (Chrome engine).

- [ ] **Step 1: Write the failing test — `tests/chrome-group-planner.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planGroupAction } from "../src/engines/chrome/group-planner";

describe("planGroupAction", () => {
  it("reuses an existing group with a matching title", () => {
    const plan = planGroupAction([{ id: 7, title: "Work" }, { id: 9, title: "Social" }], "Work");
    assert.deepEqual(plan, { action: "reuse", groupId: 7 });
  });

  it("creates a new group when no title matches", () => {
    const plan = planGroupAction([{ id: 7, title: "Work" }], "Social");
    assert.deepEqual(plan, { action: "create" });
  });

  it("creates a new group when there are no existing groups", () => {
    const plan = planGroupAction([], "Work");
    assert.deepEqual(plan, { action: "create" });
  });

  it("is case-sensitive on the title match", () => {
    const plan = planGroupAction([{ id: 7, title: "work" }], "Work");
    assert.deepEqual(plan, { action: "create" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/engines/chrome/group-planner'`

- [ ] **Step 3: Write `src/engines/chrome/group-planner.ts`**

```ts
export interface ChromeTabGroupRef {
  id: number;
  title: string;
}

export type GroupPlan = { action: "reuse"; groupId: number } | { action: "create" };

export function planGroupAction(existingGroups: ChromeTabGroupRef[], destinationName: string): GroupPlan {
  const match = existingGroups.find((g) => g.title === destinationName);
  return match ? { action: "reuse", groupId: match.id } : { action: "create" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all `chrome-group-planner.test.ts` cases PASS

- [ ] **Step 5: Stage the files**

```bash
git add src/engines/chrome/group-planner.ts tests/chrome-group-planner.test.ts
```

---

### Task 8: Firefox colors (move) + Chrome colors (new)

**Files:**
- Create: `src/engines/firefox/colors.ts`
- Create: `src/engines/chrome/colors.ts`
- Test: `tests/firefox-colors.test.ts`
- Test: `tests/chrome-colors.test.ts`

**Interfaces:**
- Produces: `CONTAINER_COLORS`, `CONTAINER_ICONS` (Firefox); `CHROME_GROUP_COLORS` (Chrome) — used by Task 9/10 (engines) and Task 14/15 (entrypoints, options UI).

- [ ] **Step 1: Write `src/engines/firefox/colors.ts`** (moved unchanged from `src/shared/constants.ts`)

```ts
export const CONTAINER_COLORS: Record<string, string> = {
  blue: "#37adff", turquoise: "#00c79a", green: "#51cd00",
  yellow: "#ffcb00", orange: "#ff9f00", red: "#ff613d",
  pink: "#ff4bda", purple: "#af51f5", toolbar: "#7c7c7d",
};

export const CONTAINER_ICONS: Record<string, string> = {
  fingerprint: "🖐️",
  briefcase: "💼",
  dollar: "💲",
  cart: "🛒",
  circle: "⭕",
  gift: "🎁",
  vacation: "✈️",
  food: "🍔",
  fruit: "🍎",
  pet: "🐾",
  tree: "🌳",
  chill: "❄️",
  fence: "🌟",
};
```

- [ ] **Step 2: Write `tests/firefox-colors.test.ts`** (moved from the old `constants.test.ts`)

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTAINER_COLORS, CONTAINER_ICONS } from "../src/engines/firefox/colors";

describe("CONTAINER_COLORS", () => {
  it("has standard Firefox container colors", () => {
    const required = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"];
    for (const color of required) {
      assert.ok(CONTAINER_COLORS[color], `missing color: ${color}`);
    }
  });

  it("all values are hex color strings", () => {
    for (const [name, value] of Object.entries(CONTAINER_COLORS)) {
      assert.match(value, /^#[0-9a-f]{6}$/i, `${name} is not a valid hex color: ${value}`);
    }
  });
});

describe("CONTAINER_ICONS", () => {
  it("has standard Firefox container icons", () => {
    const required = ["fingerprint", "briefcase", "dollar", "cart", "circle", "gift", "vacation", "food", "fruit", "pet", "tree", "chill", "fence"];
    for (const icon of required) {
      assert.ok(CONTAINER_ICONS[icon], `missing icon: ${icon}`);
    }
  });

  it("all values are non-empty strings", () => {
    for (const [name, value] of Object.entries(CONTAINER_ICONS)) {
      assert.ok(value.length > 0, `${name} icon is empty`);
    }
  });
});
```

- [ ] **Step 3: Write `src/engines/chrome/colors.ts`**

```ts
// Approximate swatches for the options-page preview dot only — Chrome
// renders the actual tab group color itself, theme-adjusted, at runtime.
export const CHROME_GROUP_COLORS: Record<string, string> = {
  grey: "#9aa0a6",
  blue: "#8ab4f8",
  red: "#f28b82",
  yellow: "#fdd663",
  green: "#81c995",
  pink: "#ff8bcb",
  purple: "#d7aefb",
  cyan: "#78d9ec",
  orange: "#fcad70",
};
```

- [ ] **Step 4: Write `tests/chrome-colors.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHROME_GROUP_COLORS } from "../src/engines/chrome/colors";

describe("CHROME_GROUP_COLORS", () => {
  it("has all native Chrome tab group colors", () => {
    const required = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
    for (const color of required) {
      assert.ok(CHROME_GROUP_COLORS[color], `missing color: ${color}`);
    }
  });

  it("all values are hex color strings", () => {
    for (const [name, value] of Object.entries(CHROME_GROUP_COLORS)) {
      assert.match(value, /^#[0-9a-f]{6}$/i, `${name} is not a valid hex color: ${value}`);
    }
  });

  it("has exactly 9 colors (Chrome's fixed palette)", () => {
    assert.equal(Object.keys(CHROME_GROUP_COLORS).length, 9);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all test files so far PASS

- [ ] **Step 6: Stage the files**

```bash
git add src/engines/firefox/colors.ts src/engines/chrome/colors.ts tests/firefox-colors.test.ts tests/chrome-colors.test.ts
```

---

### Task 9: Firefox engine (TDD, fake `browser`)

**Files:**
- Create: `src/engines/firefox/index.ts`
- Test: `tests/firefox-engine.test.ts`

**Interfaces:**
- Consumes: `Engine`, `EngineTab` (Task 1), ambient `browser.contextualIdentities`/`browser.tabs` (Task 2).
- Produces: `firefoxEngine: Engine` — used by Task 15 (entrypoints).

- [ ] **Step 1: Write the failing test — `tests/firefox-engine.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { firefoxEngine } from "../src/engines/firefox";

interface FakeContainer {
  cookieStoreId: string;
  name: string;
  color: string;
  icon: string;
}

function installFakeBrowser() {
  const containers: FakeContainer[] = [
    { cookieStoreId: "firefox-container-1", name: "Work", color: "blue", icon: "briefcase" },
  ];
  const createdTabs: Array<{ id: number; url?: string; cookieStoreId?: string; active?: boolean; index?: number; windowId?: number }> = [];
  const removedTabIds: number[] = [];
  let nextTabId = 100;
  let nextContainerId = 2;

  (globalThis as any).browser = {
    contextualIdentities: {
      async query() {
        return containers;
      },
      async get(cookieStoreId: string) {
        const found = containers.find((c) => c.cookieStoreId === cookieStoreId);
        if (!found) throw new Error("not found");
        return found;
      },
      async create(details: { name: string; color: string; icon: string }) {
        const c = { cookieStoreId: `firefox-container-${nextContainerId++}`, ...details };
        containers.push(c);
        return c;
      },
      async update(cookieStoreId: string, details: Partial<FakeContainer>) {
        const c = containers.find((c) => c.cookieStoreId === cookieStoreId);
        if (c) Object.assign(c, details);
        return c;
      },
      async remove(cookieStoreId: string) {
        const idx = containers.findIndex((c) => c.cookieStoreId === cookieStoreId);
        if (idx >= 0) containers.splice(idx, 1);
      },
      onCreated: { addListener() {} },
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
    },
    tabs: {
      async create(props: any) {
        const tab = { id: nextTabId++, ...props };
        createdTabs.push(tab);
        return tab;
      },
      remove(tabId: number) {
        removedTabIds.push(tabId);
      },
    },
  };

  return { containers, createdTabs, removedTabIds };
}

describe("firefoxEngine", () => {
  it("id is 'firefox'", () => {
    assert.equal(firefoxEngine.id, "firefox");
  });

  it("listDestinations maps contextualIdentities to Destination[]", async () => {
    installFakeBrowser();
    const destinations = await firefoxEngine.listDestinations();
    assert.deepEqual(destinations, [{ id: "firefox-container-1", name: "Work", color: "blue", icon: "briefcase" }]);
  });

  it("createDestination creates a new container", async () => {
    installFakeBrowser();
    const dest = await firefoxEngine.createDestination({ name: "Social", color: "pink", icon: "gift" });
    assert.equal(dest.name, "Social");
    assert.ok(dest.id.startsWith("firefox-container-"));
  });

  it("currentDestinationId returns the tab's cookieStoreId", async () => {
    installFakeBrowser();
    const id = await firefoxEngine.currentDestinationId({ id: 1, windowId: 1, index: 0, active: true, cookieStoreId: "firefox-container-1" });
    assert.equal(id, "firefox-container-1");
  });

  it("currentDestinationId returns empty string when there's no cookieStoreId", async () => {
    installFakeBrowser();
    const id = await firefoxEngine.currentDestinationId({ id: 1, windowId: 1, index: 0, active: true });
    assert.equal(id, "");
  });

  it("applyRoute creates a tab in the destination container, removes the old one, and returns true", async () => {
    const fake = installFakeBrowser();
    const routed = await firefoxEngine.applyRoute(
      { id: 5, url: "https://github.com", windowId: 1, index: 0, active: true },
      "firefox-container-1",
    );
    assert.equal(routed, true);
    assert.equal(fake.createdTabs.length, 1);
    assert.equal(fake.createdTabs[0].cookieStoreId, "firefox-container-1");
    assert.equal(fake.createdTabs[0].url, "https://github.com");
    assert.deepEqual(fake.removedTabIds, [5]);
  });

  it("applyRoute skips silently and returns false when the destination container no longer exists", async () => {
    const fake = installFakeBrowser();
    const routed = await firefoxEngine.applyRoute(
      { id: 5, url: "https://github.com", windowId: 1, index: 0, active: true },
      "does-not-exist",
    );
    assert.equal(routed, false);
    assert.equal(fake.createdTabs.length, 0);
    assert.deepEqual(fake.removedTabIds, []);
  });

  it("shouldSkip returns true for a tabId just routed by applyRoute", async () => {
    const fake = installFakeBrowser();
    await firefoxEngine.applyRoute(
      { id: 5, url: "https://github.com", windowId: 1, index: 0, active: true },
      "firefox-container-1",
    );
    const newTabId = fake.createdTabs[0].id;
    assert.equal(firefoxEngine.shouldSkip(newTabId), true);
    assert.equal(firefoxEngine.shouldSkip(999), false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/engines/firefox'`

- [ ] **Step 3: Write `src/engines/firefox/index.ts`**

```ts
import type { Engine, EngineTab } from "../../core/engine";
import type { NewDestination } from "../../core/types";

const TRANSIT_TIMEOUT_MS = 5000;
const tabsInTransit = new Set<number>();

async function containerExists(cookieStoreId: string): Promise<boolean> {
  try {
    await browser.contextualIdentities.get(cookieStoreId);
    return true;
  } catch {
    return false;
  }
}

async function listDestinations() {
  const containers = await browser.contextualIdentities.query({});
  return containers.map((c) => ({ id: c.cookieStoreId, name: c.name, color: c.color, icon: c.icon }));
}

async function createDestination(input: NewDestination) {
  const c = await browser.contextualIdentities.create({
    name: input.name,
    color: input.color,
    icon: input.icon || "circle",
  });
  return { id: c.cookieStoreId, name: c.name, color: c.color, icon: c.icon };
}

async function updateDestination(id: string, patch: Partial<NewDestination>): Promise<void> {
  await browser.contextualIdentities.update(id, patch);
}

async function deleteDestination(id: string): Promise<void> {
  await browser.contextualIdentities.remove(id);
}

function shouldSkip(tabId: number): boolean {
  return tabsInTransit.has(tabId);
}

async function currentDestinationId(tab: EngineTab): Promise<string> {
  return tab.cookieStoreId ?? "";
}

async function applyRoute(tab: EngineTab, destinationId: string): Promise<boolean> {
  const exists = await containerExists(destinationId);
  if (!exists) {
    console.warn(`[Air Traffic] Container ${destinationId} not found, skipping redirect`);
    return false;
  }

  const newTab = await browser.tabs.create({
    url: tab.url,
    cookieStoreId: destinationId,
    active: tab.active,
    index: tab.index + 1,
    windowId: tab.windowId,
  });

  if (newTab.id != null) {
    tabsInTransit.add(newTab.id);
    setTimeout(() => tabsInTransit.delete(newTab.id!), TRANSIT_TIMEOUT_MS);
  }

  browser.tabs.remove(tab.id);
  return true;
}

async function openInDestination(url: string, destinationId: string, refTab: EngineTab): Promise<void> {
  const exists = await containerExists(destinationId);
  if (!exists) return;
  await browser.tabs.create({
    url,
    cookieStoreId: destinationId,
    active: true,
    index: refTab.index + 1,
    windowId: refTab.windowId,
  });
}

function onDestinationsChanged(cb: () => void): void {
  browser.contextualIdentities.onCreated.addListener(cb);
  browser.contextualIdentities.onRemoved.addListener(cb);
  browser.contextualIdentities.onUpdated.addListener(cb);
}

export const firefoxEngine: Engine = {
  id: "firefox",
  listDestinations,
  createDestination,
  updateDestination,
  deleteDestination,
  shouldSkip,
  currentDestinationId,
  applyRoute,
  openInDestination,
  onDestinationsChanged,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all `firefox-engine.test.ts` cases PASS. Note: the suite may take ~5s longer to exit due to the `TRANSIT_TIMEOUT_MS` timer left pending by the last test — this is expected, not a failure.

- [ ] **Step 5: Stage the files**

```bash
git add src/engines/firefox/index.ts tests/firefox-engine.test.ts
```

---

### Task 10: Chrome engine (TDD, fake `browser`)

**Files:**
- Create: `src/engines/chrome/index.ts`
- Create: `src/engines/chrome/polyfill.ts`
- Test: `tests/chrome-engine.test.ts`

**Interfaces:**
- Consumes: `Engine`, `EngineTab` (Task 1), `loadDestinationsFromStorage`/`saveDestinationsToStorage` (Task 6), `planGroupAction` (Task 7), ambient `browser.tabGroups`/`browser.tabs.group` (Task 2).
- Produces: `chromeEngine: Engine` — used by Task 15 (entrypoints).

- [ ] **Step 1: Write the failing test — `tests/chrome-engine.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chromeEngine } from "../src/engines/chrome";

function installFakeBrowser() {
  const store: Record<string, unknown> = {};
  const groups: Array<{ id: number; title: string; color: string; windowId: number }> = [];
  const groupedTabs: Record<number, number> = {};
  let nextGroupId = 1;
  let nextTabId = 100;

  (globalThis as any).browser = {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: store[key] };
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
      },
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      async query(filter: { windowId?: number; title?: string }) {
        return groups.filter(
          (g) =>
            (filter.windowId === undefined || g.windowId === filter.windowId) &&
            (filter.title === undefined || g.title === filter.title),
        );
      },
      async get(groupId: number) {
        const g = groups.find((g) => g.id === groupId);
        if (!g) throw new Error("group not found");
        return g;
      },
      async update(groupId: number, details: { title?: string; color?: string }) {
        const g = groups.find((g) => g.id === groupId);
        if (g) Object.assign(g, details);
      },
    },
    tabs: {
      async group(props: { tabIds: number[]; groupId?: number }) {
        const groupId = props.groupId ?? nextGroupId++;
        if (props.groupId === undefined) {
          groups.push({ id: groupId, title: "", color: "grey", windowId: 1 });
        }
        for (const tabId of props.tabIds) groupedTabs[tabId] = groupId;
        return groupId;
      },
      async create(props: { url?: string; active?: boolean; index?: number; windowId?: number }) {
        return { id: nextTabId++, ...props };
      },
    },
  };

  return { store, groups, groupedTabs };
}

describe("chromeEngine", () => {
  it("id is 'chrome'", () => {
    assert.equal(chromeEngine.id, "chrome");
  });

  it("createDestination persists a new destination with a generated id", async () => {
    installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });
    assert.equal(dest.name, "Work");
    assert.ok(dest.id.length > 0);

    const listed = await chromeEngine.listDestinations();
    assert.deepEqual(listed, [dest]);
  });

  it("updateDestination patches an existing destination", async () => {
    installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });
    await chromeEngine.updateDestination(dest.id, { color: "red" });
    const listed = await chromeEngine.listDestinations();
    assert.equal(listed[0].color, "red");
  });

  it("deleteDestination removes it from the list", async () => {
    installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });
    await chromeEngine.deleteDestination(dest.id);
    assert.deepEqual(await chromeEngine.listDestinations(), []);
  });

  it("shouldSkip always returns false", () => {
    assert.equal(chromeEngine.shouldSkip(123), false);
  });

  it("applyRoute creates a new group, titles/colors it, and returns true when none exists", async () => {
    const fake = installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });
    const routed = await chromeEngine.applyRoute({ id: 5, windowId: 1, index: 0, active: true }, dest.id);

    assert.equal(routed, true);
    assert.equal(fake.groups.length, 1);
    assert.equal(fake.groups[0].title, "Work");
    assert.equal(fake.groups[0].color, "blue");
    assert.equal(fake.groupedTabs[5], fake.groups[0].id);
  });

  it("applyRoute reuses an existing group with the same title in the same window", async () => {
    const fake = installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });
    fake.groups.push({ id: 42, title: "Work", color: "blue", windowId: 1 });

    const routed = await chromeEngine.applyRoute({ id: 5, windowId: 1, index: 0, active: true }, dest.id);

    assert.equal(routed, true);
    assert.equal(fake.groups.length, 1);
    assert.equal(fake.groupedTabs[5], 42);
  });

  it("applyRoute skips silently and returns false when the destination no longer exists", async () => {
    const fake = installFakeBrowser();
    const routed = await chromeEngine.applyRoute({ id: 5, windowId: 1, index: 0, active: true }, "missing");
    assert.equal(routed, false);
    assert.equal(fake.groups.length, 0);
  });

  it("currentDestinationId resolves a tab's group back to its destination", async () => {
    installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });
    await chromeEngine.applyRoute({ id: 5, windowId: 1, index: 0, active: true }, dest.id);

    const id = await chromeEngine.currentDestinationId({ id: 5, windowId: 1, index: 0, active: true, groupId: 1 });
    assert.equal(id, dest.id);
  });

  it("currentDestinationId returns empty string when the tab has no group", async () => {
    installFakeBrowser();
    const id = await chromeEngine.currentDestinationId({ id: 5, windowId: 1, index: 0, active: true, groupId: -1 });
    assert.equal(id, "");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/engines/chrome'`

- [ ] **Step 3: Write `src/engines/chrome/index.ts`**

```ts
import type { Engine, EngineTab } from "../../core/engine";
import type { Destination, NewDestination } from "../../core/types";
import { loadDestinationsFromStorage, saveDestinationsToStorage } from "../../core/storage";
import { planGroupAction } from "./group-planner";

async function findDestination(id: string): Promise<Destination | undefined> {
  const destinations = await loadDestinationsFromStorage();
  return destinations.find((d) => d.id === id);
}

async function findDestinationByGroupTitle(title: string): Promise<Destination | undefined> {
  const destinations = await loadDestinationsFromStorage();
  return destinations.find((d) => d.name === title);
}

async function listDestinations() {
  return loadDestinationsFromStorage();
}

async function createDestination(input: NewDestination): Promise<Destination> {
  const destinations = await loadDestinationsFromStorage();
  const destination: Destination = { id: crypto.randomUUID(), name: input.name, color: input.color };
  destinations.push(destination);
  await saveDestinationsToStorage(destinations);
  return destination;
}

async function updateDestination(id: string, patch: Partial<NewDestination>): Promise<void> {
  const destinations = await loadDestinationsFromStorage();
  const destination = destinations.find((d) => d.id === id);
  if (destination) Object.assign(destination, patch);
  await saveDestinationsToStorage(destinations);
}

async function deleteDestination(id: string): Promise<void> {
  const destinations = await loadDestinationsFromStorage();
  await saveDestinationsToStorage(destinations.filter((d) => d.id !== id));
}

function shouldSkip(): boolean {
  return false;
}

async function currentDestinationId(tab: EngineTab): Promise<string> {
  if (tab.groupId === undefined || tab.groupId === browser.tabGroups.TAB_GROUP_ID_NONE) return "";
  const group = await browser.tabGroups.get(tab.groupId);
  const destination = await findDestinationByGroupTitle(group.title);
  return destination?.id ?? "";
}

async function applyRoute(tab: EngineTab, destinationId: string): Promise<boolean> {
  const destination = await findDestination(destinationId);
  if (!destination) {
    console.warn(`[Air Traffic] Destination ${destinationId} not found, skipping route`);
    return false;
  }

  try {
    const existingGroups = await browser.tabGroups.query({ windowId: tab.windowId, title: destination.name });
    const plan = planGroupAction(existingGroups, destination.name);

    if (plan.action === "reuse") {
      await browser.tabs.group({ tabIds: [tab.id], groupId: plan.groupId });
    } else {
      const groupId = await browser.tabs.group({ tabIds: [tab.id] });
      await browser.tabGroups.update(groupId, { title: destination.name, color: destination.color });
    }
    return true;
  } catch (err) {
    console.warn(`[Air Traffic] Failed to group tab ${tab.id} into ${destination.name}`, err);
    return false;
  }
}

async function openInDestination(url: string, destinationId: string, refTab: EngineTab): Promise<void> {
  const newTab = await browser.tabs.create({
    url,
    active: true,
    index: refTab.index + 1,
    windowId: refTab.windowId,
  });
  if (newTab.id != null) {
    await applyRoute(
      { id: newTab.id, url, windowId: refTab.windowId, index: refTab.index + 1, active: true },
      destinationId,
    );
  }
}

function onDestinationsChanged(): void {
  // Destinations are local metadata; ui/background.ts reacts to
  // storage.onChanged for the "destinations" key instead.
}

export const chromeEngine: Engine = {
  id: "chrome",
  listDestinations,
  createDestination,
  updateDestination,
  deleteDestination,
  shouldSkip,
  currentDestinationId,
  applyRoute,
  openInDestination,
  onDestinationsChanged,
};
```

- [ ] **Step 4: Write `src/engines/chrome/polyfill.ts`**

```ts
import Browser from "webextension-polyfill";

(globalThis as unknown as { browser: typeof browser }).browser = Browser;
```

- [ ] **Step 5: Install the `webextension-polyfill` dependency**

Run: `npm install --save-dev webextension-polyfill`
Expected: adds `webextension-polyfill` to `devDependencies` in `package.json` and `package-lock.json`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all `chrome-engine.test.ts` cases PASS (the test file imports `../src/engines/chrome` directly, not `polyfill.ts`, so no real polyfill/network access is needed to run it)

- [ ] **Step 7: Stage the files**

```bash
git add src/engines/chrome/index.ts src/engines/chrome/polyfill.ts tests/chrome-engine.test.ts package.json package-lock.json
```

---

### Task 11: Shared UI — `ui/destinations.ts` (destination cache + select population)

**Files:**
- Create: `src/ui/destinations.ts`

**Interfaces:**
- Consumes: `Engine`, `Destination` (Task 1).
- Produces: `loadDestinationList(engine)`, `getDestinations()`, `getDestinationName(id)`, `getDestinationColor(id, colorMap)`, `populateDestinationSelect(selectEl, placeholder?)` — used by Task 12 (`ui/rules-ui.ts`) and Task 14 (`ui/popup.ts`/`ui/options.ts`).

No automated test for this file — it's DOM-manipulation glue with no test infrastructure for DOM in this project today (same boundary as the pre-existing `shared/containers.ts`, which also had no tests). Verified via `tsc --noEmit` now and manual smoke test in Task 18.

- [ ] **Step 1: Write `src/ui/destinations.ts`**

```ts
import type { Engine } from "../core/engine";
import type { Destination } from "../core/types";

let cached: Destination[] = [];

export async function loadDestinationList(engine: Engine): Promise<Destination[]> {
  cached = await engine.listDestinations();
  return cached;
}

export function getDestinations(): Destination[] {
  return cached;
}

export function getDestinationName(id: string): string {
  const d = cached.find((d) => d.id === id);
  return d ? d.name : id;
}

export function getDestinationColor(id: string, colorMap: Record<string, string>): string {
  const d = cached.find((d) => d.id === id);
  if (!d) return "#555";
  return colorMap[d.color] || "#555";
}

export function populateDestinationSelect(selectEl: HTMLSelectElement, placeholder?: string): void {
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = placeholder || "Select destination...";
  selectEl.replaceChildren(defaultOpt);
  for (const d of cached) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.icon ? `${d.icon} ${d.name}` : d.name;
    selectEl.appendChild(opt);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Stage the file**

```bash
git add src/ui/destinations.ts
```

---

### Task 12: Shared UI — `ui/rules-ui.ts` (generalized, engine-agnostic)

**Files:**
- Create: `src/ui/rules-ui.ts`

**Interfaces:**
- Consumes: `Rule`, `RulesUIOptions` (Task 1), `MATCH_TYPE_CONFIG` (Task 5), `getDestinationName`/`getDestinationColor` (Task 11), `saveRulesToStorage` (Task 6).
- Produces: `initRulesUI(opts)`, `setRules(rules)`, `getRules()`, `renderRulesList(rules)` — used by Task 14 (`ui/popup.ts`/`ui/options.ts`).

No automated test — mirrors the pre-existing `shared/rules-ui.ts`, which also had no tests (DOM-heavy). Verified via `tsc --noEmit` and manual smoke test in Task 18.

- [ ] **Step 1: Write `src/ui/rules-ui.ts`**

```ts
import type { Rule, RulesUIOptions } from "../core/types";
import { MATCH_TYPE_CONFIG } from "../core/constants";
import { getDestinationColor, getDestinationName } from "./destinations";
import { saveRulesToStorage } from "../core/storage";

interface RulesState {
  editingRuleId: string | null;
  allRules: Rule[];
  draggedItem: HTMLElement | null;
  draggedIndex: number;
  rulesList: HTMLUListElement | null;
  patternInput: HTMLInputElement | null;
  matchTypeSelect: HTMLSelectElement | null;
  destinationSelect: HTMLSelectElement | null;
  submitBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
  matchHint: HTMLElement | null;
  form: HTMLFormElement | null;
  negateCheckbox: HTMLInputElement | null;
  colorMap: Record<string, string>;
  onRulesChanged: (() => void) | null;
}

const state: RulesState = {
  editingRuleId: null,
  allRules: [],
  draggedItem: null,
  draggedIndex: -1,
  rulesList: null,
  patternInput: null,
  matchTypeSelect: null,
  destinationSelect: null,
  submitBtn: null,
  cancelBtn: null,
  matchHint: null,
  form: null,
  negateCheckbox: null,
  colorMap: {},
  onRulesChanged: null,
};

function updateMatchHints(): void {
  if (!state.matchTypeSelect || !state.patternInput || !state.matchHint) return;
  const config = MATCH_TYPE_CONFIG[state.matchTypeSelect.value];
  if (!config) return;
  state.patternInput.placeholder = config.placeholder;
  const negated = state.negateCheckbox?.checked;
  state.matchHint.textContent = negated ? `Matches everything EXCEPT: ${config.hint}` : config.hint;
}

function cancelRuleEdit(): void {
  state.editingRuleId = null;
  if (state.patternInput) state.patternInput.value = "";
  if (state.matchTypeSelect) state.matchTypeSelect.value = "domain";
  if (state.destinationSelect) state.destinationSelect.value = "";
  if (state.submitBtn) state.submitBtn.textContent = "Add Rule";
  if (state.cancelBtn) state.cancelBtn.hidden = true;
  if (state.negateCheckbox) state.negateCheckbox.checked = false;
  updateMatchHints();
}

function startRuleEdit(rule: Rule): void {
  state.editingRuleId = rule.id;
  if (state.patternInput) state.patternInput.value = rule.pattern;
  if (state.matchTypeSelect) state.matchTypeSelect.value = rule.matchType;
  if (state.destinationSelect) state.destinationSelect.value = rule.destinationId;
  if (state.negateCheckbox) state.negateCheckbox.checked = rule.negate || false;
  if (state.submitBtn) state.submitBtn.textContent = "Save";
  if (state.cancelBtn) state.cancelBtn.hidden = false;
  updateMatchHints();
  state.patternInput?.focus();
  state.patternInput?.scrollIntoView?.({ behavior: "smooth", block: "center" });
}

async function deleteRuleById(id: string): Promise<void> {
  state.allRules = state.allRules.filter((r) => r.id !== id);
  if (state.editingRuleId === id) cancelRuleEdit();
  await saveRulesToStorage(state.allRules);
  renderRulesList(state.allRules);
  state.onRulesChanged?.();
}

export function initRulesUI(opts: RulesUIOptions): void {
  state.rulesList = opts.rulesList;
  state.patternInput = opts.patternInput;
  state.matchTypeSelect = opts.matchTypeSelect;
  state.destinationSelect = opts.destinationSelect;
  state.submitBtn = opts.submitBtn;
  state.cancelBtn = opts.cancelBtn;
  state.matchHint = opts.matchHint;
  state.form = opts.form;
  state.negateCheckbox = opts.negateCheckbox || null;
  state.colorMap = opts.colorMap;
  state.onRulesChanged = opts.onRulesChanged || null;

  state.matchTypeSelect.addEventListener("change", updateMatchHints);
  if (state.negateCheckbox) state.negateCheckbox.addEventListener("change", updateMatchHints);
  state.cancelBtn.addEventListener("click", cancelRuleEdit);

  state.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pattern = state.patternInput!.value.trim();
    const matchType = state.matchTypeSelect!.value;
    const destinationId = state.destinationSelect!.value;
    if (!pattern || !destinationId) return;

    const negate = state.negateCheckbox?.checked || false;

    if (state.editingRuleId) {
      const rule = state.allRules.find((r) => r.id === state.editingRuleId);
      if (rule) {
        rule.pattern = pattern;
        rule.matchType = matchType as Rule["matchType"];
        rule.destinationId = destinationId;
        rule.negate = negate || undefined;
      }
      cancelRuleEdit();
    } else {
      state.allRules.push({
        id: crypto.randomUUID(),
        pattern,
        matchType: matchType as Rule["matchType"],
        destinationId,
        ...(negate ? { negate: true } : {}),
      });
      state.patternInput!.value = "";
    }

    await saveRulesToStorage(state.allRules);
    renderRulesList(state.allRules);
    state.onRulesChanged?.();
  });

  updateMatchHints();
}

export function setRules(rules: Rule[]): void {
  state.allRules = rules;
}

export function getRules(): Rule[] {
  return state.allRules;
}

export function renderRulesList(rules: Rule[]): void {
  const list = state.rulesList;
  if (!list) return;
  list.replaceChildren();

  rules.forEach((rule, index) => {
    const li = document.createElement("li");
    li.className = "rule-item";
    li.draggable = true;
    li.dataset.index = String(index);

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "☰";

    const info = document.createElement("div");
    info.className = "rule-info";

    const pattern = document.createElement("span");
    pattern.className = "rule-pattern";
    pattern.textContent = rule.pattern;

    const meta = document.createElement("span");
    meta.className = "rule-meta";
    const label = MATCH_TYPE_CONFIG[rule.matchType]?.label || rule.matchType;
    meta.textContent = rule.negate ? `NOT ${label}` : label;

    info.appendChild(pattern);
    info.appendChild(meta);

    const badge = document.createElement("span");
    badge.className = "container-badge";
    badge.style.backgroundColor = getDestinationColor(rule.destinationId, state.colorMap);
    badge.textContent = getDestinationName(rule.destinationId);

    const actions = document.createElement("div");
    actions.className = "rule-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Edit";
    editBtn.addEventListener("click", () => startRuleEdit(rule));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", () => deleteRuleById(rule.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(handle);
    li.appendChild(info);
    li.appendChild(badge);
    li.appendChild(actions);

    li.addEventListener("dragstart", (e) => {
      state.draggedItem = li;
      state.draggedIndex = index;
      li.classList.add("dragging");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });

    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      state.draggedItem = null;
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (state.draggedItem && state.draggedItem !== li) li.classList.add("drag-over");
    });

    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));

    li.addEventListener("drop", async (e) => {
      e.preventDefault();
      li.classList.remove("drag-over");
      const targetIndex = parseInt(li.dataset.index || "0");
      if (state.draggedIndex === targetIndex) return;
      const [moved] = state.allRules.splice(state.draggedIndex, 1);
      if (!moved) return;
      state.allRules.splice(targetIndex, 0, moved);
      await saveRulesToStorage(state.allRules);
      renderRulesList(state.allRules);
      state.onRulesChanged?.();
    });

    list.appendChild(li);
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Stage the file**

```bash
git add src/ui/rules-ui.ts
```

---

### Task 13: Shared UI — `ui/background.ts` (engine-driven runtime)

**Files:**
- Create: `src/ui/background.ts`

**Interfaces:**
- Consumes: `Engine`, `EngineTab` (Task 1), `isIgnoredUrl`/`resolveRoute` (Task 4), `loadRulesFromStorage`/`loadSettingsFromStorage` (Task 6), ambient `browser.action`/`browser.contextMenus`/`browser.tabs`/`browser.storage` (Task 2).
- Produces: `runBackground(engine: Engine): void` — used by Task 15 (entrypoints).

No automated test — needs a live `browser.tabs.onUpdated`/`browser.contextMenus` event loop, out of scope for `node:test`. Verified via `tsc --noEmit` and manual smoke test in Task 18.

- [ ] **Step 1: Write `src/ui/background.ts`**

```ts
import type { Engine, EngineTab } from "../core/engine";
import type { Rule, Settings } from "../core/types";
import { isIgnoredUrl, resolveRoute } from "../core/route-resolver";
import { loadRulesFromStorage, loadSettingsFromStorage } from "../core/storage";

const BADGE_CLEAR_MS = 3000;

export function runBackground(engine: Engine): void {
  let cachedRules: Rule[] = [];
  let cachedSettings: Settings = { mode: "route_matched", defaultDestinationId: "", useSync: false };
  let redirectCount = 0;

  async function loadRules(): Promise<void> {
    cachedSettings = await loadSettingsFromStorage();
    cachedRules = await loadRulesFromStorage();
  }

  function showBadge(text: string): void {
    browser.action.setBadgeText({ text });
    browser.action.setBadgeBackgroundColor({ color: "#2ecc71" });
    setTimeout(() => browser.action.setBadgeText({ text: "" }), BADGE_CLEAR_MS);
  }

  async function handleTabUpdate(tabId: number, changeInfo: TabChangeInfo, tab: Tab): Promise<void> {
    if (!changeInfo.url) return;
    if (engine.shouldSkip(tabId)) return;
    if (tab.id == null || tab.windowId == null) return;

    const engineTab: EngineTab = {
      id: tab.id,
      url: changeInfo.url,
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active ?? false,
      cookieStoreId: tab.cookieStoreId,
      groupId: tab.groupId,
    };

    const current = await engine.currentDestinationId(engineTab);
    const result = resolveRoute(changeInfo.url, cachedRules, cachedSettings, current);
    if (result.action === "none") return;

    const routed = await engine.applyRoute(engineTab, result.destinationId);
    if (routed) {
      redirectCount++;
      showBadge(`${redirectCount}`);
    }
  }

  async function buildContextMenus(): Promise<void> {
    await browser.contextMenus.removeAll();
    const destinations = await engine.listDestinations();
    for (const d of destinations) {
      browser.contextMenus.create({
        id: `open-in-${d.id}`,
        title: `Open in ${d.name}`,
        contexts: ["link"],
      });
    }
  }

  browser.contextMenus.onClicked.addListener(async (info: MenuClickInfo, tab?: Tab) => {
    const prefix = "open-in-";
    if (!info.menuItemId.startsWith(prefix)) return;

    const destinationId = info.menuItemId.slice(prefix.length);
    const url = info.linkUrl;
    if (!url || isIgnoredUrl(url)) return;

    const refTab: EngineTab = {
      id: tab?.id ?? -1,
      windowId: tab?.windowId ?? -1,
      index: tab?.index ?? 0,
      active: false,
    };
    await engine.openInDestination(url, destinationId, refTab);
  });

  engine.onDestinationsChanged(buildContextMenus);

  browser.storage.onChanged.addListener((changes: Record<string, StorageChange>, area: string) => {
    if (area === "local" && changes.settings) {
      loadRules();
    }
    if (changes.rules) {
      loadRulesFromStorage().then((rules) => {
        cachedRules = rules;
      });
    }
    if (changes.destinations) {
      buildContextMenus();
    }
  });

  browser.tabs.onUpdated.addListener(handleTabUpdate);

  loadRules();
  buildContextMenus();
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Stage the file**

```bash
git add src/ui/background.ts
```

---

### Task 14: Shared UI — `ui/popup.ts` and `ui/options.ts` + HTML updates

**Files:**
- Create: `src/ui/popup.ts`
- Create: `src/ui/options.ts`
- Modify: `src/popup/popup.html`
- Modify: `src/options/options.html`

**Interfaces:**
- Consumes: `Engine`, `Destination` (Task 1), `loadDestinationList`/`getDestinations`/`getDestinationName`/`populateDestinationSelect` (Task 11), `initRulesUI`/`setRules`/`getRules`/`renderRulesList` (Task 12), storage functions (Task 6).
- Produces: `runPopup(engine, colorMap)`, `runOptions(engine, colorMap, iconMap?)` — used by Task 15 (entrypoints).

No automated test — DOM-heavy entry glue, same boundary as the pre-existing `popup.ts`/`options.ts`. Verified via `tsc --noEmit` and manual smoke test in Task 18.

- [ ] **Step 1: Write `src/ui/popup.ts`**

```ts
import type { Engine } from "../core/engine";
import { loadDestinationList, populateDestinationSelect } from "./destinations";
import { initRulesUI, setRules, renderRulesList } from "./rules-ui";
import { loadSettingsFromStorage, loadRulesFromStorage } from "../core/storage";

export async function runPopup(engine: Engine, colorMap: Record<string, string>): Promise<void> {
  const destinationSelect = document.getElementById("destination-select") as HTMLSelectElement;

  initRulesUI({
    rulesList: document.getElementById("rules-list") as HTMLUListElement,
    patternInput: document.getElementById("pattern-input") as HTMLInputElement,
    matchTypeSelect: document.getElementById("match-type-select") as HTMLSelectElement,
    destinationSelect,
    submitBtn: document.getElementById("submit-btn") as HTMLButtonElement,
    cancelBtn: document.getElementById("cancel-btn") as HTMLButtonElement,
    matchHint: document.getElementById("match-hint") as HTMLElement,
    form: document.getElementById("add-rule-form") as HTMLFormElement,
    negateCheckbox: document.getElementById("negate-checkbox") as HTMLInputElement,
    colorMap,
  });

  document.getElementById("open-settings")!.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  await loadDestinationList(engine);
  populateDestinationSelect(destinationSelect);
  await loadSettingsFromStorage();
  const rules = await loadRulesFromStorage();
  setRules(rules);
  renderRulesList(rules);
}
```

- [ ] **Step 2: Write `src/ui/options.ts`**

```ts
import type { Engine } from "../core/engine";
import type { Destination } from "../core/types";
import {
  loadDestinationList,
  getDestinations,
  getDestinationName,
  populateDestinationSelect,
} from "./destinations";
import { initRulesUI, setRules, getRules, renderRulesList } from "./rules-ui";
import {
  loadSettingsFromStorage,
  saveSettingsToStorage,
  loadRulesFromStorage,
  saveRulesToStorage,
  migrateRulesStorage,
  getSettings,
} from "../core/storage";

export async function runOptions(
  engine: Engine,
  colorMap: Record<string, string>,
  iconMap?: Record<string, string>,
): Promise<void> {
  const destinationSelect = document.getElementById("destination-select") as HTMLSelectElement;
  const defaultDestinationSelect = document.getElementById("default-destination-select") as HTMLSelectElement;
  const rulesSearch = document.getElementById("rules-search") as HTMLInputElement;
  const rulesEmpty = document.getElementById("rules-empty") as HTMLElement;

  const modeSelect = document.getElementById("mode-select") as HTMLSelectElement;
  const defaultDestinationRow = document.getElementById("default-destination-row") as HTMLElement;
  const syncToggle = document.getElementById("sync-toggle") as HTMLInputElement;

  const destinationForm = document.getElementById("destination-form") as HTMLFormElement;
  const destinationNameInput = document.getElementById("destination-name-input") as HTMLInputElement;
  const destinationColorSelect = document.getElementById("destination-color-select") as HTMLSelectElement;
  const iconSelectWrap = document.getElementById("icon-select-wrap") as HTMLElement;
  const destinationIconSelect = document.getElementById("destination-icon-select") as HTMLSelectElement;
  const destinationSubmitBtn = document.getElementById("destination-submit-btn") as HTMLButtonElement;
  const destinationCancelBtn = document.getElementById("destination-cancel-btn") as HTMLButtonElement;
  const destinationsList = document.getElementById("destinations-list") as HTMLUListElement;

  const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
  const importBtn = document.getElementById("import-btn") as HTMLButtonElement;
  const importFile = document.getElementById("import-file") as HTMLInputElement;

  let editingDestinationId: string | null = null;

  iconSelectWrap.hidden = !iconMap;

  initRulesUI({
    rulesList: document.getElementById("rules-list") as HTMLUListElement,
    patternInput: document.getElementById("pattern-input") as HTMLInputElement,
    matchTypeSelect: document.getElementById("match-type-select") as HTMLSelectElement,
    destinationSelect,
    submitBtn: document.getElementById("submit-btn") as HTMLButtonElement,
    cancelBtn: document.getElementById("cancel-btn") as HTMLButtonElement,
    matchHint: document.getElementById("match-hint") as HTMLElement,
    form: document.getElementById("add-rule-form") as HTMLFormElement,
    negateCheckbox: document.getElementById("negate-checkbox") as HTMLInputElement,
    colorMap,
    onRulesChanged: () => {
      rulesEmpty.hidden = getRules().length > 0;
    },
  });

  rulesSearch.addEventListener("input", () => {
    const query = rulesSearch.value.toLowerCase().trim();
    const all = getRules();
    const filtered = query
      ? all.filter(
          (r) =>
            r.pattern.toLowerCase().includes(query) ||
            getDestinationName(r.destinationId).toLowerCase().includes(query),
        )
      : all;
    renderRulesList(filtered);
  });

  function populateColorSelect(): void {
    destinationColorSelect.replaceChildren();
    for (const name of Object.keys(colorMap)) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      destinationColorSelect.appendChild(opt);
    }
  }

  function populateIconSelect(): void {
    if (!iconMap) return;
    destinationIconSelect.replaceChildren();
    for (const [value, emoji] of Object.entries(iconMap)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = `${emoji} ${value}`;
      destinationIconSelect.appendChild(opt);
    }
  }

  function renderDestinations(): void {
    destinationsList.replaceChildren();
    for (const d of getDestinations()) {
      const li = document.createElement("li");
      li.className = "container-item";

      const dot = document.createElement("span");
      dot.className = "container-color-dot";
      dot.style.backgroundColor = colorMap[d.color] || "#555";

      const icon = document.createElement("span");
      icon.className = "container-item-icon";
      icon.textContent = (iconMap && d.icon && iconMap[d.icon]) || "";

      const name = document.createElement("span");
      name.className = "container-item-name";
      name.textContent = d.name;

      const actions = document.createElement("div");
      actions.className = "rule-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "✎";
      editBtn.title = "Edit";
      editBtn.addEventListener("click", () => startDestinationEdit(d));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete";
      deleteBtn.addEventListener("click", () => deleteDestination(d.id));

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(dot);
      li.appendChild(icon);
      li.appendChild(name);
      li.appendChild(actions);
      destinationsList.appendChild(li);
    }
  }

  function startDestinationEdit(d: Destination): void {
    editingDestinationId = d.id;
    destinationNameInput.value = d.name;
    destinationColorSelect.value = d.color;
    if (iconMap) destinationIconSelect.value = d.icon || Object.keys(iconMap)[0];
    destinationSubmitBtn.textContent = "Save";
    destinationCancelBtn.hidden = false;
    destinationNameInput.focus();
  }

  function cancelDestinationEdit(): void {
    editingDestinationId = null;
    destinationNameInput.value = "";
    destinationColorSelect.selectedIndex = 0;
    if (iconMap) destinationIconSelect.selectedIndex = 0;
    destinationSubmitBtn.textContent = "Create";
    destinationCancelBtn.hidden = true;
  }

  destinationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = destinationNameInput.value.trim();
    if (!name) return;

    const color = destinationColorSelect.value;
    const icon = iconMap ? destinationIconSelect.value : undefined;

    if (editingDestinationId) {
      await engine.updateDestination(editingDestinationId, { name, color, icon });
      cancelDestinationEdit();
    } else {
      await engine.createDestination({ name, color, icon });
      destinationNameInput.value = "";
    }

    await refreshDestinations();
  });

  destinationCancelBtn.addEventListener("click", cancelDestinationEdit);

  async function deleteDestination(id: string): Promise<void> {
    if (!confirm("Delete this destination? Tabs routed to it will no longer be grouped automatically.")) return;
    await engine.deleteDestination(id);
    if (editingDestinationId === id) cancelDestinationEdit();
    await refreshDestinations();
  }

  async function refreshDestinations(): Promise<void> {
    await loadDestinationList(engine);
    populateDestinationSelect(destinationSelect, "Destination...");
    populateDestinationSelect(defaultDestinationSelect, "Select...");
    renderDestinations();
    renderRulesList(getRules());
  }

  async function applySettings(): Promise<void> {
    const s = await loadSettingsFromStorage();
    modeSelect.value = s.mode;
    syncToggle.checked = s.useSync;
    defaultDestinationSelect.value = s.defaultDestinationId;
    defaultDestinationRow.hidden = s.mode !== "route_all";
  }

  modeSelect.addEventListener("change", () => {
    defaultDestinationRow.hidden = modeSelect.value !== "route_all";
    saveSettingsToStorage({ mode: modeSelect.value as "route_matched" | "route_all" });
  });

  defaultDestinationSelect.addEventListener("change", () => {
    saveSettingsToStorage({ defaultDestinationId: defaultDestinationSelect.value });
  });

  syncToggle.addEventListener("change", async () => {
    const wasSync = getSettings().useSync;
    const nowSync = syncToggle.checked;
    if (wasSync !== nowSync) await migrateRulesStorage(wasSync, nowSync);
    await saveSettingsToStorage({ useSync: nowSync });
    const rules = await loadRulesFromStorage();
    setRules(rules);
    renderRulesList(rules);
  });

  exportBtn.addEventListener("click", async () => {
    const rules = await loadRulesFromStorage();
    const s = await loadSettingsFromStorage();

    const blob = new Blob([JSON.stringify({ version: 2, rules, settings: s }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "air-traffic-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());

      if (!Array.isArray(data.rules)) {
        alert("Invalid file: no rules found.");
        return;
      }

      for (const rule of data.rules) {
        if (rule.cookieStoreId && !rule.destinationId) {
          rule.destinationId = rule.cookieStoreId;
          delete rule.cookieStoreId;
        }
        if (!rule.pattern || !rule.matchType || !rule.destinationId) {
          alert("Invalid file: rules are missing required fields.");
          return;
        }
        if (!rule.id) rule.id = crypto.randomUUID();
      }

      await saveRulesToStorage(data.rules);
      if (data.settings) {
        if (data.settings.defaultContainer && !data.settings.defaultDestinationId) {
          data.settings.defaultDestinationId = data.settings.defaultContainer;
          delete data.settings.defaultContainer;
        }
        await saveSettingsToStorage(data.settings);
        await applySettings();
      }

      setRules(data.rules);
      renderRulesList(data.rules);
      rulesEmpty.hidden = data.rules.length > 0;
    } catch {
      alert("Failed to import: invalid JSON file.");
    }

    importFile.value = "";
  });

  populateColorSelect();
  populateIconSelect();
  await loadDestinationList(engine);
  populateDestinationSelect(destinationSelect, "Destination...");
  populateDestinationSelect(defaultDestinationSelect, "Select...");
  renderDestinations();
  await applySettings();
  const rules = await loadRulesFromStorage();
  setRules(rules);
  renderRulesList(rules);
  rulesEmpty.hidden = rules.length > 0;
}
```

- [ ] **Step 3: Update `src/popup/popup.html`**

Replace the container select block:

```html
    <select id="container-select" required>
      <option value="">Select container...</option>
    </select>
```

with:

```html
    <select id="destination-select" required>
      <option value="">Select destination...</option>
    </select>
```

- [ ] **Step 4: Rewrite `src/options/options.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../shared/shared.css">
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div class="page">
    <header>
      <h1>Air Traffic</h1>
      <p class="subtitle">Automatic URL routing by destination</p>
    </header>

    <div class="grid">
      <!-- Left: Rules -->
      <section class="card">
        <h2>Routing Rules</h2>
        <p class="card-desc">URL patterns matched in order. First match wins.</p>

        <form id="add-rule-form">
          <div class="form-row">
            <select id="match-type-select">
              <option value="domain">Domain (exact)</option>
              <option value="domainContains">Domain contains</option>
              <option value="contains">URL contains</option>
              <option value="wildcard">Wildcard (*)</option>
              <option value="regex">Regex (advanced)</option>
            </select>
            <select id="destination-select" required>
              <option value="">Destination...</option>
            </select>
          </div>
          <input type="text" id="pattern-input" placeholder="github.com" required>
          <label class="negate-toggle">
            <input type="checkbox" id="negate-checkbox">
            <span>Exclude (match everything EXCEPT)</span>
          </label>
          <span id="match-hint" class="hint">Matches github.com and all subdomains</span>
          <div class="form-actions">
            <button type="submit" id="submit-btn">Add Rule</button>
            <button type="button" id="cancel-btn" class="btn-secondary" hidden>Cancel</button>
          </div>
        </form>

        <div class="rules-header">
          <input type="text" id="rules-search" placeholder="Filter rules...">
        </div>
        <ul id="rules-list"></ul>
        <p id="rules-empty" class="empty-msg" hidden>No rules yet. Add one above.</p>
      </section>

      <!-- Right: Destinations + Settings -->
      <div class="sidebar">
        <section class="card">
          <h2>Destinations</h2>
          <form id="destination-form">
            <input type="text" id="destination-name-input" placeholder="Destination name" required>
            <div class="form-row">
              <select id="destination-color-select">
                <!-- populated by JS from the active engine's color palette -->
              </select>
              <span id="icon-select-wrap">
                <select id="destination-icon-select">
                  <!-- populated by JS with emojis (Firefox only) -->
                </select>
              </span>
            </div>
            <div class="form-actions">
              <button type="submit" id="destination-submit-btn">Create</button>
              <button type="button" id="destination-cancel-btn" class="btn-secondary" hidden>Cancel</button>
            </div>
          </form>
          <ul id="destinations-list"></ul>
        </section>

        <section class="card">
          <h2>Settings</h2>
          <label class="setting-row">
            <span>Routing mode</span>
            <select id="mode-select">
              <option value="route_matched">Route matched URLs</option>
              <option value="route_all">Route all except matched</option>
            </select>
          </label>
          <div id="default-destination-row" class="setting-row" hidden>
            <span>Default destination</span>
            <select id="default-destination-select">
              <option value="">Select...</option>
            </select>
          </div>
          <label class="setting-row">
            <input type="checkbox" id="sync-toggle">
            <span>Sync rules across devices</span>
          </label>
        </section>

        <section class="card">
          <h2>Data</h2>
          <div class="data-actions">
            <button id="export-btn" class="btn-secondary">Export rules</button>
            <button id="import-btn" class="btn-secondary">Import rules</button>
            <input type="file" id="import-file" accept=".json" hidden>
          </div>
        </section>
      </div>
    </div>

    <footer>
      <a href="https://github.com/avelino/firefox-airtraffic" target="_blank">GitHub</a>
    </footer>
  </div>

  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Stage the files**

```bash
git add src/ui/popup.ts src/ui/options.ts src/popup/popup.html src/options/options.html
```

---

### Task 15: Entrypoints (6 files)

**Files:**
- Create: `src/entrypoints/firefox/background.ts`
- Create: `src/entrypoints/firefox/popup.ts`
- Create: `src/entrypoints/firefox/options.ts`
- Create: `src/entrypoints/chrome/background.ts`
- Create: `src/entrypoints/chrome/popup.ts`
- Create: `src/entrypoints/chrome/options.ts`

**Interfaces:**
- Consumes: `runBackground` (Task 13), `runPopup`/`runOptions` (Task 14), `firefoxEngine` (Task 9), `chromeEngine` + `polyfill` (Task 10), `CONTAINER_COLORS`/`CONTAINER_ICONS` (Task 8), `CHROME_GROUP_COLORS` (Task 8).
- Produces: 6 tiny entry modules — used by Task 16 (build.mjs) as esbuild entry points.

- [ ] **Step 1: Write `src/entrypoints/firefox/background.ts`**

```ts
import { runBackground } from "../../ui/background";
import { firefoxEngine } from "../../engines/firefox";

runBackground(firefoxEngine);
```

- [ ] **Step 2: Write `src/entrypoints/firefox/popup.ts`**

```ts
import { runPopup } from "../../ui/popup";
import { firefoxEngine } from "../../engines/firefox";
import { CONTAINER_COLORS } from "../../engines/firefox/colors";

runPopup(firefoxEngine, CONTAINER_COLORS);
```

- [ ] **Step 3: Write `src/entrypoints/firefox/options.ts`**

```ts
import { runOptions } from "../../ui/options";
import { firefoxEngine } from "../../engines/firefox";
import { CONTAINER_COLORS, CONTAINER_ICONS } from "../../engines/firefox/colors";

runOptions(firefoxEngine, CONTAINER_COLORS, CONTAINER_ICONS);
```

- [ ] **Step 4: Write `src/entrypoints/chrome/background.ts`**

```ts
import "../../engines/chrome/polyfill";
import { runBackground } from "../../ui/background";
import { chromeEngine } from "../../engines/chrome";

runBackground(chromeEngine);
```

- [ ] **Step 5: Write `src/entrypoints/chrome/popup.ts`**

```ts
import "../../engines/chrome/polyfill";
import { runPopup } from "../../ui/popup";
import { chromeEngine } from "../../engines/chrome";
import { CHROME_GROUP_COLORS } from "../../engines/chrome/colors";

runPopup(chromeEngine, CHROME_GROUP_COLORS);
```

- [ ] **Step 6: Write `src/entrypoints/chrome/options.ts`**

```ts
import "../../engines/chrome/polyfill";
import { runOptions } from "../../ui/options";
import { chromeEngine } from "../../engines/chrome";
import { CHROME_GROUP_COLORS } from "../../engines/chrome/colors";

runOptions(chromeEngine, CHROME_GROUP_COLORS);
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Stage the files**

```bash
git add src/entrypoints
```

---

### Task 16: Manifests (MV3, both engines)

**Files:**
- Create: `manifests/firefox.json`
- Create: `manifests/chrome.json`

**Interfaces:**
- Produces: the two manifest sources read by `build.mjs` (Task 17).

- [ ] **Step 1: Write `manifests/firefox.json`**

```json
{
  "manifest_version": 3,
  "name": "Air Traffic",
  "version": "2.0.0",
  "description": "Automatic URL routing to destinations (Firefox containers or Chrome tab groups). On Zen Browser, pairs with workspaces for auto-switching.",
  "author": "Thiago Avelino <avelinorun@gmail.com>",
  "homepage_url": "https://github.com/avelino/firefox-airtraffic",
  "icons": {
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png"
  },
  "permissions": ["contextualIdentities", "cookies", "tabs", "contextMenus", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "scripts": ["background.js"]
  },
  "action": {
    "default_icon": {
      "48": "icons/icon-48.png",
      "96": "icons/icon-96.png"
    },
    "default_title": "Air Traffic",
    "default_popup": "popup/popup.html"
  },
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": true
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "air-traffic@avelino",
      "data_collection_permissions": {
        "required": ["none"]
      }
    }
  }
}
```

- [ ] **Step 2: Write `manifests/chrome.json`**

```json
{
  "manifest_version": 3,
  "name": "Air Traffic",
  "version": "2.0.0",
  "description": "Automatic URL routing to destinations (Firefox containers or Chrome tab groups).",
  "author": "Thiago Avelino <avelinorun@gmail.com>",
  "homepage_url": "https://github.com/avelino/firefox-airtraffic",
  "icons": {
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png"
  },
  "permissions": ["tabGroups", "tabs", "contextMenus", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_icon": {
      "48": "icons/icon-48.png",
      "96": "icons/icon-96.png"
    },
    "default_title": "Air Traffic",
    "default_popup": "popup/popup.html"
  },
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": true
  }
}
```

- [ ] **Step 3: Stage the files**

```bash
git add manifests/firefox.json manifests/chrome.json
```

---

### Task 17: Build system — multi-target `build.mjs` + `package.json` scripts

**Files:**
- Modify: `build.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `manifests/<target>.json` (Task 16), `src/entrypoints/<target>/*.ts` (Task 15).
- Produces: `dist/firefox/**`, `dist/chrome/**` build outputs.

- [ ] **Step 1: Rewrite `build.mjs`**

```js
import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";

const watch = process.argv.includes("--watch");
const targetArg = process.argv.find((a) => a.startsWith("--target="));
const targets = targetArg ? [targetArg.split("=")[1]] : ["firefox", "chrome"];

const staticFiles = [
  ["icons", "icons"],
  ["src/popup/popup.html", "popup/popup.html"],
  ["src/popup/popup.css", "popup/popup.css"],
  ["src/options/options.html", "options/options.html"],
  ["src/options/options.css", "options/options.css"],
  ["src/shared/shared.css", "shared/shared.css"],
];

async function buildTarget(target) {
  const dist = `dist/${target}`;
  rmSync(dist, { recursive: true, force: true });

  for (const [src, dest] of staticFiles) {
    const outPath = `${dist}/${dest}`;
    mkdirSync(outPath.substring(0, outPath.lastIndexOf("/")), { recursive: true });
    cpSync(src, outPath, { recursive: true });
  }

  const manifest = JSON.parse(readFileSync(`manifests/${target}.json`, "utf-8"));
  writeFileSync(`${dist}/manifest.json`, JSON.stringify(manifest, null, 2));

  const options = {
    entryPoints: [
      { in: `src/entrypoints/${target}/background.ts`, out: "background" },
      { in: `src/entrypoints/${target}/popup.ts`, out: "popup/popup" },
      { in: `src/entrypoints/${target}/options.ts`, out: "options/options" },
    ],
    bundle: true,
    outdir: dist,
    format: "iife",
    platform: "browser",
    target: target === "firefox" ? "firefox115" : "chrome115",
    minify: !watch,
    logLevel: "info",
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log(`Watching ${target} for changes...`);
  } else {
    await build(options);
  }
}

for (const target of targets) {
  await buildTarget(target);
}
```

- [ ] **Step 2: Update `package.json` scripts and devDependencies**

Replace the `"scripts"` block:

```json
  "scripts": {
    "build": "node build.mjs",
    "package": "node build.mjs && web-ext build --source-dir dist --overwrite-dest",
    "watch": "node build.mjs --watch",
    "test": "node --import tsx --test tests/**/*.test.ts",
    "lint": "npx web-ext lint --source-dir dist",
    "typecheck": "tsc --noEmit"
  },
```

with:

```json
  "scripts": {
    "build": "node build.mjs",
    "build:firefox": "node build.mjs --target=firefox",
    "build:chrome": "node build.mjs --target=chrome",
    "watch": "node build.mjs --watch",
    "package:firefox": "npm run build:firefox && web-ext build --source-dir dist/firefox --overwrite-dest --artifacts-dir web-ext-artifacts/firefox",
    "package:chrome": "npm run build:chrome && mkdir -p web-ext-artifacts/chrome && cd dist/chrome && zip -r -X ../../web-ext-artifacts/chrome/air-traffic-chrome.zip . && cd ../..",
    "test": "node --import tsx --test tests/**/*.test.ts",
    "lint": "npx web-ext lint --source-dir dist/firefox",
    "typecheck": "tsc --noEmit"
  },
```

(`webextension-polyfill` was already added to `devDependencies` by `npm install` in Task 10, Step 5 — no manual edit needed there.)

- [ ] **Step 3: Add `web-ext-artifacts/` to `.gitignore`**

Append to `.gitignore`:

```
web-ext-artifacts/
```

- [ ] **Step 4: Build both targets**

Run: `npm run build`
Expected: `dist/firefox/manifest.json` and `dist/chrome/manifest.json` exist with the right `background`/`permissions` fields; `dist/<target>/{background.js,popup/popup.js,options/options.js}` all exist

- [ ] **Step 5: Stage the files**

```bash
git add build.mjs package.json .gitignore
```

---

### Task 18: Cutover — delete old files, update README, final verification

**Files:**
- Delete: `src/types.ts`, `src/pattern-matcher.ts`, `src/route-resolver.ts`, `src/shared/storage.ts`, `src/shared/constants.ts`, `src/shared/containers.ts`, `src/shared/rules-ui.ts`, `src/background.ts`, `src/popup/popup.ts`, `src/options/options.ts`, `manifest.json` (root)
- Modify: `src/types/browser.d.ts` (drop now-unused `menus`/`browserAction` namespaces)
- Modify: `README.md`

**Interfaces:** none — this task only removes now-dead code and updates docs; nothing in later tasks depends on it (it's the last task).

- [ ] **Step 1: Delete the obsolete files**

```bash
git rm src/types.ts src/pattern-matcher.ts src/route-resolver.ts \
  src/shared/storage.ts src/shared/constants.ts src/shared/containers.ts src/shared/rules-ui.ts \
  src/background.ts src/popup/popup.ts src/options/options.ts \
  manifest.json
```

- [ ] **Step 2: Remove the now-unused `menus`/`browserAction` namespaces from `src/types/browser.d.ts`**

Delete these two blocks (everything else in the file stays):

```ts
  namespace menus {
    function create(props: { id: string; title: string; contexts: string[] }): void;
    function removeAll(): Promise<void>;
    const onClicked: BrowserEvent<(info: MenuClickInfo, tab?: Tab) => void>;
  }
```

```ts
  namespace browserAction {
    function setBadgeText(details: { text: string }): void;
    function setBadgeBackgroundColor(details: { color: string }): void;
  }
```

- [ ] **Step 3: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS — no leftover references to any deleted file

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all 9 test files PASS (`constants`, `pattern-matcher`, `route-resolver`, `storage-migration`, `chrome-group-planner`, `firefox-colors`, `chrome-colors`, `firefox-engine`, `chrome-engine`)

- [ ] **Step 5: Build both targets from a clean state**

```bash
rm -rf dist
npm run build
ls dist/firefox dist/chrome
```

Expected: both `dist/firefox/` and `dist/chrome/` contain `manifest.json`, `background.js`, `popup/popup.js`, `popup/popup.html`, `popup/popup.css`, `options/options.js`, `options/options.html`, `options/options.css`, `shared/shared.css`, `icons/`

- [ ] **Step 6: Update `README.md`**

Replace the **Installation → Build from source** section:

```bash
git clone https://github.com/avelino/firefox-airtraffic.git
cd firefox-airtraffic
npx web-ext build
# Output: web-ext-artifacts/zen_air_traffic-1.0.0.zip
```

with:

```bash
git clone https://github.com/avelino/firefox-airtraffic.git
cd firefox-airtraffic
npm install
npm run package:firefox   # -> web-ext-artifacts/firefox/*.zip
npm run package:chrome    # -> web-ext-artifacts/chrome/air-traffic-chrome.zip
```

Replace the **Project structure** section:

```
firefox-airtraffic/
├── manifest.json              # Extension manifest (Manifest V2)
├── src/
│   ├── pattern-matcher.js     # URL matching logic (pure, no browser deps)
│   ├── background.js          # Tab interception and container routing
│   └── popup/
│       ├── popup.html         # Rule management UI
│       ├── popup.css
│       └── popup.js           # CRUD for routing rules
├── icons/
│   ├── icon-48.png
│   └── icon-96.png
└── tests/
    └── pattern-matcher.test.js
```

with:

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

Replace the **Technical details** section's first bullet:

```
- **Manifest V2** — Firefox/Zen has better container API support in V2
```

with:

```
- **Manifest V3** — both engines target MV3; Firefox uses an event page (`background.scripts`), Chrome uses a service worker
- **Multi-engine core** — routing logic lives in `src/core/` and is shared; `src/engines/{firefox,chrome}` each implement the same `Engine` interface (containers vs. tab groups)
```

Replace the **Compatibility** table:

```
| Browser | Container routing | Workspace switching |
|---------|------------------|---------------------|
| Firefox | Yes | N/A |
| Zen Browser | Yes | Yes (via container-workspace pairing) |
| Other Firefox forks | Yes (if `contextualIdentities` API is supported) | Depends on fork |
```

with:

```
| Browser | Destination mechanism | Cookie/session isolation | Workspace switching |
|---------|------------------------|---------------------------|---------------------|
| Firefox | Container (`contextualIdentities`) | Yes | N/A |
| Zen Browser | Container | Yes | Yes (via container-workspace pairing) |
| Other Firefox forks | Container (if `contextualIdentities` is supported) | Yes | Depends on fork |
| Chrome / Chromium | Tab Group (`tabGroups`) | No — visual grouping only | N/A |
```

Replace the **Permissions** table:

```
| Permission | Why |
|------------|-----|
| `contextualIdentities` | Read/manage Firefox containers |
| `cookies` | Required by `contextualIdentities` |
| `tabs` | Intercept navigation and create/remove tabs |
| `storage` | Persist routing rules |
| `<all_urls>` | Match URLs across all sites |
```

with:

```
| Permission | Firefox | Chrome | Why |
|------------|---------|--------|-----|
| `contextualIdentities` | Yes | — | Read/manage Firefox containers |
| `cookies` | Yes | — | Required by `contextualIdentities` |
| `tabGroups` | — | Yes | Read/manage Chrome tab groups |
| `tabs` | Yes | Yes | Intercept navigation, create/remove/group tabs |
| `contextMenus` | Yes | Yes | "Open in destination" link menu |
| `storage` | Yes | Yes | Persist routing rules and destinations |
| `<all_urls>` (host permission) | Yes | Yes | Match URLs across all sites |
```

- [ ] **Step 7: Stage the files**

```bash
git add -A
git status
```

Expected: no untracked/unstaged files remain; the diff shows the full old-tree deletion + new-tree addition. **Do not commit** — hand this off to the user to review and commit manually (global git policy blocks `git commit` for this assistant).

- [ ] **Step 8: Manual smoke test (cannot be automated from this environment)**

Document for the user to run themselves:

1. Firefox: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `dist/firefox/manifest.json`. Create a rule (e.g. `github.com` → a container), navigate to `github.com`, confirm the tab reopens in that container.
2. Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `dist/chrome/`. Create a destination + rule, navigate to a matching URL, confirm the tab gets grouped into a same-named, same-colored tab group.
3. In both: right-click a link → **Open in `<destination>`** → confirm it opens correctly routed.
4. In both: toggle **Sync rules across devices**, confirm rules persist across the toggle.
