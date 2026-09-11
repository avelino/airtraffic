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
