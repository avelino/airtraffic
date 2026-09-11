import type { Engine, EngineTab } from "../../core/engine";
import type { NewDestination } from "../../core/types";
import { CONTAINER_COLORS, CONTAINER_ICONS } from "./colors";

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

  try {
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

    Promise.resolve(browser.tabs.remove(tab.id)).catch((err) => {
      console.warn(`[Air Traffic] Failed to close original tab ${tab.id}`, err);
    });
    return true;
  } catch (err) {
    console.warn(`[Air Traffic] Failed to reopen tab ${tab.id} in ${destinationId}`, err);
    return false;
  }
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
  colors: CONTAINER_COLORS,
  icons: CONTAINER_ICONS,
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
