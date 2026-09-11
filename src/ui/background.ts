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

  // MV3 backgrounds are non-persistent: the event that wakes the worker is
  // dispatched right after this module runs, while the first storage read is
  // still in flight. Every routing decision must await this gate.
  let ready = loadRules();

  function showBadge(text: string): void {
    browser.action.setBadgeText({ text });
    browser.action.setBadgeBackgroundColor({ color: "#2ecc71" });
    setTimeout(() => browser.action.setBadgeText({ text: "" }), BADGE_CLEAR_MS);
  }

  async function handleTabUpdate(tabId: number, changeInfo: TabChangeInfo, tab: Tab): Promise<void> {
    if (!changeInfo.url) return;
    await ready;
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
      ready = loadRules();
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

  buildContextMenus();
}
