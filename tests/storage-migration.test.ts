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
