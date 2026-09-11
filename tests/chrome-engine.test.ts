import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chromeEngine } from "../src/engines/chrome";

function installFakeBrowser() {
  const store: Record<string, unknown> = {};
  const groups: Array<{ id: number; title: string; color: string; windowId: number }> = [];
  const groupedTabs: Record<number, number> = {};
  const createdTabs: Array<{ id: number; url?: string; active?: boolean; index?: number; windowId?: number }> = [];
  const control = { throwOnQuery: false };
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
        if (control.throwOnQuery) throw new Error("simulated tabGroups.query failure");
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
        const tab = { id: nextTabId++, ...props };
        createdTabs.push(tab);
        return tab;
      },
    },
  };

  return { store, groups, groupedTabs, createdTabs, control };
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

  it("currentDestinationId returns empty string when the group no longer exists", async () => {
    installFakeBrowser();
    const id = await chromeEngine.currentDestinationId({ id: 5, windowId: 1, index: 0, active: true, groupId: 99 });
    assert.equal(id, "");
  });

  it("concurrent routes to the same new destination create exactly one group", async () => {
    const fake = installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });

    const [a, b] = await Promise.all([
      chromeEngine.applyRoute({ id: 5, windowId: 1, index: 0, active: true }, dest.id),
      chromeEngine.applyRoute({ id: 6, windowId: 1, index: 1, active: false }, dest.id),
    ]);

    assert.equal(a, true);
    assert.equal(b, true);
    assert.equal(fake.groups.length, 1);
    assert.equal(fake.groupedTabs[5], fake.groups[0].id);
    assert.equal(fake.groupedTabs[6], fake.groups[0].id);
  });

  it("concurrent routes to different windows create one group per window", async () => {
    const fake = installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });

    await Promise.all([
      chromeEngine.applyRoute({ id: 5, windowId: 1, index: 0, active: true }, dest.id),
      chromeEngine.applyRoute({ id: 6, windowId: 2, index: 0, active: true }, dest.id),
    ]);

    assert.equal(fake.groups.length, 2);
  });

  it("openInDestination creates a tab and groups it into the destination", async () => {
    const fake = installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });

    await chromeEngine.openInDestination("https://github.com", dest.id, {
      id: 1,
      windowId: 1,
      index: 0,
      active: true,
    });

    assert.equal(fake.createdTabs.length, 1);
    const createdTab = fake.createdTabs[0];
    assert.equal(createdTab.url, "https://github.com");
    assert.equal(fake.groups.length, 1);
    assert.equal(fake.groups[0].title, "Work");
    assert.equal(fake.groupedTabs[createdTab.id], fake.groups[0].id);
  });

  it("applyRoute returns false and does not throw when a browser call rejects", async () => {
    const fake = installFakeBrowser();
    const dest = await chromeEngine.createDestination({ name: "Work", color: "blue" });
    fake.control.throwOnQuery = true;

    const routed = await chromeEngine.applyRoute({ id: 5, windowId: 1, index: 0, active: true }, dest.id);

    assert.equal(routed, false);
  });
});
