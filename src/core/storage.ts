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

export async function migrateStorageArea(fromSync: boolean, toSync: boolean): Promise<void> {
  const oldStorage = fromSync ? browser.storage.sync : browser.storage.local;
  const newStorage = toSync ? browser.storage.sync : browser.storage.local;
  const data = await oldStorage.get(["rules", "destinations"]);
  const rawRules = (data.rules as Record<string, unknown>[]) || [];
  await newStorage.set({
    rules: rawRules.map(migrateRuleSchema),
    destinations: (data.destinations as Destination[]) || [],
  });
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
