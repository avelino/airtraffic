import type { Engine, EngineTab } from "../../core/engine";
import type { Destination, NewDestination } from "../../core/types";
import { loadDestinationsFromStorage, saveDestinationsToStorage } from "../../core/storage";
import { planGroupAction } from "./group-planner";
import { CHROME_GROUP_COLORS } from "./colors";

async function findDestination(id: string): Promise<Destination | undefined> {
  const destinations = await loadDestinationsFromStorage();
  return destinations.find((d) => d.id === id);
}

async function findDestinationByGroupTitle(title: string): Promise<Destination | undefined> {
  const destinations = await loadDestinationsFromStorage();
  return destinations.find((d) => d.name === title);
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
  try {
    const group = await browser.tabGroups.get(tab.groupId);
    const destination = await findDestinationByGroupTitle(group.title);
    return destination?.id ?? "";
  } catch (err) {
    console.warn(`[Air Traffic] Tab group ${tab.groupId} could not be read`, err);
    return "";
  }
}

// Serializes the query -> create window per window+destination, so a burst of
// concurrent routes to the same new destination cannot create duplicate groups.
const pendingGroups = new Map<string, Promise<number>>();

async function resolveGroupId(tab: EngineTab, destination: Destination): Promise<number> {
  const key = `${tab.windowId}:${destination.name}`;
  const pending = pendingGroups.get(key);
  if (pending) return pending;

  const resolving = (async () => {
    const existingGroups = await browser.tabGroups.query({ windowId: tab.windowId, title: destination.name });
    const plan = planGroupAction(existingGroups, destination.name);
    if (plan.action === "reuse") return plan.groupId;

    const groupId = await browser.tabs.group({ tabIds: [tab.id] });
    await browser.tabGroups.update(groupId, { title: destination.name, color: destination.color });
    return groupId;
  })();

  pendingGroups.set(key, resolving);
  try {
    return await resolving;
  } finally {
    pendingGroups.delete(key);
  }
}

async function applyRoute(tab: EngineTab, destinationId: string): Promise<boolean> {
  const destination = await findDestination(destinationId);
  if (!destination) {
    console.warn(`[Air Traffic] Destination ${destinationId} not found, skipping route`);
    return false;
  }

  try {
    const groupId = await resolveGroupId(tab, destination);
    await browser.tabs.group({ tabIds: [tab.id], groupId });
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
  colors: CHROME_GROUP_COLORS,
  listDestinations: loadDestinationsFromStorage,
  createDestination,
  updateDestination,
  deleteDestination,
  shouldSkip,
  currentDestinationId,
  applyRoute,
  openInDestination,
  onDestinationsChanged,
};
