import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  migrateStorageArea,
  loadSettingsFromStorage,
  saveSettingsToStorage,
  loadRulesFromStorage,
  saveRulesToStorage,
  loadDestinationsFromStorage,
  saveDestinationsToStorage,
} from "../src/core/storage";

function fakeArea(backing: Record<string, unknown>) {
  return {
    async get(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of list) out[key] = backing[key];
      return out;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(backing, items);
    },
  };
}

function installFakeBrowser() {
  const local: Record<string, unknown> = {};
  const sync: Record<string, unknown> = {};
  (globalThis as any).browser = {
    storage: { local: fakeArea(local), sync: fakeArea(sync) },
  };
  return { local, sync };
}

describe("migrateStorageArea", () => {
  it("moves rules AND destinations from local to sync", async () => {
    const fake = installFakeBrowser();
    fake.local.rules = [{ id: "r1", pattern: "github.com", matchType: "domain", destinationId: "d1" }];
    fake.local.destinations = [{ id: "d1", name: "Work", color: "blue" }];

    await migrateStorageArea(false, true);

    assert.deepEqual(fake.sync.rules, fake.local.rules);
    assert.deepEqual(fake.sync.destinations, [{ id: "d1", name: "Work", color: "blue" }]);
  });

  it("moves both keys back from sync to local", async () => {
    const fake = installFakeBrowser();
    fake.sync.rules = [{ id: "r1", pattern: "slack.com", matchType: "domain", destinationId: "d2" }];
    fake.sync.destinations = [{ id: "d2", name: "Chat", color: "red" }];

    await migrateStorageArea(true, false);

    assert.deepEqual(fake.local.destinations, [{ id: "d2", name: "Chat", color: "red" }]);
    assert.equal((fake.local.rules as unknown[]).length, 1);
  });

  it("applies the rule schema migration while moving", async () => {
    const fake = installFakeBrowser();
    fake.local.rules = [{ id: "r1", pattern: "github.com", matchType: "domain", cookieStoreId: "container-dev" }];

    await migrateStorageArea(false, true);

    const moved = fake.sync.rules as Record<string, unknown>[];
    assert.equal(moved[0]!.destinationId, "container-dev");
    assert.equal(moved[0]!.cookieStoreId, undefined);
  });

  it("writes empty arrays when the source area holds nothing", async () => {
    const fake = installFakeBrowser();

    await migrateStorageArea(false, true);

    assert.deepEqual(fake.sync.rules, []);
    assert.deepEqual(fake.sync.destinations, []);
  });
});

describe("storage area selection", () => {
  it("rules and destinations follow useSync", async () => {
    const fake = installFakeBrowser();
    await loadSettingsFromStorage();

    await saveRulesToStorage([{ id: "r1", pattern: "a.com", matchType: "domain", destinationId: "d1" }]);
    await saveDestinationsToStorage([{ id: "d1", name: "Work", color: "blue" }]);
    assert.ok(fake.local.rules);
    assert.ok(fake.local.destinations);
    assert.equal(fake.sync.rules, undefined);

    await saveSettingsToStorage({ useSync: true });
    assert.deepEqual(await loadRulesFromStorage(), []);
    assert.deepEqual(await loadDestinationsFromStorage(), []);
  });

  it("destinations survive toggling sync on (regression: they used to vanish)", async () => {
    const fake = installFakeBrowser();
    await loadSettingsFromStorage();

    await saveRulesToStorage([{ id: "r1", pattern: "a.com", matchType: "domain", destinationId: "d1" }]);
    await saveDestinationsToStorage([{ id: "d1", name: "Work", color: "blue" }]);

    await migrateStorageArea(false, true);
    await saveSettingsToStorage({ useSync: true });

    assert.deepEqual(await loadDestinationsFromStorage(), [{ id: "d1", name: "Work", color: "blue" }]);
    assert.equal((await loadRulesFromStorage()).length, 1);
    assert.ok(fake.sync.destinations);
  });
});
